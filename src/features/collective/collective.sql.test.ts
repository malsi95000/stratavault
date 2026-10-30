// Carte collective et modération dans la base (supabase/migrations/20261020120000_collective_map.sql),
// sur un vrai PostgreSQL (PGlite) avec les droits de l'API : aucune lecture ni écriture directe des
// tables, contributions signées (chacun ses éléments), contrôle du contenu, liens, blocages,
// signalements, modération (masquer, rétablir, supprimer, classer), avis, journal, droit d'accès,
// limites anti-abus et bornes de stockage, suppression des comptes.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS, MIGRATION_FILES, migrationsUpTo, openTestDb, type TestDb } from "@/test/pglite";
import * as limits from "./limits";
import { MIN_ILLEGAL_DETAILS } from "./reportForm";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MODO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EVE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MIGRATION = "20261020120000_collective_map.sql";
const SQL = readFileSync(new URL(`../../../supabase/migrations/${MIGRATION}`, import.meta.url), "utf8");

let t: TestDb;

type Row = Record<string, unknown>;
type MapRow = { id: string; kind: string; data: Row; author_name: string | null; author_handle: string | null; mine: boolean };

const one = async <T = Row>(userId: string | null, sql: string, params: unknown[] = []) =>
  (await t.as<T>(userId, sql, params))[0];
const call = async (userId: string | null, sql: string, params: unknown[] = []) =>
  (await one<{ status: string }>(userId, `select ${sql} as status`, params)).status;

const ping = (title = "Port", ll = [2.35, 48.85]) => ({ ll, type: "crise", title, note: "" });
const link = (a: string, b: string, title = "") => ({ a, b, title, note: "" });
const flux = (points = [[0, 0], [10, 10]]) => ({ color: "rouge", points, width: 3 });
const zone = (ring = [[0, 0], [10, 0], [10, 10], [0, 0]]) => ({ ring, title: "Zone", note: "" });

const create = (userId: string | null, id: string, kind: string, data: unknown) =>
  one<{ status: string; author_name: string | null; created_at: string | null }>(
    userId,
    "select status, author_name, created_at from public.create_collective_item($1, $2, $3)",
    [id, kind, typeof data === "string" ? data : JSON.stringify(data)],
  );
const created = async (userId: string, id: string, kind: string, data: unknown) => {
  expect((await create(userId, id, kind, data)).status).toBe("created");
};
type Written = { status: string; revision_from: string | null; revision_to: string | null };
const written = (userId: string, sql: string, params: unknown[]) =>
  one<Written>(userId, `select status, revision_from::text, revision_to::text from ${sql}`, params);
const update = async (userId: string, id: string, data: unknown) =>
  (await written(userId, "public.update_collective_item($1, $2)", [id, JSON.stringify(data)])).status;
const remove = async (userId: string, id: string) => (await written(userId, "public.delete_collective_item($1)", [id])).status;
const report = (userId: string, id: string, reason = "spam", details = "", goodFaith = false) =>
  call(userId, "public.report_collective_item($1, $2, $3, $4)", [id, reason, details, goodFaith]);
const moderate = (userId: string, id: string, action: string, reason = "Contraire aux règles", suspend: boolean | null = false) =>
  call(userId, "public.moderate_collective_item($1, $2, $3, $4)", [id, action, reason, suspend]);
const map = (userId: string) => t.as<MapRow>(userId, "select * from public.collective_map()");
const ids = async (userId: string) => (await map(userId)).map((r) => r.id);
const state = (userId: string) =>
  one<{ revision: string; is_moderator: boolean; has_profile: boolean; unread_notices: number; my_items: number; suspended_until: Date | null }>(
    userId,
    "select revision::text, is_moderator, has_profile, unread_notices, my_items, suspended_until from public.collective_map_state()",
  );
const notices = (userId: string) =>
  t.as<{ role: string; action: string; item_id: string; item_title: string; reason: string; item_hidden: boolean; read_at: string | null }>(
    userId,
    "select role, action, item_id, item_title, reason, item_hidden, read_at from public.my_collective_notices()",
  );
const hits = async (userId: string, action: string) =>
  (await t.db.query<{ hits: number }>("select hits from public.rate_limits where user_id = $1 and action = $2", [userId, action]))
    .rows[0]?.hits ?? 0;
const setHits = (userId: string, action: string, value: number) =>
  t.db.query(
    `insert into public.rate_limits (user_id, action, window_start, hits) values ($1, $2, now(), $3)
     on conflict (user_id, action) do update set hits = excluded.hits, window_start = now()`,
    [userId, action, value],
  );
const count = async (table: string, where = "true") =>
  (await t.db.query<{ n: number }>(`select count(*)::int as n from public.${table} where ${where}`)).rows[0].n;
const totals = async () =>
  (await t.db.query<{ items: number; bytes: string; path_points: string }>("select items, bytes::text, path_points::text from public.collective_state")).rows[0];
/**
 * Fait passer 24 heures sur les éléments ajoutés ou modifiés depuis moins de 24 heures (déclencheurs
 * suspendus le temps de dater). Les plus anciens, déjà hors de la période, ne sont pas réécrits : la
 * contrainte de contenu, revérifiée à chaque mise à jour, rendrait sinon le vieillissement répété de
 * tracés de 1 000 sommets de plus en plus lent.
 */
const age = () =>
  t.db.exec(`
    set session_replication_role = replica;
    update public.collective_items set created_at = created_at - interval '25 hours', updated_at = updated_at - interval '25 hours'
    where updated_at > now() - interval '24 hours';
    set session_replication_role = default;
  `);
/** Vérifie que les totaux de collective_state correspondent aux éléments. */
async function expectTotalsConsistent() {
  const { rows } = await t.db.query<{ items: number; bytes: string; path_points: string }>(
    "select count(*)::int as items, coalesce(sum(data_bytes), 0)::text as bytes, coalesce(sum(path_points), 0)::text as path_points from public.collective_items",
  );
  expect(await totals()).toEqual(rows[0]);
}

async function reset() {
  await t.db.exec(`
    delete from public.collective_suspensions;
    delete from public.collective_decisions;
    delete from public.collective_items;
    delete from public.collective_item_ids;
    update public.collective_state set revision = 0, items = 0, bytes = 0, path_points = 0, report_bytes = 0;
    delete from public.moderators;
    delete from public.contact_blocks;
    delete from public.profiles;
    delete from public.rate_limits;
    delete from auth.users where id not in ('${ALICE}', '${BOB}', '${CAROL}', '${MODO}');
  `);
  for (const [id, handle] of [
    [ALICE, "alice"],
    [BOB, "bob"],
    [MODO, "dora"],
  ]) {
    expect(await call(id, "public.create_my_profile($1, $2, '', 'members')", [handle, `Nom ${handle}`])).toBe("created");
  }
  await t.db.query("insert into public.moderators (user_id) values ($1)", [MODO]);
  await t.db.exec("delete from public.rate_limits;");
}

beforeAll(async () => {
  t = await openTestDb();
  await t.addUsers(ALICE, BOB, CAROL, MODO);
}, 60_000);

beforeEach(reset);

afterAll(async () => {
  await t?.db.close();
});

describe("migration de la carte collective", () => {
  it("vient après celle du partage, n'ajoute que des objets, et s'applique à une base existante", async () => {
    expect(MIGRATION_FILES.indexOf(MIGRATION)).toBe(MIGRATION_FILES.indexOf("20261019120000_map_sharing.sql") + 1);
    expect(SQL).not.toMatch(/drop (table|function)|create or replace|create policy|delete_my_account|storage.objects/i);
    expect(SQL).not.toMatch(/alter table public\.(?!rate_limits\b|collective_|moderators\b)/i);

    const old = await openTestDb(migrationsUpTo("20261019120000_map_sharing.sql"));
    await old.addUsers(ALICE);
    await old.as(ALICE, "select public.create_my_profile('alice', 'Alice', '', 'members')");
    await old.db.exec(SQL);
    expect((await old.db.query("select action from public.rate_limits order by action")).rows).toEqual([
      { action: "handle_attempt" },
      { action: "profile_create" },
    ]);
    const [row] = await old.as<{ status: string }>(ALICE, "select status from public.create_collective_item('a1', 'ping', $1)", [
      JSON.stringify(ping()),
    ]);
    expect(row.status).toBe("created");
    await old.db.close();
  }, 60_000);

  it("liste fermée des compteurs : les actions de la carte collective acceptées", async () => {
    for (const action of ["collective_create", "collective_change", "collective_report", "collective_read", "collective_state", "collective_moderate", "map_state"]) {
      await setHits(ALICE, action, 1);
    }
    await expect(setHits(ALICE, "collective_spam", 1)).rejects.toThrow(/rate_limits_action/);
  });

  it("les limites de limits.ts sont celles de la base", () => {
    const expectIn = (pattern: string) => expect(SQL, pattern).toContain(pattern);
    expectIn(`'collective_create', ${limits.CREATES_PER_DAY}, interval '1 day'`);
    expectIn(`'collective_change', ${limits.CHANGES_PER_DAY}, interval '1 day'`);
    expectIn(`'collective_report', ${limits.REPORTS_PER_DAY}, interval '1 day'`);
    expectIn(`'collective_read', ${limits.READS_PER_HOUR}, interval '1 hour'`);
    expectIn(`'collective_state', ${limits.STATES_PER_HOUR}, interval '1 hour'`);
    expectIn(`'collective_moderate', ${limits.DECISIONS_PER_DAY}, interval '1 day'`);
    expectIn(`v_items >= ${limits.MAX_ITEMS_PER_AUTHOR}`);
    expectIn(`v_bytes + p_bytes > ${limits.MAX_AUTHOR_BYTES}`);
    expectIn(`v_points + p_points > ${limits.MAX_AUTHOR_PATH_POINTS}`);
    expectIn(`v_day_bytes + greatest(p_bytes, 0) > ${limits.MAX_DAILY_BYTES}`);
    expectIn(`v_day_points + greatest(p_points, 0) > ${limits.MAX_DAILY_PATH_POINTS}`);
    expectIn(`now() + interval '${limits.SUSPENSION_DAYS} days'`);
    expectIn(`v_state.items >= ${limits.MAX_MAP_ITEMS}`);
    expectIn(`v_state.bytes + p_bytes > ${limits.MAX_MAP_BYTES}`);
    expectIn(`v_state.path_points + p_points > ${limits.MAX_MAP_PATH_POINTS}`);
    expectIn(`octet_length(p_data) > ${limits.MAX_ITEM_BYTES}`);
    expectIn(`between p_min and ${limits.MAX_ITEM_PATH_POINTS}`);
    expectIn(`collective_json_text_ok(p_data -> 'title', ${limits.MAX_ITEM_TITLE}, false)`);
    expectIn(`collective_json_text_ok(p_data -> 'note', ${limits.MAX_ITEM_NOTE}, true)`);
    expectIn(`collective_text_ok(p_value, ${limits.MAX_REASON_TEXT}, true)`);
    expectIn(`public.collective_reason(p_reason, ${limits.MIN_DECISION_REASON})`);
    expectIn(`limit ${limits.MAX_NOTICES}`);
    expectIn(`v_used + v_item.data_bytes <= ${limits.MAX_REPORT_COPIES_BYTES}`);
    expectIn(`p_page > ${limits.MAX_MODERATION_PAGE}`);
    expectIn(`limit ${limits.MODERATION_PAGE_SIZE} offset p_page * ${limits.MODERATION_PAGE_SIZE}`);
    expectIn(`char_length(v_details) < ${MIN_ILLEGAL_DETAILS}`);
    expectIn(`char_length(details) >= ${MIN_ILLEGAL_DETAILS}`);
  });
});

