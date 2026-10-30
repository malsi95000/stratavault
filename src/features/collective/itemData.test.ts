// Contenu d'un élément de la carte collective (itemData.ts) : validation, forme canonique, et mêmes
// règles que la base (public.collective_item_data_ok, vérifiée sur un vrai PostgreSQL).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MapPoint, Zone } from "@/features/map-doc/types";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  canonicalContent,
  contentJson,
  contentProblem,
  elementEnds,
  fluxContent,
  parseItemContent,
  pointContent,
  textProblem,
  zoneContent,
} from "./itemData";
import { MAX_ITEM_NOTE, MAX_ITEM_PATH_POINTS, MAX_ITEM_TITLE } from "./limits";

const fiche = { title: "Titre", note: "" };
const ring = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 0],
];

/** Échantillons : sorte, contenu, accepté ? (déjà sous forme canonique quand ils sont acceptés). */
const SAMPLES: [string, unknown, boolean][] = [
  ["ping", { ll: [2.35, 48.85], type: "crise", ...fiche }, true],
  ["ping", { ll: [2.35, 48.85], type: "crise", ...fiche, date: "2024-02-29" }, true],
  ["ping", { ll: [2.35, 48.85], type: "inconnu", ...fiche }, false],
  ["ping", { ll: [2.35, 48.85], type: "crise", title: "" }, false],
  ["ping", { ll: [2.35, 48.85], type: "crise", ...fiche, extra: true }, false],
  ["ping", { ll: [180.5, 0], type: "crise", ...fiche }, false],
  ["ping", { ll: [0, -91], type: "crise", ...fiche }, false],
  ["ping", { ll: [0, 0, 0], type: "crise", ...fiche }, false],
  ["point", { ll: [-180, 90], ...fiche }, true],
  ["point", { ll: [0, 0], title: "a".repeat(MAX_ITEM_TITLE), note: "b".repeat(MAX_ITEM_NOTE) }, true],
  ["point", { ll: [0, 0], title: "a".repeat(MAX_ITEM_TITLE + 1), note: "" }, false],
  ["point", { ll: [0, 0], title: "🌍".repeat(MAX_ITEM_TITLE), note: "" }, true],
  ["point", { ll: [0, 0], title: "", note: "b".repeat(MAX_ITEM_NOTE + 1) }, false],
  ["point", { ll: [0, 0], title: "ligne\nretour", note: "" }, false],
  ["point", { ll: [0, 0], title: "", note: "ligne\nretour\ttab" }, true],
  ["point", { ll: [0, 0], title: "", note: "bip\u0007" }, false],
  ["point", { ll: [0, 0], title: "‮abc", note: "" }, false],
  ["point", { ll: [0, 0], title: "", note: "⁧isolé" }, false],
  ["point", { ll: [0, 0], ...fiche, date: "2024-1-01" }, false],
  ["point", { ll: [0, 0], ...fiche, date: 20240101 }, false],
  ["text", { ll: [0, 0], ...fiche, size: 12 }, true],
  ["text", { ll: [0, 0], ...fiche, size: 41 }, false],
  ["text", { ll: [0, 0], ...fiche, size: 5 }, false],
  ["zone", { ring, ...fiche }, true],
  ["zone", { ring: ring.slice(1), ...fiche }, false],
  ["zone", { ring: [...ring.slice(0, 3), [0, 1]], ...fiche }, false],
  ["zone", { ring: [...Array.from({ length: MAX_ITEM_PATH_POINTS - 1 }, (_, i) => [i / 100, i / 200]), [0, 0]], ...fiche }, true],
  ["zone", { ring: [...Array.from({ length: MAX_ITEM_PATH_POINTS }, (_, i) => [i / 100, i / 200]), [0, 0]], ...fiche }, false],
  ["link", { a: "c:FRA", b: "p:abc_1-2", ...fiche }, true],
  ["link", { a: "o:x", b: "z:y", ...fiche }, true],
  ["link", { a: "c:FRA", b: "c:FRA", ...fiche }, false],
  ["link", { a: "c:fra", b: "c:DEU", ...fiche }, false],
  ["link", { a: "l:abc", b: "c:DEU", ...fiche }, false],
  ["flux", { color: "rouge", points: [[0, 0], [1, 1]], width: 3 }, true],
  ["flux", { color: "rouge", points: [[0, 0], [1, 1]], width: 3, opacity: 0.4 }, true],
  ["flux", { color: "rouge", points: [[0, 0]], width: 3 }, false],
  ["flux", { color: "#ff0000", points: [[0, 0], [1, 1]], width: 3 }, false],
  ["flux", { color: "rouge", points: [[0, 0], [1, 1]], width: 17 }, false],
  ["flux", { color: "rouge", points: [[0, 0], [1, 1]], width: 3, opacity: 2 }, false],
  ["flux", { color: "rouge", points: [[0, 0], [1, 1]], width: 3, title: "" }, false],
  ["nuage", { ll: [0, 0], ...fiche }, false],
];

