// Faux client Supabase pour les tests des Server Actions des cartes : une table « maps » en mémoire.
// Volontairement SANS politique RLS : les tests vérifient que les actions filtrent elles-mêmes
// sur user_id (les politiques de la base sont testées à part, avec PGlite). Les déclencheurs de la
// migration (updated_at, revision, stats) sont imités, ainsi que les droits : pas d'INSERT ni
// d'UPDATE direct du contenu, qui s'écrit par les fonctions create_map et update_map_data (rpc).

export type MapRow = {
  id: string;
  user_id: string;
  name: string;
  data: unknown;
  stats: unknown;
  revision: number;
  created_at: string;
  updated_at: string;
};

type DbError = { code: string; message: string };
type Result = { data: unknown; error: DbError | null };
type RpcResult = { rows: MapRow[]; error: DbError | null };

export type FakeDb = {
  rows: MapRow[];
  /** Erreur renvoyée par la prochaine requête (puis effacée). */
  failNext: DbError | null;
  /** Colonnes écrites par les requêtes update directes (pour vérifier ce qui part en base). */
  writes: Record<string, unknown>[];
  /** Appels des fonctions de la base (rpc), avec leurs arguments. */
  calls: { fn: string; args: Record<string, unknown> }[];
  /** Client « connecté » en tant que `userId` (auth.uid() pour les valeurs par défaut). */
  clientFor: (userId: string) => unknown;
};

let clock = Date.UTC(2026, 9, 5, 12);
const now = () => new Date((clock += 1000)).toISOString().replace("Z", "+00:00");

let ids = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Comme le déclencheur maps_compute_stats de la migration. */
function statsColumn(data: unknown) {
  if (!isObject(data) || !isObject(data.notes)) return null;
  const lists = ["links", "pings", "zones", "texts"] as const;
  if (!lists.every((key) => Array.isArray(data[key]))) return null;
  const length = (key: (typeof lists)[number]) => (data[key] as unknown[]).length;
  return {
    notes: Object.keys(data.notes).length,
    links: length("links"),
    pings: length("pings"),
    zones: length("zones"),
    texts: length("texts"),
  };
}

const pick = (row: MapRow, columns: string[]) => Object.fromEntries(columns.map((c) => [c, row[c as keyof MapRow]]));

/** Droits de la base : ni création directe, ni écriture directe du contenu. */
const DENIED: Result = { data: null, error: { code: "42501", message: "permission denied for table maps" } };

/** Colonnes renvoyées par les fonctions d'écriture. */
const WRITE_RESULT_COLUMNS = ["id", "name", "updated_at", "revision"];

/** Requête « thenable » de supabase-js, lue telle quelle, avec single() ou avec maybeSingle(). */
function thenable(resolve: (single: "one" | "maybe" | null) => Result) {
  let single: "one" | "maybe" | null = null;
  const query = {
    single() {
      single = "one";
      return query;
    },
    maybeSingle() {
      single = "maybe";
      return query;
    },
    then<T>(onResult: (result: Result) => T, onError?: (error: unknown) => T) {
      try {
        return Promise.resolve(onResult(resolve(single)));
      } catch (error) {
        return onError ? Promise.resolve(onError(error)) : Promise.reject(error);
      }
    },
  };
  return query;
}

/** Lignes renvoyées selon single() / maybeSingle(), comme PostgREST. */
function shape(data: Record<string, unknown>[], single: "one" | "maybe" | null): Result {
  if (single === "one") {
    return data.length === 1
      ? { data: data[0], error: null }
      : { data: null, error: { code: "PGRST116", message: "no rows" } };
  }
  if (single === "maybe") return { data: data[0] ?? null, error: null };
  return { data, error: null };
}

export function createFakeDb(): FakeDb {
  const db: FakeDb = { rows: [], failNext: null, writes: [], calls: [], clientFor: () => null };

  /** Erreur prévue par le test (failNext), consommée par la prochaine requête. */
  const takeFailure = (): DbError | null => {
    const failure = db.failNext;
    db.failNext = null;
    return failure;
  };

  /** Comme public.create_map : identifiant tiré par la base, user_id = auth.uid(). */
  function createRow(userId: string, args: Record<string, unknown>): RpcResult {
    const data = JSON.parse(String(args.p_data));
    const stamp = now();
    const row: MapRow = {
      id: nextId(),
      user_id: userId,
      name: String(args.p_name),
      data,
      stats: statsColumn(data),
      revision: 1,
      created_at: stamp,
      updated_at: stamp,
    };
    db.rows.push(row);
    return { rows: [row], error: null };
  }

  /**
   * Comme public.update_map_data : aucune ligne si la carte n'est pas à l'utilisateur, conflit si
   * elle n'est plus à la version attendue. La version ne change que si le contenu change.
   */
  function updateRow(userId: string, args: Record<string, unknown>): RpcResult {
    const row = db.rows.find((r) => r.id === args.p_id && r.user_id === userId);
    if (!row) return { rows: [], error: null };
    if (row.revision !== args.p_expected_revision) {
      return { rows: [], error: { code: "P0001", message: "maps_conflict" } };
    }
    const data = JSON.parse(String(args.p_data));
    const changed = JSON.stringify(data) !== JSON.stringify(row.data);
    Object.assign(row, { data, stats: statsColumn(data), updated_at: now(), revision: row.revision + (changed ? 1 : 0) });
    return { rows: [row], error: null };
  }

  db.clientFor = (userId: string) => ({
    from(table: string) {
      if (table !== "maps") throw new Error(`table inconnue : ${table}`);
      let operation: "select" | "insert" | "update" | "delete" = "select";
      let payload: Record<string, unknown> = {};
      let columns: string[] = [];
      const filters: [string, unknown][] = [];

      const matches = (row: MapRow) => filters.every(([column, value]) => row[column as keyof MapRow] === value);

      const run = (single: "one" | "maybe" | null): Result => {
        const failure = takeFailure();
        if (failure) return { data: null, error: failure };
        if (operation === "insert" || (operation === "update" && "data" in payload)) return DENIED;
        let affected: MapRow[];
        if (operation === "update") {
          db.writes.push(payload);
          affected = db.rows.filter(matches);
          for (const row of affected) Object.assign(row, payload);
        } else if (operation === "delete") {
          affected = db.rows.filter(matches);
          db.rows = db.rows.filter((row) => !matches(row));
        } else {
          affected = db.rows.filter(matches).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        }
        if (operation === "delete" && columns.length === 0) return { data: null, error: null };
        return shape(
          affected.map((row) => pick(row, columns)),
          single,
        );
      };

      const result = thenable(run);
      const query = Object.assign(result, {
        select(list: string) {
          columns = list.split(",").map((c) => c.trim());
          return query;
        },
        insert(values: Record<string, unknown>) {
          operation = "insert";
          payload = values;
          return query;
        },
        update(values: Record<string, unknown>) {
          operation = "update";
          payload = values;
          return query;
        },
        delete() {
          operation = "delete";
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
      });
      return query;
    },

    rpc(fn: string, args: Record<string, unknown>) {
      return thenable((single) => {
        const failure = takeFailure();
        if (failure) return { data: null, error: failure };
        db.calls.push({ fn, args });
        let result: RpcResult;
        if (fn === "create_map") result = createRow(userId, args);
        else if (fn === "update_map_data") result = updateRow(userId, args);
        else throw new Error(`fonction inconnue : ${fn}`);
        if (result.error) return { data: null, error: result.error };
        return shape(
          result.rows.map((row) => pick(row, WRITE_RESULT_COLUMNS)),
          single,
        );
      });
    },
  });

  return db;
}
