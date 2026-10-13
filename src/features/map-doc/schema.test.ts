import { describe, expect, it } from "vitest";
import { BETA_EXPORT } from "./fixtures";
import { blankDoc, parseMapDoc, parseMapDocText } from "./schema";
import { MAX_ITEMS, MAX_NOTE_LENGTH, MAX_TITLE_LENGTH } from "./types";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const XSS = 'x"><img src=x onerror=alert(1)>';

describe("parseMapDoc", () => {
  it("importe un export de la bêta sans perte", () => {
    const doc = parseMapDoc(clone(BETA_EXPORT));
    expect(doc).not.toBeNull();
    expect(doc).toEqual({
      ...BETA_EXPORT,
      links: [
        { ...BETA_EXPORT.links[0], a: "c:FRA", b: "c:DEU" },
        BETA_EXPORT.links[1],
        BETA_EXPORT.links[2],
        BETA_EXPORT.links[3],
      ],
      pings: [BETA_EXPORT.pings[0], BETA_EXPORT.pings[1], { ...BETA_EXPORT.pings[2], type: "strategique" }],
      // La fiche "undefined" de la bêta est reportée sur chaque couleur tracée.
      fluxFiches: { jaune: BETA_EXPORT.fluxFiches.undefined, "bleu-fonce": BETA_EXPORT.fluxFiches.undefined },
    });
  });

  it("reprend la fiche de flux \"undefined\" écrite par la bêta sans écraser une fiche existante", () => {
    const fiche = { title: "Gaz" };
    const stroke = { id: "f1", points: [[0, 0], [1, 1]], width: 4, opacity: 0.65 };
    // Aucun trait : la fiche va sur "jaune", la couleur que la bêta affichait.
    expect(parseMapDoc({ ...blankDoc(), fluxFiches: { undefined: fiche } })?.fluxFiches).toEqual({ jaune: fiche });
    expect(parseMapDoc({ ...blankDoc(), fluxFiches: { undefined: {} } })?.fluxFiches).toEqual({ jaune: {} });
    const withFiche = parseMapDoc({
      ...blankDoc(),
      flux: { rouge: [stroke], vert: [{ ...stroke, id: "f2" }] },
      fluxFiches: { undefined: fiche, vert: { title: "Eau" } },
    });
    expect(withFiche?.fluxFiches).toEqual({ rouge: fiche, vert: { title: "Eau" } });
    // Le contenu repris reste validé, et les autres clés inconnues restent refusées.
    expect(parseMapDoc({ ...blankDoc(), fluxFiches: { undefined: { title: "a".repeat(MAX_TITLE_LENGTH + 1) } } })).toBeNull();
    expect(parseMapDoc({ ...blankDoc(), fluxFiches: { undefined: fiche, rose: fiche } })).toBeNull();
  });

  it("accepte un export passé par JSON (fichier texte)", () => {
    expect(parseMapDocText(JSON.stringify(BETA_EXPORT, null, 1))).not.toBeNull();
    expect(parseMapDocText("{ pas du json")).toBeNull();
    expect(parseMapDocText("null")).toBeNull();
  });

  it("ne modifie pas l'objet importé", () => {
    const input = clone(BETA_EXPORT);
    parseMapDoc(input);
    expect(input).toEqual(BETA_EXPORT);
  });

  it("complète les champs absents comme normalize() de la bêta", () => {
    const doc = parseMapDoc({
      notes: {},
      links: [{ id: "l1", a: "FRA", b: "ESP" }],
      pings: [{ id: "p1", ll: [1, 2] }],
      zones: [{ id: "z1", ring: [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]] }],
    });
    expect(doc).toEqual({
      ...blankDoc(),
      links: [{ id: "l1", a: "c:FRA", b: "c:ESP", title: "", note: "" }],
      pings: [{ id: "p1", ll: [1, 2], type: "strategique", title: "", note: "" }],
      zones: [{ id: "z1", ring: [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]], title: "", note: "" }],
    });
  });

  it("accepte les entités ajoutées depuis la bêta (territoires, reconnaissance limitée)", () => {
    const doc = parseMapDoc({
      ...blankDoc(),
      notes: { TWN: "Taïwan", ATA: "Antarctique", XTR: "Transnistrie" },
      links: [{ id: "l1", a: "c:GRL", b: "c:XAB", title: "", note: "" }],
    });
    expect(doc?.notes.XTR).toBe("Transnistrie");
  });

  it("referme une zone ouverte et l'oriente sur la plus petite surface", () => {
    const doc = parseMapDoc({
      ...blankDoc(),
      // Sens inverse : sans réorientation, la zone couvrirait tout le globe sauf ce carré.
      zones: [{ id: "z1", ring: [[0, 0], [10, 0], [10, 10], [0, 10]], title: "", note: "" }],
    });
    expect(doc?.zones[0].ring).toEqual([[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]);
  });

  it("rejette un identifiant malveillant", () => {
    const withBadPing = clone(BETA_EXPORT);
    withBadPing.pings[0].id = XSS;
    expect(parseMapDoc(withBadPing)).toBeNull();

    const withBadLinkRef = clone(BETA_EXPORT);
    withBadLinkRef.links[1].b = `p:${XSS}`;
    expect(parseMapDoc(withBadLinkRef)).toBeNull();

    const withBadCountry = { ...blankDoc(), notes: { [XSS]: "x" } };
    expect(parseMapDoc(withBadCountry)).toBeNull();
  });

  it("rejette une référence vers un élément absent", () => {
    const doc = clone(BETA_EXPORT);
    doc.links[1].b = "p:inexistant";
    expect(parseMapDoc(doc)).toBeNull();

    expect(parseMapDoc({ ...blankDoc(), links: [{ id: "l1", a: "c:FRA", b: "c:ZZZ", title: "", note: "" }] })).toBeNull();
    expect(parseMapDoc({ ...blankDoc(), links: [{ id: "l1", a: "x:FRA", b: "c:ESP", title: "", note: "" }] })).toBeNull();
    expect(parseMapDoc({ ...blankDoc(), dates: { ZZZ: "2024-01-01" } })).toBeNull();
  });

  it("rejette un lien d'un élément vers lui-même et les identifiants en double", () => {
    expect(parseMapDoc({ ...blankDoc(), links: [{ id: "l1", a: "FRA", b: "c:FRA", title: "", note: "" }] })).toBeNull();
    const dup = clone(BETA_EXPORT);
    dup.pings[1].id = dup.pings[0].id;
    expect(parseMapDoc(dup)).toBeNull();
  });

  it("rejette un type de balise ou une couleur de flux inconnus", () => {
    const badType = clone(BETA_EXPORT);
    badType.pings[0].type = "nucleaire";
    expect(parseMapDoc(badType)).toBeNull();

    expect(parseMapDoc({ ...blankDoc(), flux: { rose: [{ id: "f1", points: [[0, 0], [1, 1]], width: 2 }] } })).toBeNull();
    expect(parseMapDoc({ ...blankDoc(), fluxFiches: { rose: { title: "x" } } })).toBeNull();
  });

  it("rejette les coordonnées et tracés invalides", () => {
    expect(parseMapDoc({ ...blankDoc(), points: [{ id: "o1", ll: [48.85, 200], title: "", note: "" }] })).toBeNull();
    expect(parseMapDoc({ ...blankDoc(), points: [{ id: "o1", ll: ["2", 48], title: "", note: "" }] })).toBeNull();
    expect(parseMapDoc({ ...blankDoc(), zones: [{ id: "z1", ring: [[0, 0], [1, 1], [0, 0]], title: "", note: "" }] })).toBeNull();
    expect(parseMapDoc({ ...blankDoc(), flux: { jaune: [{ id: "f1", points: [[0, 0]], width: 2 }] } })).toBeNull();
  });

  it("borne la longueur des textes", () => {
    const longTitle = { ...blankDoc(), points: [{ id: "o1", ll: [0, 0], title: "a".repeat(MAX_TITLE_LENGTH + 1), note: "" }] };
    expect(parseMapDoc(longTitle)).toBeNull();
    expect(parseMapDoc({ ...blankDoc(), notes: { FRA: "a".repeat(MAX_NOTE_LENGTH + 1) } })).toBeNull();
    expect(parseMapDoc({ ...blankDoc(), notes: { FRA: "a".repeat(MAX_NOTE_LENGTH) } })).not.toBeNull();
  });

  it("rejette ce qui n'est pas une carte", () => {
    expect(parseMapDoc(null)).toBeNull();
    expect(parseMapDoc([])).toBeNull();
    expect(parseMapDoc({ notes: {}, links: [] })).toBeNull();
    expect(parseMapDoc(JSON.parse('{"__proto__":{"x":1},"notes":{},"links":[],"pings":[],"zones":[]}'))).toEqual(blankDoc());
    // Zod ignore la clé __proto__ : rien n'est copié, aucun prototype n'est pollué.
    const proto = parseMapDoc(JSON.parse('{"notes":{"__proto__":{"polluted":"x"}},"links":[],"pings":[],"zones":[]}'));
    expect(proto).toEqual(blankDoc());
    expect(Object.keys(proto?.notes ?? {})).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("borne les épaisseurs de flux et tailles de texte", () => {
    const doc = parseMapDoc({
      ...blankDoc(),
      texts: [{ id: "t1", ll: [0, 0], title: "", note: "", size: 400 }],
      flux: { rouge: [{ id: "f1", points: [[0, 0], [1, 1]] }, { id: "f2", points: [[0, 0], [1, 1]], width: 99, opacity: 3 }] },
    });
    expect(doc?.texts[0].size).toBe(40);
    expect(doc?.flux.rouge).toEqual([
      { id: "f1", points: [[0, 0], [1, 1]], width: 1 },
      { id: "f2", points: [[0, 0], [1, 1]], width: 16, opacity: 1 },
    ]);
  });
});

describe("parseMapDoc : document hostile au maximum des bornes", () => {
  it("borne le nombre total de traits de flux, toutes couleurs confondues", () => {
    const strokes = (color: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `${color}${i}`, points: [[0, 0], [1, 1]] }));
    const half = MAX_ITEMS / 2;
    expect(parseMapDoc({ ...blankDoc(), flux: { vert: strokes("v", half), rouge: strokes("r", half) } })).not.toBeNull();
    expect(parseMapDoc({ ...blankDoc(), flux: { vert: strokes("v", half), rouge: strokes("r", half + 1) } })).toBeNull();
  });

  it("valide en temps linéaire 20 000 balises et 20 000 liens (pas de recherche liens × éléments)", () => {
    const pings = Array.from({ length: MAX_ITEMS }, (_, i) => ({ id: `p${i}`, type: "crise", ll: [0, 0] }));
    const links = Array.from({ length: MAX_ITEMS }, (_, i) => ({ id: `l${i}`, a: `p:p${MAX_ITEMS - 1}`, b: `p:p${MAX_ITEMS - 2}` }));
    const json = { ...blankDoc(), pings, links };
    const start = performance.now();
    const doc = parseMapDoc(json);
    const elapsed = performance.now() - start;
    expect(doc?.links).toHaveLength(MAX_ITEMS);
    // Plusieurs secondes avant l'index des identifiants ; quelques dizaines de ms après.
    expect(elapsed).toBeLessThan(1500);
  });

  it("arrondit les nombres au millionième : la taille en JSON est celle stockée dans la base", () => {
    const tiny = 1e-300;
    const ring = Array.from({ length: 5_000 }, (_, i) => [tiny * i, -tiny]);
    const json = {
      ...blankDoc(),
      pings: [{ id: "p1", ll: [2.3522219, 48.85661456] }],
      points: [{ id: "o1", ll: [-tiny, tiny] }],
      zones: [{ id: "z1", ring: [...ring, ring[0]] }],
      texts: [{ id: "t1", ll: [0, 0], size: 12.0000004 }],
      flux: { rouge: [{ id: "f1", points: [[tiny, 1.0000005], [179.9999999, -89.9999999]], width: 4.1234567, opacity: tiny }] },
    };
    const doc = parseMapDoc(json)!;
    expect(doc.pings[0].ll).toEqual([2.352222, 48.856615]);
    expect(doc.points[0].ll).toEqual([0, 0]);
    expect(Object.is(doc.points[0].ll[0], -0)).toBe(false);
    expect(doc.texts[0].size).toBe(12);
    expect(doc.flux.rouge![0]).toEqual({ id: "f1", points: [[0, 1.000001], [180, -90]], width: 4.123457, opacity: 0 });
    // Aucun nombre écrit en notation scientifique (PostgreSQL l'écrirait en toutes lettres).
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(/\de-/);
    expect(text.length).toBeLessThan(JSON.stringify(json).length);
    // Un document déjà normalisé ne change plus.
    expect(parseMapDoc(clone(doc))).toEqual(doc);
  });
});