describe("parseItemContent", () => {
  it("accepte et refuse comme prévu", () => {
    for (const [kind, data, ok] of SAMPLES) {
      expect(parseItemContent(kind, "id1", data).ok, `${kind} ${JSON.stringify(data).slice(0, 60)}`).toBe(ok);
    }
  });

  it("refuse un identifiant mal formé et dit pourquoi un contenu est refusé", () => {
    expect(parseItemContent("point", "a b", { ll: [0, 0], ...fiche }).ok).toBe(false);
    expect(parseItemContent("point", "x".repeat(65), { ll: [0, 0], ...fiche }).ok).toBe(false);
    expect(parseItemContent("point", "id", { ll: [0, 0], title: "a".repeat(201), note: "" })).toEqual({ ok: false, problem: "title-too-long" });
    expect(parseItemContent("point", "id", { ll: [0, 0], title: "", note: "a".repeat(2001) })).toEqual({ ok: false, problem: "note-too-long" });
    expect(parseItemContent("point", "id", { ll: [0, 0], title: "‮", note: "" })).toEqual({ ok: false, problem: "forbidden-chars" });
    const long = Array.from({ length: 1001 }, (_, i) => [i / 100, 0]);
    expect(parseItemContent("flux", "id", { color: "rouge", points: long, width: 3 })).toEqual({ ok: false, problem: "path-too-long" });
    expect(parseItemContent("link", "id", { a: "c:XYZ", b: "c:FRA", ...fiche })).toEqual({ ok: false, problem: "invalid" });
  });

  it("forme canonique : coordonnées arrondies au millionième, clés dans l’ordre", () => {
    const parsed = parseItemContent("point", "id", { note: "n", title: "t", ll: [2.123456789, -0.0000001] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(contentJson(parsed.content)).toBe('{"ll":[2.123457,0],"title":"t","note":"n"}');
    expect(canonicalContent(parsed.content)).toEqual(parsed.content);
  });
});

describe("éléments de l'éditeur", () => {
  it("point, zone et flux de l'éditeur en contenu canonique", () => {
    const point: MapPoint = { id: "p1", ll: [1.0000004, 2], title: "A", note: "", date: "" };
    expect(pointContent(point)).toEqual({ kind: "point", id: "p1", data: { ll: [1, 2], title: "A", note: "" } });
    const zone: Zone = { id: "z1", ring: ring as Zone["ring"], title: "", note: "", date: "2020-01-01" };
    expect(zoneContent(zone).data).toEqual({ ring, title: "", note: "", date: "2020-01-01" });
    expect(fluxContent("rouge", { id: "f1", points: [[0, 0], [1, 1]], width: 4 })).toEqual({
      kind: "flux",
      id: "f1",
      data: { color: "rouge", points: [[0, 0], [1, 1]], width: 4 },
    });
    expect(contentProblem(pointContent(point))).toBeNull();
  });

  it("textProblem compte les caractères comme PostgreSQL", () => {
    expect(textProblem("é".repeat(10), 10, false)).toBeNull();
    expect(textProblem("𝄞".repeat(10), 10, false)).toBeNull();
    expect(textProblem("a".repeat(11), 10, false)).toBe("too-long");
    expect(textProblem("a\tb", 10, false)).toBe("forbidden-chars");
    expect(textProblem("a\tb", 10, true)).toBeNull();
  });

  it("extrémités d'un lien qui sont des éléments", () => {
    expect(elementEnds({ a: "c:FRA", b: "p:x" })).toEqual(["p:x"]);
    expect(elementEnds({ a: "o:y", b: "z:x" })).toEqual(["o:y", "z:x"]);
  });
});

describe("mêmes règles que la base (public.collective_item_data_ok)", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await openTestDb();
  }, 60_000);
  afterAll(async () => {
    await t?.db.close();
  });

  it("chaque échantillon a la même réponse dans l'application et dans la base", async () => {
    for (const [kind, data, ok] of SAMPLES) {
      const { rows } = await t.db.query<{ ok: boolean }>("select public.collective_item_data_ok($1, $2::jsonb) as ok", [
        kind,
        JSON.stringify(data),
      ]);
      expect(rows[0].ok, `${kind} ${JSON.stringify(data).slice(0, 60)}`).toBe(ok);
    }
  });

  it("le contenu canonique envoyé par l'application est toujours accepté par la base", async () => {
    const parsed = parseItemContent("zone", "z", { ring: [[0.1234567, 0], [1, 0], [1, 1], [0.1234567, 0]], title: "x", note: "" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { rows } = await t.db.query<{ ok: boolean }>("select public.collective_item_data_ok('zone', $1::jsonb) as ok", [contentJson(parsed.content)]);
    expect(rows[0].ok).toBe(true);
  });
});
