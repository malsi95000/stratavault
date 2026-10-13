// Politiques RLS, droits et déclencheurs des migrations des cartes, exécutés sur un vrai PostgreSQL
// (PGlite). Les écritures du contenu passent par public.create_map / public.update_map_data, comme
// dans l'application (fonctions testées en détail dans writeFunctions.test.ts) ; les écritures
// « propriétaire » (db.query) servent à préparer des cas que l'API ne permet pas.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BLANK_DOC, MIGRATIONS, SUPABASE_STUB, openTestDb, type TestDb } from "@/test/pglite";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let t: TestDb;
const as = <T>(userId: string | null, sql: string, params: unknown[] = []) => t.as<T>(userId, sql, params);

type Info = { id: string; name: string; revision: string };

/** Crée une carte comme l'application (RPC create_map). */
const createMap = (userId: string, name: string, doc: object = BLANK_DOC) =>
  as<Info>(userId, "select id, name, revision::text from public.create_map($1, $2)", [name, JSON.stringify(doc)]);

/** Remplace le contenu comme l'application (RPC update_map_data, version attendue). */
const updateData = (userId: string, id: string, doc: object, revision: string) =>
  as<Info>(userId, "select id, name, revision::text from public.update_map_data($1, $2, $3)", [
    id,
    JSON.stringify(doc),
    revision,
  ]);

beforeAll(async () => {
  t = await openTestDb();
  await t.addUsers(ALICE, BOB);
}, 60_000);

afterAll(async () => {
  await t?.db.close();
});

