// Fonctions d'écriture du contenu des cartes (public.create_map, public.update_map_data) et retrait
// des écritures directes, sur un vrai PostgreSQL (PGlite). Coût et quotas : writeFunctions.cost.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BETA_EXPORT } from "@/features/map-doc/fixtures";
import { parseMapDoc } from "@/features/map-doc/schema";
import { BLANK_DOC, migrationsUpTo, openTestDb, type TestDb } from "@/test/pglite";
import { MAX_MAP_BYTES, jsonByteLength } from "./limits";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let t: TestDb;
type Info = { id: string; name: string; updated_at: string; revision: string };

const create = (userId: string | null, data: string, name = "Carte") =>
  t.as<Info>(userId, "select id, name, updated_at, revision::text from public.create_map($1, $2)", [name, data]);
const update = (userId: string | null, id: string, data: string, revision: string | null) =>
  t.as<Info>(userId, "select id, name, updated_at, revision::text from public.update_map_data($1, $2, $3)", [
    id,
    data,
    revision,
  ]);
const json = (doc: unknown) => JSON.stringify(doc);
const dataOf = async (id: string) =>
  (await t.db.query<{ data: unknown }>("select data from public.maps where id = $1", [id])).rows[0]?.data;

beforeAll(async () => {
  t = await openTestDb();
  await t.addUsers(ALICE, BOB);
}, 60_000);

afterAll(async () => {
  await t?.db.close();
});

describe("droits sur public.maps et les fonctions d'écriture", () => {
  it("refuse l'INSERT et l'UPDATE directs du contenu, même minuscules ; renommer reste permis", async () => {
    await expect(t.as(ALICE, "insert into public.maps (name, data) values ('x', '{}')")).rejects.toThrow(
      /permission denied/,
    );
    const [map] = await create(ALICE, json(BLANK_DOC));
    await expect(t.as(ALICE, "update public.maps set data = '{}' where id = $1", [map.id])).rejects.toThrow(
      /permission denied/,
    );
    expect(await t.as(ALICE, "update public.maps set name = 'Renommée' where id = $1 returning name", [map.id])).toEqual([
      { name: "Renommée" },
    ]);
  });

  it("n'ouvre les fonctions qu'aux utilisateurs connectés, avec un auth.uid()", async () => {
    await expect(create(null, json(BLANK_DOC))).rejects.toThrow(/permission denied for function create_map/);
    await expect(update(null, ALICE, json(BLANK_DOC), "1")).rejects.toThrow(/permission denied for function/);
    // Rôle « authenticated » sans utilisateur (jeton sans sub) : refusé explicitement.
    await expect(create("", json(BLANK_DOC))).rejects.toThrow(/maps_not_authenticated/);
    await expect(update("", ALICE, json(BLANK_DOC), "1")).rejects.toThrow(/maps_not_authenticated/);
    // Les contrôles internes ne sont pas appelables directement.
    await expect(t.as(ALICE, "select public.maps_parse_doc('{}')")).rejects.toThrow(/permission denied/);
    await expect(t.as(ALICE, "select public.maps_doc_is_valid('{}')")).rejects.toThrow(/permission denied/);
  });

  it("ne renvoient que l'identifiant, le nom, la date et la version", async () => {
    const rows = await t.as<Record<string, unknown>>(ALICE, "select * from public.create_map('Champs', $1)", [
      json(BLANK_DOC),
    ]);
    expect(Object.keys(rows[0]).sort()).toEqual(["id", "name", "revision", "updated_at"]);
  });
});

describe("update_map_data : propriétaire et version", () => {
  it("ne touche jamais la carte d'un autre compte, même avec la bonne version", async () => {
    const [map] = await create(ALICE, json({ ...BLANK_DOC, notes: { FRA: "Alice" } }));
    expect(await update(BOB, map.id, json(BLANK_DOC), map.revision)).toEqual([]);
    expect(await dataOf(map.id)).toEqual({ ...BLANK_DOC, notes: { FRA: "Alice" } });
  });

  it("n'écrit qu'à la version attendue ; sans version, c'est un conflit", async () => {
    const [map] = await create(ALICE, json(BLANK_DOC));
    const [next] = await update(ALICE, map.id, json({ ...BLANK_DOC, notes: { FRA: "v2" } }), map.revision);
    expect(BigInt(next.revision) > BigInt(map.revision)).toBe(true);
    // Appareil resté sur l'ancienne version, ou version absente : rien n'est écrasé.
    await expect(update(ALICE, map.id, json(BLANK_DOC), map.revision)).rejects.toThrow(/maps_conflict/);
    await expect(update(ALICE, map.id, json(BLANK_DOC), null)).rejects.toThrow(/maps_conflict/);
    expect(await dataOf(map.id)).toEqual({ ...BLANK_DOC, notes: { FRA: "v2" } });
    // Carte supprimée : aucune ligne (pas un conflit).
    await t.as(ALICE, "delete from public.maps where id = $1", [map.id]);
    expect(await update(ALICE, map.id, json(BLANK_DOC), next.revision)).toEqual([]);
  });
});

