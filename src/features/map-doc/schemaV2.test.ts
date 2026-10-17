import { describe, expect, it } from "vitest";
import { BETA_EXPORT, V2_EXPORT } from "./fixtures";
import { MAX_CATEGORIES, MAX_CATEGORY_LABEL_LENGTH, MAX_FICHES_PER_ELEMENT, MAX_STYLES, MAX_TOTAL_FICHES } from "./limits";
import { blankDoc, parseMapDoc } from "./schema";
import { portableDoc } from "./schemaV2";
import { MAX_NOTE_LENGTH, MAX_TITLE_LENGTH } from "./types";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const XSS = 'x"><img src=x onerror=alert(1)>';
const withV2 = (extra: Record<string, unknown>) => ({ ...blankDoc(), ...extra });
const fiche = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: "", note: "", ...extra });

describe("parseMapDoc : format v2", () => {
  it("importe une carte v2 sans perte (fiches, catégories, styles)", () => {
    const doc = parseMapDoc(clone(V2_EXPORT));
    expect(doc).not.toBeNull();
    expect(doc?.fiches).toEqual(V2_EXPORT.fiches);
    expect(doc?.categories).toEqual(V2_EXPORT.categories);
    expect(doc?.styles).toEqual(V2_EXPORT.styles);
    // Les notes et dates existantes restent la fiche principale.
    expect(doc?.notes).toEqual(BETA_EXPORT.notes);
    // Un document normalisé ne change plus.
    expect(parseMapDoc(clone(doc))).toEqual(doc);
  });

  it("complète les clés v2 d'une carte v1 ou de la bêta, vides", () => {
    const doc = parseMapDoc(clone(BETA_EXPORT));
    expect(doc).toMatchObject({ fiches: {}, categories: [], styles: {} });
    expect(parseMapDoc({ ...blankDoc(), fiches: null, categories: null, styles: null })).toEqual(blankDoc());
  });

  it("normalise : champs absents complétés, couleurs en minuscules, listes et styles vides retirés", () => {
    const doc = parseMapDoc(
      withV2({
        fiches: { "c:FRA": [{ id: "f1" }], "c:ESP": [] },
        categories: [{ id: "k1", label: "  Alliés  ", color: "#ABCDEF" }],
        styles: { "c:FRA": { color: "#00FF00" }, "c:ESP": {} },
      }),
    );
    expect(doc?.fiches).toEqual({ "c:FRA": [{ id: "f1", title: "", note: "" }] });
    expect(doc?.categories).toEqual([{ id: "k1", label: "Alliés", color: "#abcdef" }]);
    expect(doc?.styles).toEqual({ "c:FRA": { color: "#00ff00" } });
  });

  it("accepte les fiches et styles de tous les éléments (pays, lien, balise, point, zone, texte)", () => {
    const refs = ["c:UKR", "l:lv1abc1m3xz", "p:lv1abd3qq01", "o:lv1abe5t2aa", "z:lv1abg0c4cc", "t:lv1abf7h1bb"];
    const doc = parseMapDoc({
      ...clone(BETA_EXPORT),
      fiches: Object.fromEntries(refs.map((ref, i) => [ref, [fiche(`f${i}`)]])),
      styles: Object.fromEntries(refs.map((ref) => [ref, { color: "cyan" }])),
    });
    expect(Object.keys(doc?.fiches ?? {})).toEqual(refs);
    expect(Object.keys(doc?.styles ?? {})).toEqual(refs);
  });

  it("rejette les références vers des éléments absents ou mal formées", () => {
    const bad = [
      { fiches: { "c:ZZZ": [fiche("f1")] } },
      { fiches: { FRA: [fiche("f1")] } },
      { fiches: { "l:inexistant": [fiche("f1")] } },
      { fiches: { "flux:f1": [fiche("f1")] } },
      { fiches: { [`p:${XSS}`]: [fiche("f1")] } },
      { styles: { "z:inexistant": { color: "rouge" } } },
      { styles: { "x:FRA": { color: "rouge" } } },
    ];
    for (const extra of bad) expect(parseMapDoc(withV2(extra))).toBeNull();
  });

  it("rejette une catégorie inconnue, des identifiants en double ou malveillants", () => {
    const categories = [{ id: "k1", label: "Alliés", color: "vert" }];
    expect(parseMapDoc(withV2({ categories, fiches: { "c:FRA": [fiche("f1", { category: "k2" })] } }))).toBeNull();
    expect(parseMapDoc(withV2({ categories, styles: { "c:FRA": { category: "k2" } } }))).toBeNull();
    expect(parseMapDoc(withV2({ categories: [...categories, ...categories] }))).toBeNull();
    // Identifiant de fiche unique dans toute la carte (ouverture d'une fiche par son identifiant).
    expect(parseMapDoc(withV2({ fiches: { "c:FRA": [fiche("f1")], "c:ESP": [fiche("f1")] } }))).toBeNull();
    expect(parseMapDoc(withV2({ fiches: { "c:FRA": [fiche(XSS)] } }))).toBeNull();
    expect(parseMapDoc(withV2({ categories: [{ id: XSS, label: "x", color: "vert" }] }))).toBeNull();
  });

  it("rejette les couleurs hors de la palette ou mal formées", () => {
    for (const color of ["rose", "red", "#abc", "#abcdeg", "url(#x)", "var(--x)", "#abcdef;x", ""]) {
      expect(parseMapDoc(withV2({ styles: { "c:FRA": { color } } }))).toBeNull();
      expect(parseMapDoc(withV2({ categories: [{ id: "k1", label: "x", color }] }))).toBeNull();
      expect(parseMapDoc(withV2({ fiches: { "c:FRA": [fiche("f1", { color })] } }))).toBeNull();
    }
  });

  it("borne les textes, le nombre de fiches et de catégories", () => {
    const long = (n: number) => "a".repeat(n);
    expect(parseMapDoc(withV2({ fiches: { "c:FRA": [fiche("f1", { title: long(MAX_TITLE_LENGTH + 1) })] } }))).toBeNull();
    expect(parseMapDoc(withV2({ fiches: { "c:FRA": [fiche("f1", { note: long(MAX_NOTE_LENGTH + 1) })] } }))).toBeNull();
    const label = (l: string) => withV2({ categories: [{ id: "k1", label: l, color: "vert" }] });
    expect(parseMapDoc(label(long(MAX_CATEGORY_LABEL_LENGTH)))).not.toBeNull();
    expect(parseMapDoc(label(long(MAX_CATEGORY_LABEL_LENGTH + 1)))).toBeNull();
    expect(parseMapDoc(label("   "))).toBeNull();

    const fiches = (n: number, prefix = "f") => Array.from({ length: n }, (_, i) => fiche(`${prefix}${i}`));
    expect(parseMapDoc(withV2({ fiches: { "c:FRA": fiches(MAX_FICHES_PER_ELEMENT) } }))).not.toBeNull();
    expect(parseMapDoc(withV2({ fiches: { "c:FRA": fiches(MAX_FICHES_PER_ELEMENT + 1) } }))).toBeNull();

    const categories = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, label: "x", color: "vert" }));
    expect(parseMapDoc(withV2({ categories: categories(MAX_CATEGORIES) }))).not.toBeNull();
    expect(parseMapDoc(withV2({ categories: categories(MAX_CATEGORIES + 1) }))).toBeNull();
  });

  it("borne le total des fiches et des styles de toute la carte", () => {
    // Assez de points pour porter MAX_TOTAL_FICHES fiches à raison de MAX_FICHES_PER_ELEMENT chacun.
    const owners = MAX_TOTAL_FICHES / MAX_FICHES_PER_ELEMENT + 1;
    const points = Array.from({ length: owners }, (_, i) => ({ id: `o${i}`, ll: [0, 0], title: "", note: "" }));
    const fichesOf = (total: number) => {
      const out: Record<string, unknown[]> = {};
      for (let i = 0; i < total; i++) (out[`o:o${Math.floor(i / MAX_FICHES_PER_ELEMENT)}`] ??= []).push(fiche(`f${i}`));
      return out;
    };
    expect(parseMapDoc(withV2({ points, fiches: fichesOf(MAX_TOTAL_FICHES) }))).not.toBeNull();
    expect(parseMapDoc(withV2({ points, fiches: fichesOf(MAX_TOTAL_FICHES + 1) }))).toBeNull();

    // MAX_STYLES balises (le plafond d'une collection), plus un pays.
    const many = Array.from({ length: MAX_STYLES }, (_, i) => ({ id: `p${i}`, ll: [0, 0] }));
    const refs = [...many.map((p) => `p:${p.id}`), "c:FRA"];
    const styles = (n: number) => Object.fromEntries(refs.slice(0, n).map((ref) => [ref, { color: "vert" }]));
    expect(parseMapDoc(withV2({ pings: many, styles: styles(MAX_STYLES) }))).not.toBeNull();
    expect(parseMapDoc(withV2({ pings: many, styles: styles(MAX_STYLES + 1) }))).toBeNull();
  });

  it("ignore la clé __proto__ dans les fiches et les styles", () => {
    const doc = parseMapDoc(
      JSON.parse('{"notes":{},"links":[],"pings":[],"zones":[],"fiches":{"__proto__":[]},"styles":{"__proto__":{"color":"vert"}}}'),
    );
    expect(doc).toEqual(blankDoc());
    expect(({} as Record<string, unknown>).color).toBeUndefined();
  });
});