describe("migration public.maps (RLS)", () => {
  it("attribue la carte à l'utilisateur connecté (auth.uid())", async () => {
    const [map] = await createMap(ALICE, "Sahel");
    const [row] = await as<{ user_id: string }>(ALICE, "select user_id from public.maps where id = $1", [map.id]);
    expect(row.user_id).toBe(ALICE);
  });

  it("chaque utilisateur ne voit, ne renomme et ne supprime que ses cartes", async () => {
    const [bobMap] = await createMap(BOB, "Carte de Bob");
    expect(await as(ALICE, "select id from public.maps where id = $1", [bobMap.id])).toEqual([]);
    expect(await as(ALICE, "update public.maps set name = 'volée' where id = $1 returning id", [bobMap.id])).toEqual([]);
    expect(await as(ALICE, "delete from public.maps where id = $1 returning id", [bobMap.id])).toEqual([]);
    const [still] = await as<{ name: string }>(BOB, "select name from public.maps where id = $1", [bobMap.id]);
    expect(still.name).toBe("Carte de Bob");
    const names = await as<{ name: string }>(ALICE, "select name from public.maps");
    expect(names.map((r) => r.name)).not.toContain("Carte de Bob");
  });

  it("refuse d'écrire user_id, created_at ou updated_at (droits par colonne)", async () => {
    const [map] = await createMap(ALICE, "À moi");
    await expect(as(ALICE, "update public.maps set user_id = $1 where id = $2", [BOB, map.id])).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      as(ALICE, "update public.maps set updated_at = now() - interval '1 year' where id = $1", [map.id]),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuse tout accès au rôle anonyme", async () => {
    await expect(as(null, "select * from public.maps")).rejects.toThrow(/permission denied/);
    await expect(as(null, "insert into public.maps (name, data) values ('x', '{}')")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("met à jour updated_at quand le contenu change, pas quand la carte est renommée", async () => {
    const [map] = await createMap(ALICE, "Horodatée");
    const age = "update public.maps set updated_at = now() - interval '1 day' where id = $1";
    const fresh = "select updated_at > now() - interval '1 minute' as fresh from public.maps where id = $1";
    await t.db.query(age, [map.id]);
    await as(ALICE, "update public.maps set name = 'Renommée' where id = $1", [map.id]);
    expect((await as<{ fresh: boolean }>(ALICE, fresh, [map.id]))[0].fresh).toBe(false);
    await updateData(ALICE, map.id, { ...BLANK_DOC, notes: { FRA: "x" } }, map.revision);
    expect((await as<{ fresh: boolean }>(ALICE, fresh, [map.id]))[0].fresh).toBe(true);
  });

  it("change la version à chaque modification du contenu, sans que le client puisse l'écrire", async () => {
    const [map] = await createMap(ALICE, "Versionnée");
    const revision = async () =>
      (await as<{ revision: string }>(ALICE, "select revision::text from public.maps where id = $1", [map.id]))[0].revision;
    const first = await revision();
    await as(ALICE, "update public.maps set name = 'Renommée' where id = $1", [map.id]);
    expect(await revision()).toBe(first);
    const [written] = await updateData(ALICE, map.id, { ...BLANK_DOC, notes: { FRA: "v2" } }, first);
    const second = written.revision;
    expect(BigInt(second) > BigInt(first)).toBe(true);
    // Contenu identique (« Continuer » sur un autre appareil) : la date change, pas la version.
    const updatedAt = async () =>
      (await as<{ u: string }>(ALICE, "select updated_at::text as u from public.maps where id = $1", [map.id]))[0].u;
    const before = await updatedAt();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await updateData(ALICE, map.id, { ...BLANK_DOC, notes: { FRA: "v2" } }, second)).toMatchObject([
      { revision: second },
    ]);
    expect((await updatedAt()) > before).toBe(true);
    await expect(as(ALICE, "update public.maps set revision = 1 where id = $1", [map.id])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("une carte supprimée puis recréée avec le même identifiant ne reprend jamais une ancienne version (ABA)", async () => {
    // L'API ne laisse plus choisir l'identifiant : le cas est préparé avec les droits du propriétaire.
    const id = "abababab-abab-4bab-8bab-abababababab";
    const create = `insert into public.maps (id, user_id, name, data) values ($1, $2, 'Recréée', $3) returning revision::text`;
    const { rows: [old] } = await t.db.query<{ revision: string }>(create, [id, ALICE, JSON.stringify(BLANK_DOC)]);
    await as(ALICE, "delete from public.maps where id = $1", [id]);
    const { rows: [recreated] } = await t.db.query<{ revision: string }>(create, [id, ALICE, JSON.stringify(BLANK_DOC)]);
    expect(BigInt(recreated.revision) > BigInt(old.revision)).toBe(true);
    // Une copie périmée de l'ancienne carte (version attendue = l'ancienne) n'écrase pas la nouvelle.
    await expect(updateData(ALICE, id, { ...BLANK_DOC, notes: { FRA: "périmé" } }, old.revision)).rejects.toThrow(
      /maps_conflict/,
    );
  });

  it("versions uniques entre toutes les cartes, au-delà de celles attribuées avant la séquence", async () => {
    const [a] = await createMap(ALICE, "Une");
    const [b] = await createMap(BOB, "Deux");
    const [ra, rb] = [BigInt(a.revision), BigInt(b.revision)];
    expect(ra).not.toBe(rb);
    expect(ra > BigInt(1_000_000_000_000) && rb > BigInt(1_000_000_000_000)).toBe(true);
    expect(Number.isSafeInteger(Number(ra))).toBe(true);
    // Personne ne tire de valeur de la séquence en dehors du déclencheur.
    await expect(as(ALICE, "select nextval('public.maps_revision_seq')")).rejects.toThrow(/permission denied/);
  });

  it("tient les statistiques de la liste à jour, sans que le client puisse les écrire", async () => {
    const ll = [2.35, 48.85];
    const doc = {
      ...BLANK_DOC,
      notes: { FRA: "a", DEU: "b" },
      links: [{ id: "l1", a: "c:FRA", b: "c:DEU", title: "", note: "" }],
      pings: [1, 2, 3].map((i) => ({ id: `p${i}`, ll, type: "crise", title: "", note: "" })),
      texts: [{ id: "t1", ll, title: "", note: "" }],
    };
    const [map] = await createMap(ALICE, "Stats", doc);
    const stats = async () =>
      (await as<{ stats: unknown }>(ALICE, "select stats from public.maps where id = $1", [map.id]))[0].stats;
    expect(await stats()).toEqual({ notes: 2, links: 1, pings: 3, zones: 0, texts: 1 });
    await updateData(ALICE, map.id, { ...doc, pings: [] }, map.revision);
    expect(await stats()).toEqual({ notes: 2, links: 1, pings: 0, zones: 0, texts: 1 });
    // Contenu qui n'a pas la forme d'une carte (écrit avant les fonctions d'écriture) : pas de statistiques.
    await t.db.query("update public.maps set data = '[]' where id = $1", [map.id]);
    expect(await stats()).toBeNull();
    await expect(as(ALICE, "update public.maps set stats = '{}' where id = $1", [map.id])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("borne le nom et la taille du contenu", async () => {
    await expect(createMap(ALICE, "")).rejects.toThrow(/maps_invalid/);
    await expect(createMap(ALICE, "x".repeat(121))).rejects.toThrow(/maps_invalid/);
    expect(await createMap(ALICE, "x".repeat(120))).toHaveLength(1);
    const [map] = await createMap(ALICE, "Renommable");
    await expect(as(ALICE, "update public.maps set name = $1 where id = $2", ["x".repeat(121), map.id])).rejects.toThrow(
      /maps_name_length/,
    );
    // Dernier recours de la table, quel que soit le chemin d'écriture.
    await expect(
      t.db.query(
        "insert into public.maps (user_id, name, data) values ($1, 'gros', jsonb_build_object('n', repeat('x', 8000001)))",
        [ALICE],
      ),
    ).rejects.toThrow(/maps_data_size/);
  });

  it("efface les cartes avec le compte (on delete cascade)", async () => {
    const carol = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await t.addUsers(carol);
    await createMap(carol, "Éphémère");
    await t.db.query("delete from auth.users where id = $1", [carol]);
    const { rows } = await t.db.query("select id from public.maps where user_id = $1", [carol]);
    expect(rows).toEqual([]);
  });
});

describe("migration de la séquence des versions sur une base existante", () => {
  it("les cartes existantes gardent leur version ; les suivantes partent au-delà de toutes", async () => {
    const existing = await PGlite.create();
    try {
      await existing.exec(SUPABASE_STUB);
      const [maps, revision, ...later] = MIGRATIONS;
      await existing.exec(maps);
      await existing.exec(revision);
      await existing.query("insert into auth.users (id) values ($1)", [ALICE]);
      const { rows } = await existing.query<{ id: string }>(
        "insert into public.maps (user_id, name, data) values ($1, 'Ancienne', '{}') returning id",
        [ALICE],
      );
      const id = rows[0].id;
      for (let i = 0; i < 3; i++) await existing.query(`update public.maps set data = '{"n": ${i}}' where id = $1`, [id]);
      for (const migration of later) await existing.exec(migration);
      const read = async () =>
        BigInt((await existing.query<{ r: string }>("select revision::text as r from public.maps where id = $1", [id])).rows[0].r);
      expect(await read()).toBe(BigInt(4));
      await existing.query(`update public.maps set data = '{"n": "suite"}' where id = $1`, [id]);
      expect(await read()).toBe(BigInt(1_000_000_000_005));
    } finally {
      await existing.close();
    }
  }, 60_000);
});
