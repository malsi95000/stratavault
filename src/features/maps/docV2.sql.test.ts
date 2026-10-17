// Format de carte v2 dans la base (supabase/migrations/20261014120000_maps_doc_v2.sql) : la fonction
// public.maps_doc_is_valid, remplacée, accepte les cartes v1 ET v2 avec des contrôles aussi stricts,
// sur un vrai PostgreSQL (PGlite). Les écritures passent par create_map, comme dans l'application.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BETA_EXPORT, V2_EXPORT } from "@/features/map-doc/fixtures";
import { MAX_CATEGORIES, MAX_FICHES_PER_ELEMENT, MAX_STYLES, MAX_TOTAL_FICHES } from "@/features/map-doc/limits";
import { FLUX_COLOR_IDS } from "@/features/map-doc/palette";
import { blankDoc, parseMapDoc } from "@/features/map-doc/schema";
import { portableDoc } from "@/features/map-doc/schemaV2";
import { BLANK_DOC, migrationsUpTo, openTestDb, type TestDb } from "@/test/pglite";
import { MAX_MAP_BYTES } from "./limits";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let t: TestDb;
const json = (doc: unknown) => JSON.stringify(doc);
const create = (doc: unknown) =>
  t.as<{ id: string; revision: string }>(ALICE, "select id, revision::text from public.create_map('Carte', $1)", [json(doc)]);
const dataOf = async (id: string) =>
  (await t.db.query<{ data: unknown }>("select data from public.maps where id = $1", [id])).rows[0]?.data;

/** Carte v2 minimale, normalisée par l'application, avec un ajout `extra`. */
const v2 = (extra: Record<string, unknown>) => ({ ...blankDoc(), ...extra });
const fiche = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: "", note: "", ...extra });

beforeAll(async () => {
  t = await openTestDb();
  await t.addUsers(ALICE);
}, 60_000);

afterAll(async () => {
  await t?.db.close();
});

describe("maps_doc_is_valid : format v1 toujours accepté", () => {
  it("accepte une carte v1 (exactement les neuf clés), celle de la bêta normalisée et son export", async () => {
    for (const doc of [BLANK_DOC, portableDoc(parseMapDoc(BETA_EXPORT)!)]) {
      const [map] = await create(doc);
      expect(await dataOf(map.id)).toEqual(doc);
    }
  });

  it("accepte les couleurs de flux de la bêta et celles de la bêta 2.1, la même liste que l'application", async () => {
    const [{ colors }] = (await t.db.query<{ colors: string[] }>("select public.maps_flux_colors() as colors")).rows;
    expect(colors).toEqual([...FLUX_COLOR_IDS]);
    const stroke = (id: string) => ({ id, points: [[0, 0], [1, 1]], width: 4 });
    const flux = Object.fromEntries(FLUX_COLOR_IDS.map((c, i) => [c, [stroke(`f${i}`)]]));
    const fluxFiches = Object.fromEntries(FLUX_COLOR_IDS.map((c) => [c, { title: c }]));
    expect(await create({ ...BLANK_DOC, flux, fluxFiches })).toHaveLength(1);
    await expect(create({ ...BLANK_DOC, flux: { rose: [stroke("f1")] } })).rejects.toThrow(/maps_invalid/);
  });
});