describe("tables de la carte collective : aucun accès par l'API", () => {
  it("ni lecture ni écriture directe, pour les comptes connectés comme pour les visiteurs", async () => {
    await created(ALICE, "a1", "ping", ping());
    expect(await report(BOB, "a1")).toBe("reported");
    expect(await moderate(MODO, "a1", "hide")).toBe("hidden");
    const tables = [
      "collective_items",
      "collective_state",
      "collective_reports",
      "collective_decisions",
      "collective_notices",
      "moderators",
      "collective_item_ids",
      "collective_report_copies",
      "collective_suspensions",
    ];
    for (const role of [ALICE, BOB, MODO, null]) {
      for (const table of tables) {
        for (const sql of [`select * from public.${table}`, `delete from public.${table}`]) {
          await expect(t.as(role, sql), `${role} ${sql}`).rejects.toThrow(/permission denied/);
        }
      }
      await expect(t.as(role, "insert into public.moderators (user_id) values ($1)", [BOB])).rejects.toThrow(/permission denied/);
      await expect(t.as(role, "update public.collective_items set status = 'visible'")).rejects.toThrow(/permission denied/);
      await expect(
        t.as(role, "insert into public.collective_items (id, author_id, kind, data) values ('x1', $1, 'ping', $2)", [BOB, JSON.stringify(ping())]),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("fonctions réservées aux comptes connectés ; fonctions internes fermées à tous", async () => {
    for (const sql of [
      "select * from public.collective_map_state()",
      "select * from public.collective_map()",
      "select * from public.create_collective_item('a1', 'ping', '{}')",
      "select * from public.update_collective_item('a1', '{}')",
      "select * from public.delete_collective_item('a1')",
      "select public.report_collective_item('a1', 'spam', '')",
      "select public.report_collective_item('a1', 'illegal', 'Explication suffisamment longue', true)",
      "select public.block_collective_author('a1')",
      "select * from public.my_collective_notices()",
      "select public.mark_collective_notices_read()",
      "select * from public.my_hidden_collective_items()",
      "select * from public.my_collective_items()",
      "select * from public.my_collective_reports()",
      "select * from public.my_moderation_decisions()",
      "select * from public.my_collective_decisions()",
      "select * from public.my_collective_account()",
      "select * from public.my_collective_item_ids()",
      "select * from public.collective_moderation_queue()",
      "select * from public.collective_moderation_log()",
      "select public.moderate_collective_item('a1', 'hide', 'Motif', false)",
    ]) {
      await expect(t.as(null, sql), sql).rejects.toThrow(/permission denied/);
      await expect(t.as("", sql), sql).rejects.toThrow(/collective_not_authenticated/);
    }
    for (const sql of [
      "select public.collective_text_ok('a', 1, false)",
      "select public.collective_item_data_ok('ping', '{}')",
      "select public.collective_user()",
      "select public.collective_is_moderator($1)",
      "select public.collective_moderator()",
      "select public.collective_require_profile($1)",
      "select public.collective_take($1, 'collective_read', 1, interval '1 hour')",
      "select public.collective_lock()",
      "select public.collective_revision()",
      "select public.collective_parse('{}')",
      "select public.collective_reason('abc', 0)",
      "select public.collective_endpoint_ok('p:x', $1)",
      "select public.collective_drop_links($1, 'p:x')",
      "select public.collective_room($1, true, 1, 1)",
      "select public.collective_id_free('a1', $1)",
      "select public.collective_suspended_until($1)",
      "select public.collective_notices_trim(gen_random_uuid())",
      "select public.collective_trace(null::public.collective_items, null, null)",
      "select public.collective_suspension_review($1, 'a1')",
      "select public.collective_purge()",
    ]) {
      await expect(t.as(ALICE, sql, sql.includes("$1") ? [ALICE] : []), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("les fonctions SECURITY DEFINER de la carte collective ont un search_path vide ; un seul déclencheur l'est (profils)", async () => {
    const { rows } = await t.db.query<{ name: string; config: string[] | null; secdef: boolean }>(
      `select proname as name, proconfig as config, prosecdef as secdef from pg_proc
       where pronamespace = 'public'::regnamespace and (proname like '%collective%' or proname like '%moderat%')`,
    );
    const definers = rows.filter((r) => r.secdef).map((r) => r.name).toSorted();
    expect(definers).toEqual(
      [
        "collective_map",
        "collective_map_state",
        "collective_moderation_log",
        "collective_moderation_queue",
        "collective_on_profile_change",
        "block_collective_author",
        "create_collective_item",
        "delete_collective_item",
        "mark_collective_notices_read",
        "moderate_collective_item",
        "my_collective_account",
        "my_collective_decisions",
        "my_collective_item_ids",
        "my_collective_items",
        "my_collective_notices",
        "my_hidden_collective_items",
        "my_collective_reports",
        "my_moderation_decisions",
        "report_collective_item",
        "update_collective_item",
      ].toSorted(),
    );
    for (const fn of rows) expect(fn.config, fn.name).toEqual(['search_path=""']);
    // Déclencheurs : personne ne peut les exécuter.
    for (const fn of ["collective_on_profile_change", "collective_report_copies_count", "collective_reports_release_copy", "collective_item_ids_author_gone"]) {
      const { rows: grants } = await t.db.query<{ ok: boolean }>(
        `select has_function_privilege('authenticated', 'public.${fn}()', 'execute') or has_function_privilege('anon', 'public.${fn}()', 'execute') as ok`,
      );
      expect(grants[0].ok, fn).toBe(false);
    }
  });
});

describe("contributions", () => {
  it("chacun ajoute des éléments signés de son nom affiché ; tous les membres connectés les voient", async () => {
    const result = await create(ALICE, "a1", "ping", ping("Port de Gwadar"));
    expect(result).toEqual({ status: "created", author_name: "Nom alice", created_at: expect.any(Date) });
    await created(BOB, "b1", "flux", flux());
    await created(BOB, "b2", "zone", zone());
    const rows = await map(CAROL);
    expect(rows.map((r) => [r.id, r.kind, r.author_name, r.mine])).toEqual([
      ["a1", "ping", "Nom alice", false],
      ["b1", "flux", "Nom bob", false],
      ["b2", "zone", "Nom bob", false],
    ]);
    expect(rows[0].data).toEqual(ping("Port de Gwadar"));
    // Jamais l'identifiant de compte de l'auteur.
    expect(Object.keys(rows[0]).toSorted()).toEqual(["author_handle", "author_name", "created_at", "data", "id", "kind", "mine", "updated_at"]);
    expect(JSON.stringify(rows)).not.toContain(ALICE);
    expect((await map(ALICE)).find((r) => r.id === "a1")?.mine).toBe(true);
    await expectTotalsConsistent();
  });

  it("il faut un profil pour ajouter ou modifier ; sans profil on lit, supprime et signale encore", async () => {
    await expect(create(CAROL, "c1", "ping", ping())).rejects.toThrow(/collective_no_profile/);
    await created(ALICE, "a1", "ping", ping());
    await t.as(ALICE, "delete from public.profiles where user_id = auth.uid()");
    await expect(update(ALICE, "a1", ping("Autre"))).rejects.toThrow(/collective_no_profile/);
    // Un profil supprimé : ses éléments ne sont plus montrés aux autres (jamais sans signature), ni
    // signalables ; leur auteur les voit encore, non signés, et peut les supprimer.
    expect(await map(BOB)).toEqual([]);
    expect((await map(ALICE)).map((r) => [r.id, r.author_name, r.author_handle, r.mine])).toEqual([["a1", null, null, true]]);
    expect(await report(CAROL, "a1")).toBe("not-found");
    await created(BOB, "b1", "ping", ping());
    expect(await report(CAROL, "b1")).toBe("reported");
    expect(await remove(ALICE, "a1")).toBe("deleted");
    expect((await state(CAROL)).has_profile).toBe(false);
  });

  it("contenu refusé : clés, sortes, coordonnées, textes, tracés, taille, identifiant", async () => {
    const refused: [string, string, unknown][] = [
      ["x1", "pays", ping()],
      ["x 1", "ping", ping()],
      ["x".repeat(65), "ping", ping()],
      ["x1", "ping", { ...ping(), extra: 1 }],
      ["x1", "ping", { ll: [2, 48], type: "crise", title: "" }],
      ["x1", "ping", { ...ping(), type: "inconnu" }],
      ["x1", "ping", { ...ping(), ll: [181, 0] }],
      ["x1", "ping", { ...ping(), ll: [2.1234567, 0] }],
      ["x1", "ping", { ...ping(), ll: ["2", 0] }],
      ["x1", "ping", { ...ping(), title: "a".repeat(201) }],
      ["x1", "ping", { ...ping(), title: "ligne\nretour" }],
      ["x1", "ping", { ...ping(), note: "a".repeat(2001) }],
      ["x1", "ping", { ...ping(), note: "sens ‮ inversé" }],
      ["x1", "ping", { ...ping(), date: "2024-1-1" }],
      ["x1", "text", { ll: [0, 0], title: "", note: "", size: 41 }],
      ["x1", "zone", zone([[0, 0], [10, 0], [10, 10], [0, 1]])],
      ["x1", "zone", zone([[0, 0], [10, 0], [0, 0]])],
      ["x1", "flux", { ...flux(), color: "#ff0000" }],
      ["x1", "flux", { ...flux(), width: 17 }],
      ["x1", "flux", flux(Array.from({ length: 1001 }, (_, i) => [i / 100, 0]))],
      ["x1", "link", link("c:FRA", "c:FRA")],
      ["x1", "link", link("x:abc", "c:FRA")],
      ["x1", "ping", "pas du json"],
      ["x1", "ping", JSON.stringify({ ...ping(), note: "a".repeat(49_200) })],
    ];
    for (const [id, kind, data] of refused) {
      await expect(create(ALICE, id, kind, data), `${kind} ${JSON.stringify(data).slice(0, 80)}`).rejects.toThrow(/collective_invalid/);
    }
    // Aucun ajout n'est compté pour un contenu refusé.
    expect(await hits(ALICE, "collective_create")).toBe(0);
    await created(ALICE, "ok1", "text", { ll: [-180, 90], title: "T", note: "ligne 1\nligne\t2", date: "2024-05-01", size: 12 });
    await created(ALICE, "ok2", "flux", { ...flux(), opacity: 0.5 });
  });

  it("chaque écriture renvoie la version de la carte avant et après elle (liens rattachés compris)", async () => {
    const revision = async () => (await state(CAROL)).revision;
    const step = async (sql: string, params: unknown[]) => {
      const row = await written(ALICE, sql, params);
      return [row.status, row.revision_from, row.revision_to];
    };
    const createStep = async (id: string, kind: string, data: unknown) => {
      const row = await one<Written>(
        ALICE,
        "select status, revision_from::text, revision_to::text from public.create_collective_item($1, $2, $3)",
        [id, kind, JSON.stringify(data)],
      );
      return [row.status, row.revision_from, row.revision_to];
    };
    const r0 = Number(await revision());
    expect(await createStep("a1", "ping", ping())).toEqual(["created", `${r0}`, `${r0 + 1}`]);
    expect(await createStep("l1", "link", link("p:a1", "c:FRA"))).toEqual(["created", `${r0 + 1}`, `${r0 + 2}`]);
    // Refus donné sous le verrou : version inchangée.
    expect(await createStep("a1", "ping", ping())).toEqual(["id-taken", `${r0 + 2}`, `${r0 + 2}`]);
    expect(await step("public.update_collective_item($1, $2)", ["a1", JSON.stringify(ping())])).toEqual([
      "unchanged",
      `${r0 + 2}`,
      `${r0 + 2}`,
    ]);
    // Un autre membre écrit : la version d'avant de l'écriture suivante n'est plus celle que connaît Alice.
    await created(BOB, "b1", "ping", ping());
    expect(await step("public.update_collective_item($1, $2)", ["a1", JSON.stringify(ping("Autre"))])).toEqual([
      "updated",
      `${r0 + 3}`,
      `${r0 + 4}`,
    ]);
    // Suppression avec son lien rattaché : deux changements.
    expect(await step("public.delete_collective_item($1)", ["a1"])).toEqual(["deleted", `${r0 + 4}`, `${r0 + 6}`]);
    expect(await revision()).toBe(`${r0 + 6}`);
    // Réponses données avant le verrou : aucune version.
    expect(await step("public.delete_collective_item($1)", ["x y"])).toEqual(["not-found", null, null]);
  });

  it("identifiant déjà pris : « id-taken », sans rien écraser", async () => {
    await created(ALICE, "a1", "ping", ping());
    expect((await create(BOB, "a1", "point", { ll: [0, 0], title: "", note: "" })).status).toBe("id-taken");
    expect((await map(BOB)).map((r) => [r.id, r.kind, r.author_name])).toEqual([["a1", "ping", "Nom alice"]]);
  });

  it("chacun ne modifie que ses éléments visibles ; les extrémités d'un lien ne changent pas", async () => {
    await created(ALICE, "a1", "ping", ping());
    await created(ALICE, "a2", "point", { ll: [1, 1], title: "", note: "" });
    await created(ALICE, "l1", "link", link("p:a1", "c:FRA"));
    expect(await update(BOB, "a1", ping("Volé"))).toBe("not-found");
    expect(await update(ALICE, "inconnu", ping())).toBe("not-found");
    expect(await update(ALICE, "a1", ping())).toBe("unchanged");
    expect(await update(ALICE, "a1", { ll: [0, 0], title: "", note: "" })).toBe("invalid");
    expect(await update(ALICE, "l1", link("o:a2", "c:FRA"))).toBe("invalid");
    expect(await update(ALICE, "l1", link("p:a1", "c:FRA", "Relation"))).toBe("updated");
    expect(await update(ALICE, "a1", ping("Nouveau titre"))).toBe("updated");
    expect((await map(BOB)).find((r) => r.id === "a1")?.data).toEqual(ping("Nouveau titre"));
    await expect(t.as(ALICE, "select * from public.update_collective_item('a1', 'pas du json')")).rejects.toThrow(/collective_invalid/);
    await expectTotalsConsistent();
  });

  it("chacun ne supprime que ses éléments, avec ses propres liens rattachés", async () => {
    await created(ALICE, "a1", "ping", ping());
    await created(ALICE, "a2", "point", { ll: [1, 1], title: "", note: "" });
    await created(ALICE, "l1", "link", link("p:a1", "c:FRA"));
    await created(ALICE, "l2", "link", link("p:a1", "o:a2"));
    await created(ALICE, "l3", "link", link("o:a2", "c:DEU"));
    expect(await remove(BOB, "a1")).toBe("not-found");
    expect(await remove(BOB, "a b")).toBe("not-found");
    expect(await remove(ALICE, "a1")).toBe("deleted");
    expect(await ids(BOB)).toEqual(["a2", "l3"]);
    expect(await remove(ALICE, "a1")).toBe("not-found");
    await expectTotalsConsistent();
  });

  it("un lien relie un pays ou un élément visible de son propre auteur", async () => {
    await created(ALICE, "a1", "ping", ping());
    await created(BOB, "b1", "ping", ping());
    expect((await create(BOB, "l1", "link", link("p:a1", "c:FRA"))).status).toBe("invalid-link");
    expect((await create(BOB, "l2", "link", link("o:b1", "c:FRA"))).status).toBe("invalid-link");
    expect((await create(BOB, "l3", "link", link("p:inconnu", "c:FRA"))).status).toBe("invalid-link");
    expect((await create(BOB, "l4", "link", link("p:b1", "c:FRA"))).status).toBe("created");
    expect(await report(ALICE, "b1")).toBe("reported");
    expect(await moderate(MODO, "b1", "hide")).toBe("hidden");
    expect((await create(BOB, "l5", "link", link("p:b1", "c:DEU"))).status).toBe("invalid-link");
  });
});

describe("visibilité", () => {
  it("un blocage, dans un sens ou dans l'autre, masque à chacun les éléments de l'autre", async () => {
    await created(ALICE, "a1", "ping", ping());
    await created(BOB, "b1", "ping", ping());
    expect(await call(ALICE, "public.block_member('handle', 'bob')")).toBe("blocked");
    expect(await ids(ALICE)).toEqual(["a1"]);
    expect(await ids(BOB)).toEqual(["b1"]);
    expect(await ids(MODO)).toEqual(["a1", "b1"]);
    // Un élément invisible pour le compte : même réponse qu'un élément inconnu.
    expect(await report(BOB, "a1")).toBe("not-found");
    expect(await report(ALICE, "b1")).toBe("not-found");
  });

  it("l'auteur d'un élément visible se bloque depuis cet élément, même avec un profil « contacts »", async () => {
    const blockAuthor = (userId: string, id: string) => call(userId, "public.block_collective_author($1)", [id]);
    await t.as(BOB, "select public.update_my_profile('bobby', 'Nom bob', '', 'contacts')");
    await created(BOB, "b1", "ping", ping());
    await created(ALICE, "a1", "ping", ping());
    // Signé de son identifiant, mais introuvable par son identifiant (profil « contacts »).
    expect((await map(ALICE)).find((r) => r.id === "b1")?.author_handle).toBe("bobby");
    expect(await call(ALICE, "public.block_member('handle', 'bobby')")).toBe("not-found");
    // Depuis l'élément : bloqué, ses éléments disparaissent pour Alice (et ceux d'Alice pour lui).
    expect(await hits(ALICE, "contact_block")).toBe(1);
    expect(await blockAuthor(ALICE, "b1")).toBe("blocked");
    expect(await hits(ALICE, "contact_block")).toBe(2);
    expect(await ids(ALICE)).toEqual(["a1"]);
    expect(await ids(BOB)).toEqual(["b1"]);
    // Le blocage est le même que depuis les contacts : listé avec l'identifiant montré, levable.
    const blocked = await t.as<{ id: string; handle: string | null }>(ALICE, "select id, handle from public.my_blocked_members()");
    expect(blocked.map((b) => b.handle)).toEqual(["bobby"]);
    // Plus visible : même réponse qu'un élément inconnu, masqué ou d'un auteur sans profil.
    expect(await blockAuthor(ALICE, "b1")).toBe("not-found");
    expect(await blockAuthor(BOB, "a1")).toBe("not-found");
    expect(await blockAuthor(CAROL, "inconnu")).toBe("not-found");
    expect(await blockAuthor(CAROL, "a1")).toBe("blocked");
    expect(await call(ALICE, "public.unblock_member($1)", [blocked[0].id])).toBe("unblocked");
    expect(await ids(ALICE)).toEqual(["b1", "a1"]);
    expect(await blockAuthor(ALICE, "a1")).toBe("own-item");
    // Élément masqué : introuvable ; identifiant mal formé : refusé sans être compté.
    expect(await report(ALICE, "b1")).toBe("reported");
    expect(await moderate(MODO, "b1", "hide")).toBe("hidden");
    const before = await hits(ALICE, "contact_block");
    expect(await blockAuthor(ALICE, "b1")).toBe("not-found");
    expect(await blockAuthor(ALICE, "x y")).toBe("not-found");
    expect(await hits(ALICE, "contact_block")).toBe(before + 1);
    // Même limite que block_member : 50 par jour, comptés avant la recherche.
    await setHits(ALICE, "contact_block", 50);
    await expect(blockAuthor(ALICE, "inconnu")).rejects.toThrow(/collective_rate_limited/);
    // Jamais l'identifiant de compte de l'auteur dans la réponse.
    const rows = await t.as<Row>(CAROL, "select public.block_collective_author('a1') as r");
    expect(JSON.stringify(rows)).not.toContain(ALICE);
  });

  it("un élément masqué n'est vu de personne, sauf des modérateurs (file de modération)", async () => {
    await created(ALICE, "a1", "ping", ping());
    expect(await report(BOB, "a1")).toBe("reported");
    expect(await moderate(MODO, "a1", "hide")).toBe("hidden");
    for (const user of [ALICE, BOB, MODO]) expect(await ids(user)).toEqual([]);
    expect(await update(ALICE, "a1", ping("Contourner"))).toBe("not-found");
    expect(await report(CAROL, "a1")).toBe("not-found");
    const queue = await t.as<{ id: string; status: string }>(MODO, "select id, status from public.collective_moderation_queue()");
    expect(queue).toEqual([{ id: "a1", status: "hidden" }]);
    // L'auteur le retrouve dans ses données, et peut le supprimer.
    expect(await t.as(ALICE, "select id, status from public.my_collective_items()")).toEqual([{ id: "a1", status: "hidden" }]);
    expect(await remove(ALICE, "a1")).toBe("deleted");
  });

  it("l'auteur retrouve ses éléments masqués sans dépendre des avis (effacés au bout d'un an ou au-delà de 100) et peut les supprimer", async () => {
    const hidden = (userId: string) =>
      t.as<{ id: string; kind: string; title: string }>(userId, "select id, kind, title from public.my_hidden_collective_items()");
    await created(ALICE, "a1", "ping", ping("Port masqué"));
    await created(ALICE, "a2", "ping", ping("Port visible"));
    await created(BOB, "b1", "ping", ping("Autre"));
    expect(await hidden(ALICE)).toEqual([]);
    expect(await moderate(MODO, "a1", "hide")).toBe("hidden");
    expect(await moderate(MODO, "b1", "hide")).toBe("hidden");
    // Chacun ne voit que ses propres éléments masqués ; le modérateur n'y voit pas ceux des autres.
    expect(await hidden(ALICE)).toEqual([{ id: "a1", kind: "ping", title: "Port masqué" }]);
    expect(await hidden(BOB)).toEqual([{ id: "b1", kind: "ping", title: "Autre" }]);
    expect(await hidden(MODO)).toEqual([]);
    // L'avis disparaît (décision purgée au bout d'un an, notices en cascade) : l'élément reste listé.
    await t.db.exec("update public.collective_decisions set created_at = created_at - interval '13 months'");
    await state(ALICE);
    expect(await notices(ALICE)).toEqual([]);
    expect(await count("collective_items", "id = 'a1' and status = 'hidden'")).toBe(1);
    expect(await hidden(ALICE)).toEqual([{ id: "a1", kind: "ping", title: "Port masqué" }]);
    // Toujours supprimable, même suspendu et sans profil.
    await t.db.query("insert into public.collective_suspensions (user_id, until) values ($1, now() + interval '30 days')", [ALICE]);
    await t.as(ALICE, "delete from public.profiles where user_id = auth.uid()");
    expect(await remove(ALICE, "a1")).toBe("deleted");
    expect(await hidden(ALICE)).toEqual([]);
    // Lecture comptée avec celles de la carte.
    await setHits(BOB, "collective_read", limits.READS_PER_HOUR);
    await expect(hidden(BOB)).rejects.toThrow(/collective_rate_limited/);
  });

  it("l'état de la carte : version, rôle, profil, avis non lus, nombre de ses éléments", async () => {
    const before = await state(ALICE);
    expect(before).toEqual({ revision: expect.any(String), is_moderator: false, has_profile: true, unread_notices: 0, my_items: 0, suspended_until: null });
    await created(ALICE, "a1", "ping", ping());
    const after = await state(ALICE);
    expect(Number(after.revision)).toBeGreaterThan(Number(before.revision));
    expect(after.my_items).toBe(1);
    expect((await state(MODO)).is_moderator).toBe(true);
    expect((await state(CAROL)).has_profile).toBe(false);
    // Un contenu renvoyé tel quel ne change pas la version.
    expect(await update(ALICE, "a1", ping())).toBe("unchanged");
    expect((await state(ALICE)).revision).toBe(after.revision);
  });
});

describe("signalements", () => {
  it("tout membre signale l'élément d'un autre, une fois ; jamais le sien", async () => {
    await created(ALICE, "a1", "ping", ping());
    expect(await report(BOB, "a1", "hate", "  Propos haineux  ")).toBe("reported");
    expect(await report(BOB, "a1", "spam")).toBe("already-reported");
    expect(await report(CAROL, "a1", "other")).toBe("reported");
    expect(await report(ALICE, "a1")).toBe("own-item");
    expect(await report(BOB, "inconnu")).toBe("not-found");
    expect(await report(BOB, "a b")).toBe("not-found");
    expect(await t.as(BOB, "select item_id, reason, details, status from public.my_collective_reports()")).toEqual([
      { item_id: "a1", reason: "hate", details: "Propos haineux", status: "open" },
    ]);
    // L'auteur ne voit pas qui l'a signalé.
    expect(await t.as(ALICE, "select * from public.my_collective_reports()")).toEqual([]);
  });

  it("motif de la liste fermée ; précisions bornées ; essais comptés avant la recherche ; 20 par jour", async () => {
    await created(ALICE, "a1", "ping", ping());
    await expect(report(BOB, "a1", "inconnu")).rejects.toThrow(/collective_invalid/);
    await expect(report(BOB, "a1", "spam", "a".repeat(501))).rejects.toThrow(/collective_invalid/);
    await expect(report(BOB, "a1", "spam", "‮")).rejects.toThrow(/collective_invalid/);
    expect(await hits(BOB, "collective_report")).toBe(0);
    expect(await report(BOB, "inconnu")).toBe("not-found");
    expect(await hits(BOB, "collective_report")).toBe(1);
    await setHits(BOB, "collective_report", limits.REPORTS_PER_DAY);
    await expect(report(BOB, "a1")).rejects.toThrow(/collective_rate_limited/);
  });

  it("contenu illicite : explication et déclaration de bonne foi exigées par la base, comme par le formulaire", async () => {
    await created(ALICE, "a1", "ping", ping());
    const enough = "x".repeat(MIN_ILLEGAL_DETAILS);
    const short = `  ${"x".repeat(MIN_ILLEGAL_DETAILS - 1)}  
`;
    for (const [details, goodFaith] of [
      ["", true],
      [short, true],
      [enough, false],
    ] as const) {
      await expect(report(BOB, "a1", "illegal", details, goodFaith), `${details} ${goodFaith}`).rejects.toThrow(/collective_invalid/);
    }
    await expect(t.as(BOB, "select public.report_collective_item('a1', 'illegal', $1, null)", [enough])).rejects.toThrow(/collective_invalid/);
    // Sans argument, la déclaration n'est pas faite.
    await expect(t.as(BOB, "select public.report_collective_item('a1', 'illegal', $1)", [enough])).rejects.toThrow(/collective_invalid/);
    // Refusés avant d'être comptés.
    expect(await hits(BOB, "collective_report")).toBe(0);
    expect(await report(BOB, "a1", "illegal", enough, true)).toBe("reported");
    // Les autres motifs n'exigent ni l'un ni l'autre.
    expect(await report(CAROL, "a1", "spam")).toBe("reported");
    // Défense en profondeur : la table refuse un signalement « illegal » sans explication.
    await expect(
      t.db.query("insert into public.collective_reports (item_id, item_kind, reporter_id, reason) values ('a1', 'ping', $1, 'illegal')", [MODO]),
    ).rejects.toThrow(/collective_reports_illegal_details/);
  });
});

describe("modération", () => {
  it("réservée aux modérateurs désignés en base", async () => {
    await created(ALICE, "a1", "ping", ping());
    for (const sql of [
      "select * from public.collective_moderation_queue()",
      "select * from public.collective_moderation_log()",
      "select public.moderate_collective_item('a1', 'hide', 'Motif', false)",
    ]) {
      await expect(t.as(BOB, sql), sql).rejects.toThrow(/collective_forbidden/);
    }
    expect(await ids(BOB)).toEqual(["a1"]);
    expect(await t.as(BOB, "select * from public.my_moderation_decisions()")).toEqual([]);
  });

  it("file : éléments signalés avec leurs motifs et précisions, sans dire qui les a signalés", async () => {
    await created(ALICE, "a1", "ping", ping("Titre"));
    await created(ALICE, "a2", "ping", ping());
    expect(await report(BOB, "a1", "hate", "Détail de Bob")).toBe("reported");
    expect(await report(CAROL, "a1", "spam")).toBe("reported");
    const queue = await t.as<Row>(MODO, "select * from public.collective_moderation_queue()");
    expect(queue).toEqual([
      expect.objectContaining({
        id: "a1",
        kind: "ping",
        status: "visible",
        author_handle: "alice",
        author_name: "Nom alice",
        open_reports: 2,
        reasons: ["hate", "spam"],
        details: ["Détail de Bob"],
      }),
    ]);
    expect(Object.keys(queue[0]).toSorted()).toEqual(
      ["author_handle", "author_name", "created_at", "data", "details", "id", "kind", "last_report_at", "open_reports", "reasons", "reported_data", "status", "total", "updated_at"],
    );
    expect(JSON.stringify(queue)).not.toMatch(new RegExp(`${ALICE}|${BOB}|${CAROL}|bob`));
  });

  it("masquer : motif au journal, signalements traités, auteur et membres qui ont signalé informés", async () => {
    await created(ALICE, "a1", "ping", ping("Titre"));
    expect(await report(BOB, "a1", "hate")).toBe("reported");
    await expect(moderate(MODO, "a1", "hide", " a ")).rejects.toThrow(/collective_invalid/);
    await expect(moderate(MODO, "a1", "bannir")).rejects.toThrow(/collective_invalid/);
    expect(await moderate(MODO, "a1", "hide", "Propos haineux")).toBe("hidden");
    expect(await moderate(MODO, "a1", "hide")).toBe("unchanged");
    expect(await count("collective_reports", "status = 'open'")).toBe(0);
    expect(await notices(ALICE)).toEqual([
      { role: "author", action: "hide", item_id: "a1", item_title: "Titre", reason: "Propos haineux", item_hidden: true, read_at: null },
    ]);
    expect(await notices(BOB)).toEqual([
      { role: "reporter", action: "hide", item_id: "a1", item_title: "Titre", reason: "Propos haineux", item_hidden: false, read_at: null },
    ]);
    expect((await state(ALICE)).unread_notices).toBe(1);
    expect(await call(ALICE, "public.mark_collective_notices_read()")).toBe(1);
    expect((await state(ALICE)).unread_notices).toBe(0);
    expect((await notices(BOB))[0].read_at).toBeNull();

    expect(await moderate(MODO, "a1", "restore", "Erreur de modération")).toBe("restored");
    expect(await ids(BOB)).toEqual(["a1"]);
    expect((await notices(ALICE)).map((n) => n.action)).toEqual(["restore", "hide"]);
    // Exposé des motifs : l'avis d'auteur dit si la décision suit des signalements (0 : initiative de
    // la modération) ; l'avis du membre qui a signalé ne le dit pas.
    expect(await t.as<Row>(ALICE, "select action, reports from public.my_collective_notices()")).toEqual([
      { action: "restore", reports: 0 },
      { action: "hide", reports: 1 },
    ]);
    expect(await t.as<Row>(BOB, "select reports from public.my_collective_notices()")).toEqual([{ reports: null }]);

    const log = await t.as<Row>(MODO, "select action, item_id, item_title, reason, reports, moderator_name, author_handle, author_name from public.collective_moderation_log()");
    expect(log).toEqual([
      { action: "restore", item_id: "a1", item_title: "Titre", reason: "Erreur de modération", reports: 0, moderator_name: "Nom dora", author_handle: "alice", author_name: "Nom alice" },
      { action: "hide", item_id: "a1", item_title: "Titre", reason: "Propos haineux", reports: 1, moderator_name: "Nom dora", author_handle: "alice", author_name: "Nom alice" },
    ]);
    expect((await t.as(MODO, "select action from public.my_moderation_decisions()")).length).toBe(2);
  });

  it("supprimer : l'élément et les liens de son auteur qui y sont rattachés", async () => {
    await created(ALICE, "a1", "ping", ping());
    await created(ALICE, "l1", "link", link("p:a1", "c:FRA"));
    await created(BOB, "b1", "ping", ping());
    expect(await moderate(MODO, "a1", "delete", "Contenu illicite")).toBe("deleted");
    expect(await ids(BOB)).toEqual(["b1"]);
    expect((await notices(ALICE))[0]).toMatchObject({ action: "delete", item_hidden: false });
    expect(await moderate(MODO, "a1", "restore")).toBe("not-found");
    await expectTotalsConsistent();
  });

  it("classer : l'élément reste, seuls les membres qui ont signalé sont informés", async () => {
    await created(ALICE, "a1", "ping", ping());
    expect(await moderate(MODO, "a1", "dismiss")).toBe("unchanged");
    expect(await report(BOB, "a1")).toBe("reported");
    expect(await moderate(MODO, "a1", "dismiss", "Conforme aux règles")).toBe("dismissed");
    expect(await ids(BOB)).toEqual(["a1"]);
    expect(await notices(ALICE)).toEqual([]);
    expect((await notices(BOB)).map((n) => n.action)).toEqual(["dismiss"]);
    // Un signalement traité ne se refait pas.
    expect(await report(BOB, "a1")).toBe("already-reported");
  });

  it("un modérateur ne décide pas sur ses propres éléments ; décisions comptées", async () => {
    await created(MODO, "m1", "ping", ping());
    expect(await report(BOB, "m1")).toBe("reported");
    expect(await moderate(MODO, "m1", "hide")).toBe("own-item");
    expect(await moderate(MODO, "inconnu", "hide")).toBe("not-found");
    await setHits(MODO, "collective_moderate", limits.DECISIONS_PER_DAY);
    await created(ALICE, "a1", "ping", ping());
    await expect(moderate(MODO, "a1", "hide")).rejects.toThrow(/collective_rate_limited/);
  });

  it("conservation : journal d'un an, 100 avis au plus par compte", async () => {
    await created(ALICE, "a1", "ping", ping());
    expect(await moderate(MODO, "a1", "hide")).toBe("hidden");
    await t.db.exec("update public.collective_decisions set created_at = now() - interval '13 months'");
    await t.db.query(
      `insert into public.collective_decisions (item_id, item_kind, author_id, moderator_id, action, reason)
       select 'old' || g, 'ping', $1, $2, 'hide', 'Ancien motif' from generate_series(1, 120) as g`,
      [ALICE, MODO],
    );
    await t.db.query(
      `insert into public.collective_notices (user_id, decision_id, role, created_at)
       select $1, d.id, 'author', now() - interval '1 day' from public.collective_decisions as d where d.item_id like 'old%'`,
      [ALICE],
    );
    expect(await moderate(MODO, "a1", "restore")).toBe("restored");
    expect(await count("collective_decisions", "created_at < now() - interval '1 year'")).toBe(0);
    expect(await count("collective_notices", `user_id = '${ALICE}'`)).toBe(limits.MAX_NOTICES);
    expect((await notices(ALICE))[0].action).toBe("restore");
  });

  it("conservation : une suspension échue est effacée à la décision suivante, une suspension en cours reste", async () => {
    await created(ALICE, "a1", "ping", ping());
    await created(BOB, "b1", "ping", ping());
    expect(await moderate(MODO, "a1", "hide", "Contraire aux règles", true)).toBe("hidden");
    await t.db.query("insert into public.collective_suspensions (user_id, until) values ($1, now() + interval '2 days')", [BOB]);
    await t.db.query("update public.collective_suspensions set until = now() - interval '1 second' where user_id = $1", [ALICE]);
    expect(await count("collective_suspensions")).toBe(2);
    expect(await moderate(MODO, "b1", "hide", "Contraire aux règles")).toBe("hidden");
    expect((await t.db.query("select user_id from public.collective_suspensions")).rows).toEqual([{ user_id: BOB }]);
  });

  it("conservation : ce qui a dépassé sa durée est effacé au premier usage de la carte, sans nouvelle décision", async () => {
    await created(ALICE, "a1", "ping", ping());
    await created(ALICE, "a2", "ping", ping());
    expect(await report(BOB, "a1")).toBe("reported");
    expect(await moderate(MODO, "a1", "hide", "Contraire aux règles", true)).toBe("hidden");
    expect(await report(BOB, "a2")).toBe("reported");
    expect(await moderate(MODO, "a2", "dismiss", "Conforme aux règles")).toBe("dismissed");
    await t.db.exec(`
      update public.collective_decisions set created_at = now() - interval '13 months' where item_id = 'a1';
      update public.collective_reports set resolved_at = now() - interval '13 months' where item_id = 'a1';
      update public.collective_suspensions set until = now() - interval '1 second';
    `);
    const before = await totals();
    await state(CAROL);
    expect((await t.db.query("select item_id from public.collective_decisions")).rows).toEqual([{ item_id: "a2" }]);
    expect((await t.db.query("select item_id from public.collective_reports")).rows).toEqual([{ item_id: "a2" }]);
    expect(await count("collective_suspensions")).toBe(0);
    expect(await count("collective_notices", "true")).toBe(1);
    // Rien d'autre ne change : l'élément masqué reste, et une lecture sans rien à effacer n'efface rien.
    expect(await totals()).toEqual(before);
    await state(CAROL);
    expect(await count("collective_decisions")).toBe(1);
  });
});

describe("droit d'accès du compte", () => {
  it("désignation comme modérateur et suspension en cours : une ligne, la sienne seulement", async () => {
    const account = (userId: string) =>
      one<{ moderator_since: Date | null; suspended_until: Date | null; suspended_at: Date | null }>(
        userId,
        "select moderator_since, suspended_until, suspended_at from public.my_collective_account()",
      );
    expect(await account(ALICE)).toEqual({ moderator_since: null, suspended_until: null, suspended_at: null });
    expect((await account(MODO)).moderator_since).toBeInstanceOf(Date);
    await created(ALICE, "a1", "ping", ping());
    expect(await moderate(MODO, "a1", "hide", "Contraire aux règles", true)).toBe("hidden");
    const mine = await account(ALICE);
    expect(mine.suspended_until).toEqual((await state(ALICE)).suspended_until);
    expect(mine.suspended_at).toBeInstanceOf(Date);
    expect(mine.moderator_since).toBeNull();
    expect(await account(BOB)).toEqual({ moderator_since: null, suspended_until: null, suspended_at: null });
    expect((await account(MODO)).suspended_until).toBeNull();
  });

  it("identifiants d'éléments utilisés, avec l'indication « modéré » ; jamais ceux des autres", async () => {
    await created(ALICE, "a1", "ping", ping());
    await created(ALICE, "a2", "ping", ping());
    await created(BOB, "b1", "ping", ping());
    expect(await remove(ALICE, "a2")).toBe("deleted");
    expect(await moderate(MODO, "a1", "delete", "Contenu illicite")).toBe("deleted");
    expect(await t.as<Row>(ALICE, "select item_id, moderated from public.my_collective_item_ids()")).toEqual([
      { item_id: "a1", moderated: true },
      { item_id: "a2", moderated: false },
    ]);
    expect(await t.as<Row>(BOB, "select item_id, moderated from public.my_collective_item_ids()")).toEqual([
      { item_id: "b1", moderated: false },
    ]);
  });

  it("un classement ou un retrait d'élément signalé n'est jamais rendu à l'auteur (il révélerait le signalement)", async () => {
    await created(ALICE, "a1", "ping", ping());
    await created(ALICE, "a2", "ping", ping());
    expect(await report(BOB, "a1")).toBe("reported");
    expect(await report(BOB, "a2")).toBe("reported");
    expect(await moderate(MODO, "a1", "dismiss", "Conforme aux règles")).toBe("dismissed");
    expect(await remove(ALICE, "a2")).toBe("deleted");
    expect(await count("collective_decisions", `author_id = '${ALICE}'`)).toBe(2);
    expect(await notices(ALICE)).toEqual([]);
    expect(await t.as<Row>(ALICE, "select item_id, moderated from public.my_collective_item_ids()")).toEqual([
      { item_id: "a1", moderated: false },
      { item_id: "a2", moderated: false },
    ]);
    expect(await t.as(ALICE, "select * from public.my_moderation_decisions()")).toEqual([]);
    expect(await t.as(ALICE, "select * from public.my_collective_decisions()")).toEqual([]);
  });

  it("décisions sur ses éléments : celles qu'il connaît, même après l'effacement de l'avis ; jamais celles qui révéleraient un signalement", async () => {
    const decisions = (userId: string) =>
      t.as<{ action: string; item_id: string; reason: string; reports: number }>(
        userId,
        "select action, item_id, reason, reports from public.my_collective_decisions()",
      );
    await created(ALICE, "h1", "ping", ping("Masqué"));
    await created(ALICE, "pp", "ping", ping("Point"));
    await created(ALICE, "lr", "link", link("p:pp", "c:FRA", "Lien signalé"));
    await created(ALICE, "lh", "link", link("p:pp", "c:DEU", "Lien masqué"));
    await created(ALICE, "rr", "ping", ping("Signalé puis retiré"));
    await created(ALICE, "dd", "ping", ping("Classé"));
    await created(BOB, "b1", "ping", ping());
    // Masqué sans signalement, puis retiré par l'auteur : il le sait.
    expect(await moderate(MODO, "h1", "hide", "Contraire aux règles")).toBe("hidden");
    expect(await remove(ALICE, "h1")).toBe("deleted");
    // Lien masqué et lien signalé, supprimés avec leur élément.
    expect(await moderate(MODO, "lh", "hide", "Lien trompeur")).toBe("hidden");
    expect(await report(CAROL, "lr", "hate")).toBe("reported");
    expect(await moderate(MODO, "pp", "delete", "Contenu illicite")).toBe("deleted");
    // Signalé puis retiré, et classé : ils révéleraient un signalement.
    expect(await report(BOB, "rr")).toBe("reported");
    expect(await remove(ALICE, "rr")).toBe("deleted");
    expect(await report(BOB, "dd")).toBe("reported");
    expect(await moderate(MODO, "dd", "dismiss", "Conforme aux règles")).toBe("dismissed");
    expect(await moderate(MODO, "b1", "hide", "Contraire aux règles")).toBe("hidden");
    // Avis de l'auteur effacés (limite de 100) : les décisions restent dans son droit d'accès.
    await t.db.query("delete from public.collective_notices where user_id = $1", [ALICE]);
    expect((await decisions(ALICE)).map((d) => [d.action, d.item_id]).toSorted()).toEqual(
      [
        ["delete", "lh"],
        ["delete", "pp"],
        ["hide", "h1"],
        ["hide", "lh"],
        ["withdraw", "h1"],
      ].toSorted(),
    );
    expect(await decisions(BOB)).toEqual([{ action: "hide", item_id: "b1", reason: "Contraire aux règles", reports: 0 }]);
    expect(await decisions(MODO)).toEqual([]);
    expect(await decisions(CAROL)).toEqual([]);
  });
});

describe("limites et bornes de stockage", () => {
  it("50 ajouts par jour, comptés après la validation du contenu", async () => {
    await setHits(ALICE, "collective_create", limits.CREATES_PER_DAY - 1);
    await created(ALICE, "a1", "ping", ping());
    await expect(create(ALICE, "a2", "ping", ping())).rejects.toThrow(/collective_rate_limited/);
    await setHits(ALICE, "collective_change", limits.CHANGES_PER_DAY);
    await expect(update(ALICE, "a1", ping("x"))).rejects.toThrow(/collective_rate_limited/);
    await expect(remove(ALICE, "a1")).rejects.toThrow(/collective_rate_limited/);
  });

  it("lectures comptées : carte entière et état", async () => {
    await map(ALICE);
    await state(ALICE);
    expect(await hits(ALICE, "collective_read")).toBe(1);
    expect(await hits(ALICE, "collective_state")).toBe(1);
    await setHits(ALICE, "collective_read", limits.READS_PER_HOUR);
    await expect(map(ALICE)).rejects.toThrow(/collective_rate_limited/);
    await setHits(ALICE, "collective_state", limits.STATES_PER_HOUR);
    await expect(state(ALICE)).rejects.toThrow(/collective_rate_limited/);
  });

  it("place d'un auteur et de toute la carte", async () => {
    await t.db.query(
      `insert into public.collective_items (id, author_id, kind, data)
       select 'n' || g, $1, 'point', '{"ll":[0,0],"title":"","note":""}' from generate_series(1, ${limits.MAX_ITEMS_PER_AUTHOR}) as g`,
      [ALICE],
    );
    expect((await create(ALICE, "a1", "ping", ping())).status).toBe("author-full");
    await created(BOB, "b1", "ping", ping());
    await t.db.query("update public.collective_state set items = $1", [limits.MAX_MAP_ITEMS]);
    expect((await create(BOB, "b2", "ping", ping())).status).toBe("map-full");
    await t.db.query("update public.collective_state set items = 0, bytes = $1", [limits.MAX_MAP_BYTES]);
    expect((await create(BOB, "b2", "ping", ping())).status).toBe("map-full");
    expect(await update(BOB, "b1", ping("Titre plus long"))).toBe("map-full");
    // Une modification qui ne grandit pas passe toujours.
    expect(await update(BOB, "b1", ping("P"))).toBe("updated");
  });

  it("sommets d'un auteur (en vieillissant les ajouts pour passer la borne de 24 heures)", async () => {
    const points = Array.from({ length: 1000 }, (_, i) => [i / 100, 0]);
    const perDay = limits.MAX_DAILY_PATH_POINTS / 1000;
    for (let i = 0; i < limits.MAX_AUTHOR_PATH_POINTS / 1000; i++) {
      await created(ALICE, `f${i}`, "flux", flux(points));
      // Vieillis par lots d'une journée de sommets (chaque élément passe une seule fois).
      if ((i + 1) % perDay === 0) await age();
    }
    expect(await count("collective_items", `author_id = '${ALICE}' and updated_at > now() - interval '24 hours'`)).toBe(0);
    expect((await create(ALICE, "f99", "flux", flux())).status).toBe("author-full");
    await expectTotalsConsistent();
  }, 30_000);

  it("par période de 24 heures : 5 000 sommets et 128 Kio ajoutés au plus par auteur", async () => {
    const points = Array.from({ length: 1000 }, (_, i) => [i / 100, 0]);
    for (let i = 0; i < limits.MAX_DAILY_PATH_POINTS / 1000; i++) await created(ALICE, `f${i}`, "flux", flux(points));
    expect((await create(ALICE, "f99", "flux", flux())).status).toBe("daily-full");
    // Un tracé qui raccourcit, ou un élément sans tracé, passe encore ; un tracé qui grandit, non.
    expect(await update(ALICE, "f0", flux(points.slice(0, 998)))).toBe("updated");
    await created(ALICE, "p1", "ping", ping());
    await created(ALICE, "f5", "flux", flux());
    expect(await update(ALICE, "f5", flux([[0, 0], [1, 1], [2, 2]]))).toBe("daily-full");
    // Les autres comptes ne sont pas touchés.
    await created(BOB, "b1", "flux", flux(points));
    // 24 heures plus tard, l'auteur peut de nouveau ajouter.
    await age();
    await created(ALICE, "f99", "flux", flux(points));

    // Octets : des notes de 2 000 caractères de 4 octets chacun.
    const big = (n: number) => ({ ...ping(`Gros ${n}`), note: "😀".repeat(limits.MAX_ITEM_NOTE) });
    let status = "created";
    for (let i = 0; status === "created" && i < limits.CREATES_PER_DAY; i++) {
      status = (await create(MODO, `g${i}`, "ping", big(i))).status;
    }
    expect(status).toBe("daily-full");
    const { rows } = await t.db.query<{ total: number; one: number }>(
      "select sum(data_bytes)::int as total, max(data_bytes) as one from public.collective_items where author_id = $1",
      [MODO],
    );
    expect(rows[0].total).toBeLessThanOrEqual(limits.MAX_DAILY_BYTES);
    expect(rows[0].total + rows[0].one).toBeGreaterThan(limits.MAX_DAILY_BYTES);
    await expectTotalsConsistent();
  }, 30_000);
});

describe("signature des éléments", () => {
  it("le nom affiché peut être copié, l'identifiant public non : il distingue deux auteurs", async () => {
    await created(ALICE, "a1", "ping", ping("Vrai"));
    expect(await call(BOB, "public.update_my_profile('bob', 'Nom alice', '', 'members')")).toBe("saved");
    await created(BOB, "b1", "ping", ping("Faux"));
    const rows = await map(CAROL);
    expect(rows.map((r) => [r.id, r.author_name, r.author_handle])).toEqual([
      ["a1", "Nom alice", "alice"],
      ["b1", "Nom alice", "bob"],
    ]);
  });

  it("l'identifiant public est montré quelle que soit la visibilité du profil ; sans profil, l'élément n'est plus montré", async () => {
    await created(ALICE, "a1", "ping", ping());
    expect(await call(ALICE, "public.update_my_profile('alice', 'Nom alice', '', 'contacts')")).toBe("saved");
    expect((await map(BOB)).map((r) => r.author_handle)).toEqual(["alice"]);
    // Le profil lui-même reste masqué.
    expect(await t.as(BOB, "select * from public.profile_by_handle('alice')")).toEqual([]);
    const before = Number((await state(BOB)).revision);
    await t.as(ALICE, "delete from public.profiles where user_id = auth.uid()");
    // Jamais d'élément non signé pour les autres ; la version change pour qu'ils relisent la carte.
    expect(await map(BOB)).toEqual([]);
    const afterDelete = Number((await state(BOB)).revision);
    expect(afterDelete).toBeGreaterThan(before);
    // Un profil recréé : les éléments reviennent, signés du nouveau nom.
    expect(await call(ALICE, "public.create_my_profile('alice2', 'Alice bis', '', 'members')")).toBe("created");
    expect((await map(BOB)).map((r) => [r.id, r.author_name, r.author_handle])).toEqual([["a1", "Alice bis", "alice2"]]);
    const afterCreate = Number((await state(BOB)).revision);
    expect(afterCreate).toBeGreaterThan(afterDelete);
    expect(await call(ALICE, "public.update_my_profile('alice2', 'Alice ter', '', 'members')")).toBe("saved");
    expect(Number((await state(BOB)).revision)).toBeGreaterThan(afterCreate);
    // Enregistrer sans changer ni l'identifiant ni le nom ne change pas la version : rien à relire.
    const saved = Number((await state(BOB)).revision);
    for (let i = 0; i < 3; i += 1) {
      expect(await call(ALICE, "public.update_my_profile('alice2', 'Alice ter', $1, 'members')", [`Bio ${i}`])).toBe("saved");
    }
    expect(Number((await state(BOB)).revision)).toBe(saved);
    // Au-delà de la limite de changements de nom, la version ne change plus.
    await t.db.query("update public.rate_limits set hits = 50 where user_id = $1 and action = 'profile_change'", [ALICE]);
    expect(await call(ALICE, "public.update_my_profile('alice2', 'Alice quater', '', 'members')")).toBe("rate-limited");
    expect(Number((await state(BOB)).revision)).toBe(saved);
    // Le profil d'un compte sans élément ne change pas la version.
    const quiet = Number((await state(BOB)).revision);
    expect(await call(BOB, "public.update_my_profile('bob', 'Bob', '', 'members')")).toBe("saved");
    expect(Number((await state(BOB)).revision)).toBe(quiet);
  });
});

describe("identifiants des éléments", () => {
  it("même réponse « id-taken » pour un élément visible, masqué, d'un compte bloqué ou supprimé", async () => {
    await created(ALICE, "v1", "ping", ping());
    await created(ALICE, "h1", "ping", ping());
    await created(ALICE, "z1", "ping", ping());
    await created(ALICE, "d1", "ping", ping());
    expect(await moderate(MODO, "h1", "hide")).toBe("hidden");
    expect(await remove(ALICE, "d1")).toBe("deleted");
    await t.db.query("insert into public.contact_blocks (blocker_id, blocked_id) values ($1, $2)", [ALICE, BOB]);
    expect(await ids(BOB)).toEqual([]);
    for (const id of ["v1", "h1", "z1", "d1"]) expect((await create(BOB, id, "ping", ping())).status, id).toBe("id-taken");
    // Rien n'a été créé ni écrasé.
    expect(await count("collective_items", `author_id = '${BOB}'`)).toBe(0);
    // La suppression du compte de l'auteur n'y change rien : l'identifiant reste pris.
    await t.addUsers(EVE);
    await t.as(EVE, "select public.create_my_profile('eve', 'Eve', '', 'members')");
    await created(EVE, "e1", "ping", ping());
    await t.db.query("delete from auth.users where id = $1", [EVE]);
    expect((await create(BOB, "e1", "ping", ping())).status).toBe("id-taken");
  });

  it("l'auteur reprend l'identifiant d'un élément qu'il a supprimé (annulation), sauf après une modération", async () => {
    await created(ALICE, "a1", "ping", ping());
    expect(await remove(ALICE, "a1")).toBe("deleted");
    await created(ALICE, "a1", "ping", ping());
    expect(await moderate(MODO, "a1", "delete")).toBe("deleted");
    expect((await create(ALICE, "a1", "ping", ping())).status).toBe("id-taken");
  });
});

describe("modération : pas de contournement", () => {
  it("masqué, supprimé puis recréé à l'identique par son auteur : refusé, et le retrait est au journal", async () => {
    await created(ALICE, "h1", "ping", ping("Haine"));
    expect(await report(CAROL, "h1", "hate")).toBe("reported");
    expect(await moderate(MODO, "h1", "hide", "Contenu haineux")).toBe("hidden");
    expect(await remove(ALICE, "h1")).toBe("deleted");
    expect((await create(ALICE, "h1", "ping", ping("Haine"))).status).toBe("id-taken");
    expect(await ids(CAROL)).toEqual([]);
    const log = await t.as<Row>(
      MODO,
      "select action, item_id, reason, reports, moderator_name, author_handle from public.collective_moderation_log()",
    );
    expect(log).toEqual([
      { action: "withdraw", item_id: "h1", reason: "Retiré par son auteur.", reports: 0, moderator_name: null, author_handle: "alice" },
      { action: "hide", item_id: "h1", reason: "Contenu haineux", reports: 1, moderator_name: "Nom dora", author_handle: "alice" },
    ]);
  });

  it("signalé puis supprimé par son auteur avant toute décision : la trace reste, l'élément reste à juger dans la file", async () => {
    await created(ALICE, "s1", "ping", ping("Signalé"));
    await created(ALICE, "l1", "link", link("p:s1", "c:FRA", "Lien signalé"));
    await created(ALICE, "ok", "ping", ping("Sans histoire"));
    expect(await report(CAROL, "s1", "spam")).toBe("reported");
    expect(await report(BOB, "s1", "hate", "Précision")).toBe("reported");
    expect(await report(BOB, "l1", "spam")).toBe("reported");
    expect(await remove(ALICE, "s1")).toBe("deleted");
    expect(await ids(BOB)).toEqual(["ok"]);
    expect(await remove(ALICE, "ok")).toBe("deleted");
    const log = await t.as<Row>(MODO, "select action, item_id, item_title, reports from public.collective_moderation_log() order by item_id");
    expect(log).toEqual([
      { action: "withdraw", item_id: "l1", item_title: "Lien signalé", reports: 1 },
      { action: "withdraw", item_id: "s1", item_title: "Signalé", reports: 2 },
    ]);
    // Les signalements restent en attente : personne n'est informé d'un simple retrait.
    expect(await notices(CAROL)).toEqual([]);
    expect(await notices(BOB)).toEqual([]);
    expect(await notices(ALICE)).toEqual([]);
    expect(await count("collective_reports", "status = 'open'")).toBe(3);
    // La file les garde, « retirés », avec le contenu signalé et l'auteur.
    const queue = await t.as<Row>(
      MODO,
      "select id, kind, data, status, author_handle, created_at, open_reports, reasons, details, reported_data from public.collective_moderation_queue() order by id",
    );
    expect(queue).toEqual([
      {
        id: "l1",
        kind: "link",
        data: link("p:s1", "c:FRA", "Lien signalé"),
        status: "withdrawn",
        author_handle: "alice",
        created_at: null,
        open_reports: 1,
        reasons: ["spam"],
        details: [],
        reported_data: [],
      },
      {
        id: "s1",
        kind: "ping",
        data: ping("Signalé"),
        status: "withdrawn",
        author_handle: "alice",
        created_at: null,
        open_reports: 2,
        reasons: ["hate", "spam"],
        details: ["Précision"],
        reported_data: [],
      },
    ]);
    // Un élément retiré ne se masque ni ne se rétablit ; il se supprime (signalements retenus) ou se classe.
    expect(await moderate(MODO, "s1", "hide")).toBe("not-found");
    expect(await moderate(MODO, "s1", "restore")).toBe("not-found");
    expect(await moderate(MODO, "s1", "delete", "Contenu haineux", true)).toBe("deleted");
    expect((await state(ALICE)).suspended_until).toBeInstanceOf(Date);
    expect((await notices(ALICE)).map((n) => [n.role, n.action, n.item_id, n.item_title])).toEqual([["author", "delete", "s1", "Signalé"]]);
    expect((await notices(CAROL)).map((n) => [n.role, n.action, n.item_id])).toEqual([["reporter", "delete", "s1"]]);
    expect(await moderate(MODO, "l1", "dismiss", "Lien sans problème")).toBe("dismissed");
    expect((await notices(BOB)).map((n) => [n.action, n.item_id]).toSorted()).toEqual([["delete", "s1"], ["dismiss", "l1"]]);
    expect(await t.as(MODO, "select id from public.collective_moderation_queue()")).toEqual([]);
    expect(await count("collective_report_copies")).toBe(0);
    // Signalements retenus : l'identifiant ne resservira pas ; classés : il reste libre pour l'auteur.
    await t.db.query("delete from public.collective_suspensions");
    expect((await create(ALICE, "s1", "ping", ping())).status).toBe("id-taken");
    expect((await create(ALICE, "l1", "ping", ping())).status).toBe("created");
    // Un élément sans signalement ni masquage ne laisse aucune trace.
    await created(ALICE, "ok", "ping", ping());
  });

  it("retraits répétés d'un même identifiant : une seule ligne au journal tant qu'aucun modérateur n'a décidé", async () => {
    const log = () => t.as<Row>(MODO, "select action, item_id, reports from public.collective_moderation_log() order by created_at, action");
    await created(ALICE, "loop", "ping", ping());
    expect(await report(BOB, "loop", "hate")).toBe("reported");
    for (let i = 0; i < 5; i += 1) {
      expect(await remove(ALICE, "loop")).toBe("deleted");
      expect((await create(ALICE, "loop", "ping", ping())).status).toBe("created");
    }
    expect(await log()).toEqual([{ action: "withdraw", item_id: "loop", reports: 1 }]);
    // Le nombre de signalements en attente reste juste.
    expect(await report(CAROL, "loop", "spam")).toBe("reported");
    expect(await remove(ALICE, "loop")).toBe("deleted");
    expect(await log()).toEqual([{ action: "withdraw", item_id: "loop", reports: 2 }]);
    // Après une décision d'un modérateur, un nouveau retrait d'un élément signalé est de nouveau inscrit.
    expect(await moderate(MODO, "loop", "dismiss", "Conforme aux règles")).toBe("dismissed");
    expect((await create(ALICE, "loop", "ping", ping())).status).toBe("created");
    expect(await report(BOB, "loop", "hate")).toBe("reported");
    expect(await remove(ALICE, "loop")).toBe("deleted");
    expect(await log()).toEqual([
      { action: "withdraw", item_id: "loop", reports: 2 },
      { action: "dismiss", item_id: "loop", reports: 2 },
      { action: "withdraw", item_id: "loop", reports: 1 },
    ]);
  });

  it("signalé, retiré puis recréé par son auteur : même réponse que sans signalement, et le signalement le vise de nouveau", async () => {
    await created(ALICE, "bait1", "ping", ping());
    expect(await remove(ALICE, "bait1")).toBe("deleted");
    expect((await create(ALICE, "bait1", "ping", ping())).status).toBe("created");
    await created(ALICE, "bait2", "ping", ping());
    expect(await report(BOB, "bait2", "hate")).toBe("reported");
    expect(await remove(ALICE, "bait2")).toBe("deleted");
    expect((await create(ALICE, "bait2", "ping", ping())).status).toBe("created");
    // La trace du retrait reste au journal ; personne n'est informé ; le signalement attend toujours.
    expect(await t.as<Row>(MODO, "select action, item_id from public.collective_moderation_log()")).toEqual([
      { action: "withdraw", item_id: "bait2" },
    ]);
    expect(await notices(BOB)).toEqual([]);
    expect(await notices(ALICE)).toEqual([]);
    expect(await t.as(MODO, "select id, status, open_reports from public.collective_moderation_queue()")).toEqual([
      { id: "bait2", status: "visible", open_reports: 1 },
    ]);
    expect(await report(BOB, "bait2", "hate")).toBe("already-reported");
  });

  it("retrait puis recréation à l'aveugle : le contenu signalé, les signalements et la décision restent", async () => {
    await created(ALICE, "x1", "ping", ping("Contenu haineux"));
    expect(await report(BOB, "x1", "hate")).toBe("reported");
    expect(await report(CAROL, "x1", "hate")).toBe("reported");
    // L'auteur, sans rien savoir, neutralise le titre, retire puis recrée (même identifiant, puis un autre).
    expect(await update(ALICE, "x1", ping("Port"))).toBe("updated");
    expect(await remove(ALICE, "x1")).toBe("deleted");
    expect((await create(ALICE, "x1", "ping", ping("Contenu haineux"))).status).toBe("created");
    const queue = () =>
      t.as<Row>(MODO, "select id, data, status, open_reports, reported_data from public.collective_moderation_queue() order by id");
    expect(await queue()).toEqual([{ id: "x1", data: ping("Contenu haineux"), status: "visible", open_reports: 2, reported_data: [] }]);
    // Sous un autre identifiant : l'ancien reste dans la file avec la copie signalée.
    expect(await update(ALICE, "x1", ping("Port"))).toBe("updated");
    expect(await remove(ALICE, "x1")).toBe("deleted");
    await created(ALICE, "x2", "ping", ping("Contenu haineux"));
    expect(await queue()).toEqual([{ id: "x1", data: ping("Contenu haineux"), status: "withdrawn", open_reports: 2, reported_data: [] }]);
    expect(await count("collective_reports", "status = 'open'")).toBe(2);
    // Le modérateur juge le contenu signalé et suspend l'auteur.
    expect(await moderate(MODO, "x1", "delete", "Propos haineux", true)).toBe("deleted");
    const log = await t.as<Row>(MODO, "select action, item_title, reports, suspended_until is not null as suspended from public.collective_moderation_log()");
    expect(log[0]).toEqual({ action: "delete", item_title: "Contenu haineux", reports: 2, suspended: true });
    expect((await create(ALICE, "x3", "ping", ping())).status).toBe("suspended");
  });

  it("copies des contenus signalés : une par élément et par contenu, 8 Mio pour toute la carte", async () => {
    const reporters = Array.from({ length: 5 }, (_, i) => `f0000000-0000-4000-8000-00000000000${i}`);
    await t.addUsers(...reporters);
    await created(ALICE, "big", "ping", { ...ping("Gros"), note: "n".repeat(2000) });
    for (const user of reporters) expect(await report(user, "big", "spam")).toBe("reported");
    // Cinq signalements du même contenu : une seule copie.
    expect(await count("collective_report_copies")).toBe(1);
    expect(await count("collective_reports", "copy_id is not null")).toBe(5);
    const bytes = async () =>
      (await t.db.query<{ report_bytes: string; copies: string }>(
        "select report_bytes::text, (select coalesce(sum(data_bytes), 0) from public.collective_report_copies)::text as copies from public.collective_state",
      )).rows[0];
    const first = await bytes();
    expect(first.report_bytes).toBe(first.copies);
    // Le contenu change : une copie de plus.
    expect(await update(ALICE, "big", ping("Autre"))).toBe("updated");
    expect(await report(BOB, "big", "spam")).toBe("reported");
    expect(await count("collective_report_copies")).toBe(2);
    // Budget atteint : le signalement est enregistré, sans copie.
    await t.db.query(`update public.collective_state set report_bytes = ${limits.MAX_REPORT_COPIES_BYTES} - 10`);
    expect(await update(ALICE, "big", ping("Encore autre"))).toBe("updated");
    expect(await report(CAROL, "big", "spam")).toBe("reported");
    expect(await count("collective_report_copies")).toBe(2);
    expect(await count("collective_reports", `reporter_id = '${CAROL}' and copy_id is null and status = 'open'`)).toBe(1);
    // Un signalant supprime son compte : la copie reste tant qu'un autre signalement y renvoie.
    await t.db.query("delete from auth.users where id = $1", [reporters[0]]);
    expect(await count("collective_report_copies")).toBe(2);
    // Décision : les copies sont effacées, et le total revient au point de départ.
    await t.db.query(`update public.collective_state set report_bytes = (select coalesce(sum(data_bytes), 0) from public.collective_report_copies)`);
    expect(await moderate(MODO, "big", "dismiss", "Conforme")).toBe("dismissed");
    expect(await count("collective_report_copies")).toBe(0);
    expect((await bytes()).report_bytes).toBe("0");
    for (const user of reporters.slice(1)) await t.db.query("delete from auth.users where id = $1", [user]);
  });

  it("file par pages : aucun signalement en attente n'est repoussé hors de la file par des signalements plus récents", async () => {
    type Entry = { id: string; status: string; open_reports: number; total: number };
    const page = (n: number) => t.as<Entry>(MODO, "select id, status, open_reports, total from public.collective_moderation_queue($1)", [n]);
    const all = async () => {
      const rows: Entry[] = [];
      for (let n = 0; ; n++) {
        const next = await page(n);
        if (next.length === 0) return rows;
        rows.push(...next);
      }
    };
    // Un vrai signalement, puis 230 signalements plus récents (11 comptes neufs, sans profil,
    // 20 signalements chacun suffisent ; écrits ici par un seul, en base), et un élément masqué.
    await created(ALICE, "vrai", "ping", ping("Vrai problème"));
    expect(await report(BOB, "vrai", "hate", "Propos haineux")).toBe("reported");
    await created(ALICE, "cache", "ping", ping());
    expect(await moderate(MODO, "cache", "hide")).toBe("hidden");
    await t.db.query(
      `insert into public.collective_items (id, author_id, kind, data)
       select 's' || g, $1, 'point', '{"ll":[0,0],"title":"","note":""}' from generate_series(1, 230) as g`,
      [BOB],
    );
    await t.db.query(
      `insert into public.collective_reports (item_id, item_kind, reporter_id, reason, created_at)
       select 's' || g, 'point', $1, 'spam', v.at + g * ((now() - v.at) / 231)
       from generate_series(1, 230) as g, (select created_at as at from public.collective_reports where item_id = 'vrai') as v`,
      [CAROL],
    );
    const first = await page(0);
    expect(first).toHaveLength(limits.MODERATION_PAGE_SIZE);
    // Du plus ancien signalement en attente au plus récent : le vrai d'abord.
    expect(first[0]).toEqual({ id: "vrai", status: "visible", open_reports: 1, total: 232 });
    expect(first.slice(1, 3).map((r) => r.id)).toEqual(["s1", "s2"]);
    const rows = await all();
    expect(rows).toHaveLength(232);
    expect(new Set(rows.map((r) => r.id)).size).toBe(232);
    // L'élément masqué sans signalement vient après tous les signalements.
    expect(rows.at(-1)).toMatchObject({ id: "cache", status: "hidden", open_reports: 0 });

    // Un signalement plus récent que tous les autres reste dans la file (dernière page) ; un
    // contenu signalé comme illicite passe devant tous les autres.
    await created(ALICE, "tard", "ping", ping());
    await created(ALICE, "illicite", "ping", ping());
    expect(await report(CAROL, "tard", "spam")).toBe("reported");
    expect(await report(CAROL, "illicite", "illegal", "Apologie d'un crime, article 421-2-5 du code pénal", true)).toBe("reported");
    expect((await page(0))[0]).toMatchObject({ id: "illicite", total: 234 });
    expect((await page(2)).map((r) => r.id)).toContain("tard");
    expect(await page(3)).toEqual([]);
    // Page hors bornes : refusée avant d'être comptée.
    const before = await hits(MODO, "collective_read");
    for (const bad of [-1, 1001, null]) {
      await expect(page(bad as number), String(bad)).rejects.toThrow(/collective_invalid/);
    }
    expect(await hits(MODO, "collective_read")).toBe(before);
    // Sans argument : la première page.
    expect((await t.as<Entry>(MODO, "select id from public.collective_moderation_queue()"))[0]).toEqual({ id: "illicite" });
  });

  it("un modérateur ne voit ni dans la file ni au journal ce qui concerne ses propres éléments", async () => {
    const OTHER = "99999999-9999-4999-8999-999999999999";
    await t.addUsers(OTHER);
    await t.db.query("insert into public.moderators (user_id) values ($1)", [OTHER]);
    await created(MODO, "m1", "ping", ping("Du modérateur"));
    await created(MODO, "m2", "ping", ping("Retiré"));
    expect(await report(BOB, "m1", "hate", "Précision")).toBe("reported");
    expect(await report(BOB, "m2", "hate")).toBe("reported");
    expect(await remove(MODO, "m2")).toBe("deleted");
    expect(await t.as(MODO, "select id from public.collective_moderation_queue()")).toEqual([]);
    expect(await t.as(MODO, "select id from public.collective_moderation_log()")).toEqual([]);
    expect((await t.as<Row>(OTHER, "select id from public.collective_moderation_queue() order by id")).map((r) => r.id)).toEqual(["m1", "m2"]);
    expect(await moderate(MODO, "m2", "dismiss", "Classé")).toBe("own-item");
    // Aucune réponse ne lui dit si son élément retiré est signalé : un élément retiré sans
    // signalement donne la même réponse, quelle que soit la décision demandée.
    await created(MODO, "m3", "ping", ping("Retiré sans signalement"));
    expect(await remove(MODO, "m3")).toBe("deleted");
    for (const action of ["hide", "restore", "delete", "dismiss"]) {
      for (const id of ["m2", "m3"]) expect(await moderate(MODO, id, action, "Essai"), `${action} ${id}`).toBe("own-item");
    }
    // Un identifiant jamais utilisé reste introuvable.
    expect(await moderate(MODO, "jamais", "dismiss", "Essai")).toBe("not-found");
    expect(await moderate(OTHER, "m1", "dismiss", "Conforme")).toBe("dismissed");
    expect(await t.as(MODO, "select id from public.collective_moderation_log()")).toEqual([]);
    expect((await t.as<Row>(OTHER, "select action from public.collective_moderation_log()")).map((r) => r.action).toSorted()).toEqual([
      "dismiss",
      "withdraw",
    ]);
    await t.db.query("delete from auth.users where id = $1", [OTHER]);
  });

  it("modifié après un signalement : la file montre le contenu signalé ; un signalement traité se refait si l'élément a changé", async () => {
    const queue = () =>
      t.as<{ id: string; data: Row; reported_data: Row[] }>(MODO, "select id, data, reported_data from public.collective_moderation_queue()");
    await created(ALICE, "b1", "ping", ping("Contenu haineux"));
    expect(await report(BOB, "b1", "hate")).toBe("reported");
    expect(await queue()).toEqual([{ id: "b1", data: ping("Contenu haineux"), reported_data: [] }]);
    expect(await update(ALICE, "b1", ping("Port de Marseille"))).toBe("updated");
    expect(await report(CAROL, "b1", "spam")).toBe("reported");
    // Le modérateur voit le contenu actuel ET celui que Bob a signalé (celui de Carol est l'actuel).
    expect(await queue()).toEqual([{ id: "b1", data: ping("Port de Marseille"), reported_data: [ping("Contenu haineux")] }]);
    expect(await report(BOB, "b1", "hate")).toBe("already-reported");

    expect(await moderate(MODO, "b1", "dismiss", "Conforme aux règles")).toBe("dismissed");
    // Copies effacées une fois les signalements traités.
    expect(await count("collective_report_copies")).toBe(0);
    expect(await report(BOB, "b1", "hate")).toBe("already-reported");
    // L'auteur remet le contenu signalé : Bob peut le signaler de nouveau.
    expect(await update(ALICE, "b1", ping("Contenu haineux"))).toBe("updated");
    expect(await report(BOB, "b1", "hate")).toBe("reported");
    expect(await report(BOB, "b1", "hate")).toBe("already-reported");

    // Masqué puis rétabli : pas de nouveau signalement tant que rien ne change, puis de nouveau possible.
    expect(await moderate(MODO, "b1", "hide", "Propos haineux")).toBe("hidden");
    expect(await moderate(MODO, "b1", "restore", "Rétabli après examen")).toBe("restored");
    expect(await report(BOB, "b1", "hate")).toBe("already-reported");
    expect(await update(ALICE, "b1", ping("Encore autre chose"))).toBe("updated");
    expect(await report(BOB, "b1", "hate")).toBe("reported");
    expect(await t.as(BOB, "select item_id, status from public.my_collective_reports()")).toEqual([
      { item_id: "b1", status: "resolved" },
      { item_id: "b1", status: "resolved" },
      { item_id: "b1", status: "open" },
    ]);
  });

  it("supprimé par un modérateur : ses liens signalés ont leur décision, ceux qui les avaient signalés sont informés, aucun identifiant ne resservira", async () => {
    await created(ALICE, "pp", "ping", ping("Point"));
    await created(ALICE, "ll", "link", link("p:pp", "c:FRA", "Lien haineux"));
    await created(ALICE, "l2", "link", link("p:pp", "c:DEU", "Lien sans histoire"));
    expect(await report(CAROL, "ll", "hate")).toBe("reported");
    expect(await moderate(MODO, "pp", "delete", "Contenu illicite")).toBe("deleted");
    const log = await t.as<Row>(
      MODO,
      "select action, item_id, item_title, reason, reports, moderator_name from public.collective_moderation_log() order by item_id",
    );
    expect(log).toEqual([
      {
        action: "delete",
        item_id: "ll",
        item_title: "Lien haineux",
        reason: "Supprimé avec l'élément auquel il était rattaché. Contenu illicite",
        reports: 1,
        moderator_name: "Nom dora",
      },
      { action: "delete", item_id: "pp", item_title: "Point", reason: "Contenu illicite", reports: 0, moderator_name: "Nom dora" },
    ]);
    expect((await notices(CAROL)).map((n) => [n.role, n.action, n.item_id])).toEqual([["reporter", "delete", "ll"]]);
    // L'auteur n'a que l'avis de l'élément supprimé (rien ne lui dit que son lien était signalé).
    expect((await notices(ALICE)).map((n) => [n.action, n.item_id])).toEqual([["delete", "pp"]]);
    for (const id of ["pp", "ll", "l2"]) expect((await create(ALICE, id, "ping", ping())).status, id).toBe("id-taken");
    await expectTotalsConsistent();
  });

  it("suspension : prononcée avec un masquage ou une suppression, elle bloque ajouts et modifications 30 jours", async () => {
    await created(ALICE, "a1", "ping", ping("Haine"));
    await created(ALICE, "a2", "ping", ping("Autre"));
    expect(await report(BOB, "a1", "hate")).toBe("reported");
    await expect(moderate(MODO, "a1", "dismiss", "Motif", true)).rejects.toThrow(/collective_invalid/);
    await expect(moderate(MODO, "a1", "restore", "Motif", true)).rejects.toThrow(/collective_invalid/);
    await expect(moderate(MODO, "a1", "hide", "Motif", null)).rejects.toThrow(/collective_invalid/);
    expect(await moderate(MODO, "a1", "hide", "Contenu haineux", true)).toBe("hidden");

    const until = (await state(ALICE)).suspended_until;
    expect(until).toBeInstanceOf(Date);
    const days = ((until as Date).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(limits.SUSPENSION_DAYS - 0.01);
    expect(days).toBeLessThan(limits.SUSPENSION_DAYS + 0.01);
    expect((await state(BOB)).suspended_until).toBeNull();

    // Ni ajout ni modification (essais non comptés) ; supprimer et signaler restent possibles.
    expect((await create(ALICE, "n1", "ping", ping("Recréé"))).status).toBe("suspended");
    expect(await update(ALICE, "a2", ping("Modifié"))).toBe("suspended");
    expect(await hits(ALICE, "collective_create")).toBe(2);
    await created(BOB, "b1", "ping", ping());
    expect(await report(ALICE, "b1")).toBe("reported");
    expect(await remove(ALICE, "a2")).toBe("deleted");

    // L'auteur en est informé ; le journal la garde ; les membres qui avaient signalé ne la voient pas.
    expect((await t.as<Row>(ALICE, "select action, suspended_until from public.my_collective_notices()"))[0]).toEqual({
      action: "hide",
      suspended_until: until,
    });
    expect(await t.as<Row>(BOB, "select suspended_until from public.my_collective_notices()")).toEqual([{ suspended_until: null }]);
    expect((await t.as<Row>(MODO, "select action, suspended_until from public.collective_moderation_log()"))[0]).toEqual({
      action: "hide",
      suspended_until: until,
    });
    expect(await t.as<Row>(MODO, "select suspended_until from public.my_moderation_decisions()")).toEqual([{ suspended_until: until }]);

    // Rétablir l'élément lève la suspension prononcée sur lui.
    expect(await moderate(MODO, "a1", "restore", "Erreur")).toBe("restored");
    expect((await state(ALICE)).suspended_until).toBeNull();
    await created(ALICE, "n2", "ping", ping());
  });

  it("suspension : rétablir un élément ne lève pas celle qu'une autre décision justifie encore", async () => {
    await created(ALICE, "sx", "ping", ping("X"));
    await created(ALICE, "sy", "ping", ping("Y"));
    await created(ALICE, "sz", "ping", ping("Z"));
    expect(await moderate(MODO, "sx", "hide", "Contenu haineux", true)).toBe("hidden");
    const untilX = (await state(ALICE)).suspended_until;
    expect(await moderate(MODO, "sy", "hide", "Contenu haineux", true)).toBe("hidden");
    // Rétablir Y : la suspension prononcée pour X, toujours masqué, reste.
    expect(await moderate(MODO, "sy", "restore", "Erreur")).toBe("restored");
    expect((await state(ALICE)).suspended_until).toEqual(untilX);
    expect((await create(ALICE, "n1", "ping", ping())).status).toBe("suspended");
    // Une décision suivie d'un rétablissement du même élément ne compte plus.
    expect(await moderate(MODO, "sy", "hide", "Encore", false)).toBe("hidden");
    expect(await moderate(MODO, "sx", "restore", "Erreur aussi")).toBe("restored");
    expect((await state(ALICE)).suspended_until).toBeNull();
    expect((await create(ALICE, "n2", "ping", ping())).status).toBe("created");

    // Une suppression avec suspension tient toujours ; rétablir un autre élément n'y change rien.
    expect(await moderate(MODO, "sz", "delete", "Spam", true)).toBe("deleted");
    const untilZ = (await state(ALICE)).suspended_until;
    expect(await moderate(MODO, "sy", "restore", "Erreur")).toBe("restored");
    expect((await state(ALICE)).suspended_until).toEqual(untilZ);
  });

  it("suspension : la plus longue l'emporte ; échue, elle ne bloque plus ; levée à la main", async () => {
    await created(ALICE, "a1", "ping", ping());
    await created(ALICE, "a2", "ping", ping());
    await t.db.query("insert into public.collective_suspensions (user_id, until) values ($1, now() + interval '90 days')", [ALICE]);
    expect(await moderate(MODO, "a1", "delete", "Spam", true)).toBe("deleted");
    const { rows } = await t.db.query<{ days: number }>(
      "select round(extract(epoch from until - now()) / 86400)::int as days from public.collective_suspensions where user_id = $1",
      [ALICE],
    );
    expect(rows[0].days).toBe(90);
    await t.db.query("update public.collective_suspensions set until = now() - interval '1 second'");
    expect((await state(ALICE)).suspended_until).toBeNull();
    // Échue : effacée à la lecture de l'état (collective_purge).
    expect(await count("collective_suspensions")).toBe(0);
    expect(await update(ALICE, "a2", ping("Libre"))).toBe("updated");
    await t.db.query("insert into public.collective_suspensions (user_id, until) values ($1, now() + interval '1 day')", [ALICE]);
    expect(await update(ALICE, "a2", ping("Bloqué"))).toBe("suspended");
    await t.db.query("delete from public.collective_suspensions where user_id = $1", [ALICE]);
    expect(await update(ALICE, "a2", ping("Libre encore"))).toBe("updated");
  });
});

describe("comptes supprimés", () => {
  it("les éléments, signalements et avis partent avec le compte ; le journal garde la décision", async () => {
    await created(ALICE, "a1", "ping", ping());
    await created(BOB, "b1", "ping", ping());
    expect(await report(BOB, "a1")).toBe("reported");
    expect(await report(ALICE, "b1")).toBe("reported");
    expect(await moderate(MODO, "a1", "hide", "Contraire aux règles", true)).toBe("hidden");
    expect(await count("collective_suspensions", `user_id = '${ALICE}'`)).toBe(1);
    await t.db.query("delete from auth.users where id = $1", [ALICE]);
    expect(await count("collective_suspensions")).toBe(0);
    expect(await count("collective_items", `author_id = '${ALICE}'`)).toBe(0);
    expect(await count("collective_reports", `reporter_id = '${ALICE}'`)).toBe(0);
    expect(await count("collective_notices", `user_id = '${ALICE}'`)).toBe(0);
    expect(await t.db.query("select author_id, action from public.collective_decisions")).toMatchObject({
      rows: [{ author_id: null, action: "hide" }],
    });
    // Le signalement de Bob est parti avec l'élément ; son avis reste.
    expect(await count("collective_reports")).toBe(0);
    expect((await notices(BOB)).length).toBe(1);
    await expectTotalsConsistent();
    // Identifiant toujours pris, sans auteur ; aucune suspension ne reste.
    expect((await t.db.query("select author_id from public.collective_item_ids where id = 'a1'")).rows).toEqual([{ author_id: null }]);
    await t.addUsers(ALICE);
  });

  it("le modérateur retiré de la table n'a plus accès", async () => {
    await t.db.query("delete from public.moderators where user_id = $1", [MODO]);
    await expect(t.as(MODO, "select * from public.collective_moderation_queue()")).rejects.toThrow(/collective_forbidden/);
    expect(MIGRATIONS.join("\n")).not.toMatch(/insert into public\.moderators/i);
  });
});