describe("taille et forme du contenu", () => {
  /** Carte d'exactement `bytes` octets en JSON compact (une note de pays remplie de « x »). */
  const docOfSize = (bytes: number) => {
    const base = json({ ...BLANK_DOC, notes: { FRA: "" } });
    return json({ ...BLANK_DOC, notes: { FRA: "x".repeat(bytes - base.length) } });
  };

  it("accepte jusqu'à la limite de l'application (4 Mo, en octets), refuse au-delà", async () => {
    expect(docOfSize(MAX_MAP_BYTES)).toHaveLength(MAX_MAP_BYTES);
    const [map] = await create(ALICE, docOfSize(MAX_MAP_BYTES));
    await expect(create(ALICE, docOfSize(MAX_MAP_BYTES + 1))).rejects.toThrow(/maps_too_large/);
    await expect(update(ALICE, map.id, docOfSize(MAX_MAP_BYTES + 1), map.revision)).rejects.toThrow(/maps_too_large/);
    // Octets UTF-8, pas caractères : 2 000 001 « é » font 4 000 002 octets.
    const accents = json({ ...BLANK_DOC, notes: { FRA: "é".repeat(2_000_001) } });
    await expect(create(ALICE, accents)).rejects.toThrow(/maps_too_large/);
  });

  it("accepte une carte normalisée par l'application (parseMapDoc)", async () => {
    const doc = parseMapDoc(BETA_EXPORT)!;
    // Nombres arrondis au millionième, jamais écrits avec un exposant.
    const tiny = parseMapDoc({ ...BLANK_DOC, points: [{ id: "o1", ll: [-179.99999999, 1e-7], title: "", note: "" }] })!;
    for (const map of [doc, tiny]) {
      const [created] = await create(ALICE, json(map));
      expect(await dataOf(created.id)).toEqual(map);
      expect(jsonByteLength(map)).toBeLessThan(MAX_MAP_BYTES);
    }
  });

  it("refuse ce qui n'a pas la forme d'une carte", async () => {
    const ll = [0, 0];
    const bad: unknown[] = [
      null,
      [],
      "carte",
      { ...BLANK_DOC, pad: [1, 1, 1] },
      { ...BLANK_DOC, notes: undefined },
      { ...BLANK_DOC, notes: { FRA: [1, 2] } },
      { ...BLANK_DOC, links: {} },
      { ...BLANK_DOC, links: [1] },
      { ...BLANK_DOC, links: [{ id: "l1", pad: [1] }] },
      { ...BLANK_DOC, pings: [{ id: "p1", ll: [0, 0, 0] }] },
      { ...BLANK_DOC, points: [{ id: "o1" }] },
      { ...BLANK_DOC, zones: [{ id: "z1", ring: "anneau" }] },
      { ...BLANK_DOC, flux: { fuchsia: [] } },
      { ...BLANK_DOC, flux: { jaune: [{ id: "f1", points: [ll, ll], extra: 1 }] } },
      { ...BLANK_DOC, fluxFiches: { jaune: { title: "T", pad: "x" } } },
    ];
    for (const doc of bad) await expect(create(ALICE, json(doc))).rejects.toThrow(/maps_invalid/);
    await expect(create(ALICE, "{pas du json")).rejects.toThrow(/invalid input syntax/);
  });

  it("refuse les nombres écrits avec un exposant, pas le texte qui y ressemble", async () => {
    // 1e131071 s'écrirait en 131 072 chiffres dans la base.
    const exponent = json({ ...BLANK_DOC, points: [{ id: "o1", ll: [0, 0] }] }).replace("[0,0]", "[1e131071,0]");
    await expect(create(ALICE, exponent)).rejects.toThrow(/maps_invalid/);
    const text = { ...BLANK_DOC, notes: { FRA: 'Au 19e siècle, "1e5" \\ 2E3' } };
    const [map] = await create(ALICE, json(text));
    expect(await dataOf(map.id)).toEqual(text);
  });

  it("applique les plafonds de l'application : 20 000 par collection, 50 000 éléments, 200 000 sommets", async () => {
    const many = (count: number, prefix: string) =>
      Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, ll: [0, 0], title: "", note: "" }));
    const full = { ...BLANK_DOC, pings: many(20_000, "p"), points: many(20_000, "o"), texts: many(10_000, "t") };
    expect(await create(ALICE, json(full))).toHaveLength(1);
    const extraZone = [{ id: "z1", ring: [], title: "", note: "" }];
    await expect(create(ALICE, json({ ...full, zones: extraZone }))).rejects.toThrow(/maps_invalid/);
    await expect(create(ALICE, json({ ...BLANK_DOC, pings: many(20_001, "p") }))).rejects.toThrow(/maps_invalid/);

    const ring = (count: number) => Array.from({ length: count }, () => [0, 0]);
    const zones = (count: number) => [{ id: "z1", ring: ring(count), title: "", note: "" }];
    const fluxOf = (count: number) => ({ jaune: [{ id: "f1", points: ring(count), width: 4 }] });
    expect(await create(ALICE, json({ ...BLANK_DOC, zones: zones(150_000), flux: fluxOf(50_000) }))).toHaveLength(1);
    await expect(create(ALICE, json({ ...BLANK_DOC, zones: zones(150_000), flux: fluxOf(50_001) }))).rejects.toThrow(
      /maps_invalid/,
    );
  }, 60_000);
});

describe("déploiement en deux temps", () => {
  it("après la première migration seule, l'ancienne application (écritures directes) fonctionne encore", async () => {
    const before = await openTestDb(migrationsUpTo("20261008120000_maps_write_functions.sql"));
    try {
      await before.addUsers(ALICE);
      expect(await before.as(ALICE, "insert into public.maps (name, data) values ('Ancienne', '{}') returning name")).toEqual([
        { name: "Ancienne" },
      ]);
      expect(
        await before.as(ALICE, "select name from public.create_map('Nouvelle', $1)", [json(BLANK_DOC)]),
      ).toEqual([{ name: "Nouvelle" }]);
    } finally {
      await before.db.close();
    }
  }, 60_000);
});