describe("maps_doc_is_valid : format v2", () => {
  it("accepte une carte v2 normalisée par l'application, à l'identique", async () => {
    const doc = parseMapDoc(V2_EXPORT)!;
    const [map] = await create(doc);
    expect(await dataOf(map.id)).toEqual(doc);
    // Clés v2 vides (carte v1 relue par l'application) ou en partie absentes.
    expect(await create(blankDoc())).toHaveLength(1);
    expect(await create({ ...BLANK_DOC, categories: doc.categories })).toHaveLength(1);
  });

  it("refuse les clés inconnues, à tous les niveaux", async () => {
    const bad: unknown[] = [
      { ...blankDoc(), extra: {} },
      v2({ fiches: { "c:FRA": [fiche("f1", { pad: "x" })] } }),
      v2({ categories: [{ id: "k1", label: "x", color: "vert", pad: 1 }] }),
      v2({ styles: { "c:FRA": { color: "vert", pad: "x" } } }),
    ];
    for (const doc of bad) await expect(create(doc)).rejects.toThrow(/maps_invalid/);
  });

  it("refuse les formes invalides : types, clés d'éléments, identifiants, listes et styles vides", async () => {
    const XSS = 'x"><img src=x onerror=alert(1)>';
    const bad: unknown[] = [
      v2({ fiches: [] }),
      v2({ fiches: { "c:FRA": [] } }),
      v2({ fiches: { "c:FRA": {} } }),
      v2({ fiches: { "x:FRA": [fiche("f1")] } }),
      v2({ fiches: { FRA: [fiche("f1")] } }),
      v2({ fiches: { "c:FRA": [fiche(XSS)] } }),
      v2({ fiches: { "c:FRA": [{ id: "f1", note: "" }] } }),
      v2({ fiches: { "c:FRA": [fiche("f1", { title: 12 })] } }),
      v2({ fiches: { "c:FRA": [fiche("f1", { category: XSS })] } }),
      v2({ categories: {} }),
      v2({ categories: [{ id: "k1", label: "", color: "vert" }] }),
      v2({ categories: [{ id: "k1", label: "x".repeat(61), color: "vert" }] }),
      v2({ categories: [{ id: "k1", color: "vert" }] }),
      v2({ styles: [] }),
      v2({ styles: { "c:FRA": {} } }),
      v2({ styles: { [`p:${XSS}`]: { color: "vert" } } }),
      v2({ styles: { "c:FRA": { category: 3 } } }),
      { ...BLANK_DOC, fiches: null },
    ];
    for (const doc of bad) await expect(create(doc), json(doc)).rejects.toThrow(/maps_invalid/);
  });

  it("refuse les couleurs hors de la palette ou mal écrites", async () => {
    for (const color of ["rose", "red", "#ABCDEF", "#abc", "url(#x)", "", 1]) {
      await expect(create(v2({ styles: { "c:FRA": { color } } }))).rejects.toThrow(/maps_invalid/);
      await expect(create(v2({ categories: [{ id: "k1", label: "x", color }] }))).rejects.toThrow(/maps_invalid/);
      await expect(create(v2({ fiches: { "c:FRA": [fiche("f1", { color })] } }))).rejects.toThrow(/maps_invalid/);
    }
    expect(await create(v2({ styles: { "c:FRA": { color: "#abcdef" }, "c:ESP": { color: "corail" } } }))).toHaveLength(1);
  });

  it("borne les textes des fiches comme l'application", async () => {
    const note = (n: number) => v2({ fiches: { "c:FRA": [fiche("f1", { note: "é".repeat(n) })] } });
    expect(await create(note(100_000))).toHaveLength(1);
    await expect(create(note(100_001))).rejects.toThrow(/maps_invalid/);
    await expect(create(v2({ fiches: { "c:FRA": [fiche("f1", { title: "x".repeat(201) })] } }))).rejects.toThrow(
      /maps_invalid/,
    );
    await expect(create(v2({ fiches: { "c:FRA": [fiche("f1", { date: "x".repeat(33) })] } }))).rejects.toThrow(
      /maps_invalid/,
    );
  });

  it("applique les plafonds de l'application : fiches par élément et au total, catégories, styles", async () => {
    const fiches = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => fiche(`${prefix}${i}`));
    expect(await create(v2({ fiches: { "c:FRA": fiches(MAX_FICHES_PER_ELEMENT, "a") } }))).toHaveLength(1);
    await expect(create(v2({ fiches: { "c:FRA": fiches(MAX_FICHES_PER_ELEMENT + 1, "a") } }))).rejects.toThrow(
      /maps_invalid/,
    );

    const spread = (total: number) => {
      const out: Record<string, unknown[]> = {};
      for (let i = 0; i < total; i++) (out[`o:o${Math.floor(i / MAX_FICHES_PER_ELEMENT)}`] ??= []).push(fiche(`f${i}`));
      return out;
    };
    expect(await create(v2({ fiches: spread(MAX_TOTAL_FICHES) }))).toHaveLength(1);
    await expect(create(v2({ fiches: spread(MAX_TOTAL_FICHES + 1) }))).rejects.toThrow(/maps_invalid/);

    const categories = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, label: "x", color: "vert" }));
    expect(await create(v2({ categories: categories(MAX_CATEGORIES) }))).toHaveLength(1);
    await expect(create(v2({ categories: categories(MAX_CATEGORIES + 1) }))).rejects.toThrow(/maps_invalid/);

    const styles = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p:p${i}`, { color: "vert" }]));
    expect(await create(v2({ styles: styles(MAX_STYLES) }))).toHaveLength(1);
    await expect(create(v2({ styles: styles(MAX_STYLES + 1) }))).rejects.toThrow(/maps_invalid/);
  }, 60_000);

  it("valide en un temps raisonnable une carte v2 de 4 Mo (5 000 fiches)", async () => {
    const note = "n".repeat(Math.floor(MAX_MAP_BYTES / MAX_TOTAL_FICHES) - 120);
    const out: Record<string, unknown[]> = {};
    for (let i = 0; i < MAX_TOTAL_FICHES; i++) {
      (out[`o:o${Math.floor(i / MAX_FICHES_PER_ELEMENT)}`] ??= []).push(fiche(`f${i}`, { note, color: "cyan" }));
    }
    const doc = v2({ fiches: out });
    expect(json(doc).length).toBeLessThanOrEqual(MAX_MAP_BYTES);
    const start = performance.now();
    expect(await create(doc)).toHaveLength(1);
    expect(performance.now() - start).toBeLessThan(10_000);
  }, 60_000);

  it("garde les contrôles internes inaccessibles aux utilisateurs", async () => {
    for (const sql of [
      "select public.maps_doc_is_valid('{}')",
      "select public.maps_flux_colors()",
      "select public.maps_color_ok('\"vert\"')",
      "select public.maps_fiches_ok('{}')",
      "select public.maps_styles_ok('{}')",
      "select public.maps_categories_ok('[]')",
      "select public.maps_id_ok('\"a\"')",
      "select public.maps_text_ok('\"a\"', 10)",
      "select public.maps_element_key_ok('c:FRA')",
      "select public.maps_style_ok('{}')",
      "select public.maps_fiche_ok('{}')",
    ]) {
      await expect(t.as(ALICE, sql)).rejects.toThrow(/permission denied/);
      await expect(t.as(null, sql)).rejects.toThrow(/permission denied/);
    }
  });
});

describe("déploiement : la migration précède la bêta 2.1", () => {
  it("avant la migration, une carte v2 est refusée ; une carte v1 passe avant comme après", async () => {
    const before = await openTestDb(migrationsUpTo("20261009120000_delete_my_account.sql"));
    try {
      await before.addUsers(ALICE);
      const createBefore = (doc: unknown) =>
        before.as(ALICE, "select id from public.create_map('Carte', $1)", [json(doc)]);
      await expect(createBefore(parseMapDoc(V2_EXPORT))).rejects.toThrow(/maps_invalid/);
      expect(await createBefore(BLANK_DOC)).toHaveLength(1);
      // Une carte v1 relue par la bêta 2.1 a les clés v2 vides (12 clés) : refusée par l'ancienne base,
      // d'où l'envoi par portableDoc (src/lib/supabase/maps.ts), qui la ramène au format v1.
      const beta = parseMapDoc(BETA_EXPORT)!;
      await expect(createBefore(beta)).rejects.toThrow(/maps_invalid/);
      expect(await createBefore(portableDoc(beta))).toHaveLength(1);
    } finally {
      await before.db.close();
    }
  }, 60_000);
});