describe("parseMapDoc : fichier hostile", () => {
  it("renvoie null sans lever d’erreur quand des dizaines de milliers de styles visent des éléments absents", () => {
    const styles: Record<string, { category: string }> = {};
    for (let i = 0; i < 70_000; i++) styles[`c:Q${i}`] = { category: "inconnue" };
    const hostile = { ...blankDoc(), styles };
    expect(() => parseMapDoc(hostile)).not.toThrow();
    expect(parseMapDoc(hostile)).toBeNull();
  });
});

describe("portableDoc (fichier exporté)", () => {
  it("écrit une carte sans ajout v2 exactement au format v1", () => {
    const doc = parseMapDoc(clone(BETA_EXPORT))!;
    const file = portableDoc(doc);
    expect(Object.keys(file)).toEqual(["notes", "dates", "links", "pings", "points", "zones", "texts", "flux", "fluxFiches"]);
    expect(parseMapDoc(clone(file))).toEqual(doc);
  });

  it("garde les clés v2 utilisées, et le fichier se relit à l'identique", () => {
    const doc = parseMapDoc(clone(V2_EXPORT))!;
    expect(portableDoc(doc)).toEqual(doc);
    const onlyCategories = { ...doc, fiches: {}, styles: {} };
    expect(Object.keys(portableDoc(onlyCategories))).toContain("categories");
    expect(Object.keys(portableDoc(onlyCategories))).not.toContain("fiches");
    expect(parseMapDoc(clone(portableDoc(onlyCategories)))).toEqual(onlyCategories);
  });
});
