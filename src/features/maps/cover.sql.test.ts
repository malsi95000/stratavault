// Logo ou aperçu des cartes dans la base (supabase/migrations/20261014120100_maps_cover.sql) :
// colonne public.maps.cover et fonction d'écriture bornée public.set_map_cover, sur un vrai
// PostgreSQL (PGlite). Les mêmes exemples passent par la validation de l'application (parseMapCover).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BLANK_DOC, MIGRATIONS, MIGRATION_FILES, migrationsUpTo, openTestDb, type TestDb } from "@/test/pglite";
import { MAX_COVER_BYTES, MAX_COVER_SVG_BYTES, parseMapCover } from "./cover";
import { UNSAFE_SVG_BODIES, coverSvg } from "./coverFixtures";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let t: TestDb;
type Row = { cover: unknown; updated_at: string; revision: string };

const createMap = async (userId: string) =>
  (await t.as<{ id: string }>(userId, "select id from public.create_map('Carte', $1)", [JSON.stringify(BLANK_DOC)]))[0].id;
const setCover = (userId: string | null, id: string, cover: string | null) =>
  t.as<{ ok: boolean }>(userId, "select public.set_map_cover($1, $2) as ok", [id, cover]);
const rowOf = async (id: string) =>
  (await t.db.query<Row>("select cover, updated_at::text, revision::text from public.maps where id = $1", [id])).rows[0];

const svg = coverSvg;
const ICON = { kind: "icon", icon: "anchor", color: "corail" };
const PREVIEW = { kind: "preview", svg: svg('<rect width="160" height="90" fill="#0a1015"/>') };

beforeAll(async () => {
  t = await openTestDb();
  await t.addUsers(ALICE, BOB);
}, 60_000);

afterAll(async () => {
  await t?.db.close();
});

describe("set_map_cover", () => {
  it("écrit un logo ou un aperçu, sans changer la date ni la version du contenu ; null le retire", async () => {
    const id = await createMap(ALICE);
    const before = await rowOf(id);
    expect(before.cover).toBeNull();
    expect(await setCover(ALICE, id, JSON.stringify(ICON))).toEqual([{ ok: true }]);
    expect(await rowOf(id)).toEqual({ ...before, cover: ICON });
    expect(await setCover(ALICE, id, JSON.stringify(PREVIEW))).toEqual([{ ok: true }]);
    expect((await rowOf(id)).cover).toEqual(PREVIEW);
    expect(await setCover(ALICE, id, null)).toEqual([{ ok: true }]);
    expect(await rowOf(id)).toEqual(before);
    // Lisible par son propriétaire (droit select sur la table), sous RLS.
    await setCover(ALICE, id, JSON.stringify(ICON));
    expect(await t.as(ALICE, "select cover from public.maps where id = $1", [id])).toEqual([{ cover: ICON }]);
    expect(await t.as(BOB, "select cover from public.maps where id = $1", [id])).toEqual([]);
  });

  it("ne touche jamais la carte d'un autre compte ; réservée aux utilisateurs connectés", async () => {
    const id = await createMap(ALICE);
    expect(await setCover(BOB, id, JSON.stringify(ICON))).toEqual([{ ok: false }]);
    expect((await rowOf(id)).cover).toBeNull();
    await expect(setCover(null, id, JSON.stringify(ICON))).rejects.toThrow(/permission denied for function set_map_cover/);
    await expect(setCover("", id, JSON.stringify(ICON))).rejects.toThrow(/maps_not_authenticated/);
    // Pas d'écriture directe de la colonne, ni de lecture des contrôles internes.
    await expect(t.as(ALICE, "update public.maps set cover = $1 where id = $2", [JSON.stringify(ICON), id])).rejects.toThrow(
      /permission denied/,
    );
    await expect(t.as(ALICE, "select public.maps_cover_is_valid('{}')")).rejects.toThrow(/permission denied/);
    await expect(t.as(ALICE, "select public.maps_cover_svg_ok('')")).rejects.toThrow(/permission denied/);
  });

  it("refuse, comme l'application, les logos et aperçus invalides", async () => {
    const id = await createMap(ALICE);
    const extraIcon = { ...ICON, extra: "x" };
    const upperColor = { ...ICON, color: "#ABCDEF" };
    const extraPreview = { ...PREVIEW, extra: "x" };
    // Clé en trop retirée, couleur ramenée en minuscules par parseMapCover.
    const NORMALIZED_BY_APP = new Set<unknown>([extraIcon, upperColor, extraPreview]);
    const bad: unknown[] = [
      {},
      [],
      "globe",
      { kind: "image", url: "https://exemple.fr/x.png" },
      extraIcon,
      { kind: "icon", icon: "anchor" },
      { ...ICON, icon: "Anchor!" },
      { ...ICON, color: "red" },
      upperColor,
      { kind: "preview", svg: svg('<rect onload="x()"/>') },
      // Mêmes contenus dangereux que les tests de l'application, contournements par entités compris.
      ...UNSAFE_SVG_BODIES.map((body) => ({ kind: "preview", svg: svg(body) })),
      { kind: "preview", svg: "<svg><rect/></svg>" },
      extraPreview,
    ];
    for (const cover of bad) {
      const text = JSON.stringify(cover);
      await expect(setCover(ALICE, id, text), text).rejects.toThrow(/maps_invalid/);
      // L'application refuse aussi, sauf ce qu'elle normalise avant l'envoi (la base est plus stricte).
      if (!NORMALIZED_BY_APP.has(cover)) expect(parseMapCover(cover), text).toBeNull();
    }
    // Aucun nombre, refusé AVANT la conversion en jsonb : un exposant hors des bornes de numeric
    // (1e999999) ferait sinon échouer la conversion avec une autre erreur (22003), et un nombre à la
    // place de la couleur serait sinon refusé par le seul contrôle de forme.
    for (const text of [
      '{"kind":"icon","icon":"anchor","color":1e999999}',
      '{"kind":"icon","icon":"anchor","color":"vert","n":1e999999}',
    ]) {
      await expect(setCover(ALICE, id, text), text).rejects.toThrow(/^maps_invalid$/);
    }
    await expect(t.db.query("select '1e999999'::jsonb")).rejects.toThrow(/out of range|overflow/i);
    // Des chiffres DANS les chaînes restent permis (couleur #rrggbb, SVG).
    expect(await setCover(ALICE, id, JSON.stringify({ ...ICON, color: "#0a1b2c" }))).toEqual([{ ok: true }]);
    await setCover(ALICE, id, null);
    // JSON mal formé.
    await expect(setCover(ALICE, id, "{pas du json")).rejects.toThrow(/invalid input syntax/);
    expect((await rowOf(id)).cover).toBeNull();
    // Les exemples valides passent des deux côtés.
    for (const cover of [ICON, PREVIEW]) {
      expect(parseMapCover(cover)).toEqual(cover);
      expect(await setCover(ALICE, id, JSON.stringify(cover))).toEqual([{ ok: true }]);
    }
  });

  it("borne la taille avant toute lecture : 16 000 octets envoyés, 12 000 octets de SVG", async () => {
    const id = await createMap(ALICE);
    const preview = (svgBytes: number) => {
      const body = "x".repeat(svgBytes - svg("<g></g>").length);
      return JSON.stringify({ kind: "preview", svg: svg(`<g>${body}</g>`) });
    };
    expect(await setCover(ALICE, id, preview(MAX_COVER_SVG_BYTES))).toEqual([{ ok: true }]);
    await expect(setCover(ALICE, id, preview(MAX_COVER_SVG_BYTES + 1))).rejects.toThrow(/maps_invalid/);
    await expect(setCover(ALICE, id, " ".repeat(MAX_COVER_BYTES + 1))).rejects.toThrow(/maps_too_large/);
    // Un aperçu de taille maximale tient dans la colonne (contrainte maps_cover_size).
    const [{ bytes }] = (
      await t.db.query<{ bytes: number }>("select octet_length(cover::text) as bytes from public.maps where id = $1", [id])
    ).rows;
    expect(bytes).toBeLessThanOrEqual(18_000);
  });
});

describe("déploiement : migration compatible avec l'application en production", () => {
  it("les fonctions d'avant gardent leurs signatures ; la colonne est facultative", async () => {
    const id = await createMap(ALICE);
    const [{ revision }] = await t.as<{ revision: string }>(ALICE, "select revision::text from public.maps where id = $1", [id]);
    expect(
      await t.as(ALICE, "select name from public.update_map_data($1, $2, $3)", [id, JSON.stringify(BLANK_DOC), revision]),
    ).toEqual([{ name: "Carte" }]);
    // Ce que lit la production (colonnes nommées) ne change pas.
    expect(
      Object.keys((await t.as<object>(ALICE, "select id, name, updated_at, revision, stats from public.maps limit 1"))[0]),
    ).toEqual(["id", "name", "updated_at", "revision", "stats"]);
  });

  it("s'applique sur une base qui contient déjà des cartes", async () => {
    const before = await openTestDb(migrationsUpTo("20261014120000_maps_doc_v2.sql"));
    try {
      await before.addUsers(ALICE);
      await before.as(ALICE, "select public.create_map('Ancienne', $1)", [JSON.stringify(BLANK_DOC)]);
      await before.db.exec(MIGRATIONS[MIGRATION_FILES.indexOf("20261014120100_maps_cover.sql")]);
      expect((await before.db.query("select cover from public.maps")).rows).toEqual([{ cover: null }]);
    } finally {
      await before.db.close();
    }
  }, 60_000);
});
