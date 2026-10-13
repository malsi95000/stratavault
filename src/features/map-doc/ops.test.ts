import { describe, expect, it } from "vitest";
import { BETA_EXPORT } from "./fixtures";
import * as ops from "./ops";
import { anchorOf, linkAnchors, makeRef, nameOfRef, parseRef } from "./refs";
import { blankDoc, parseMapDoc } from "./schema";
import {
  ID_PATTERN,
  MAX_DATE_LENGTH,
  MAX_ITEMS,
  MAX_NOTE_LENGTH,
  MAX_PATH_POINTS,
  MAX_TITLE_LENGTH,
  MAX_TOTAL_ITEMS,
  MAX_TOTAL_PATH_POINTS,
} from "./types";
import type { LonLat, MapDoc } from "./types";

const beta = (): MapDoc => {
  const doc = parseMapDoc(JSON.parse(JSON.stringify(BETA_EXPORT)));
  if (!doc) throw new Error("export de test invalide");
  return doc;
};

describe("uid", () => {
  it("produit des identifiants valides et distincts", () => {
    const ids = Array.from({ length: 200 }, () => ops.uid());
    expect(ids.every((x) => ID_PATTERN.test(x))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("ajouts", () => {
  it("ajoute un lien sans doublon, dans les deux sens, et jamais d'un élément vers lui-même", () => {
    const first = ops.addLink(blankDoc(), "c:FRA", "c:DEU", "l1");
    expect(first?.doc.links).toEqual([{ id: "l1", a: "c:FRA", b: "c:DEU", title: "", note: "" }]);
    const again = ops.addLink(first!.doc, "c:DEU", "c:FRA");
    expect(again?.id).toBe("l1");
    expect(again?.doc).toBe(first!.doc);
    expect(ops.addLink(blankDoc(), "c:FRA", "c:FRA")).toBeNull();
  });

  it("refuse un lien vers un élément absent", () => {
    expect(ops.addLink(blankDoc(), "p:absent", "c:FRA")).toBeNull();
    expect(ops.addLink(blankDoc(), "c:FRA", "c:ZZZ")).toBeNull();
  });

  it("ne modifie jamais le document d'entrée", () => {
    const doc = blankDoc();
    const frozen = JSON.stringify(doc);
    ops.addPing(doc, [1, 2], "armes");
    ops.addPoint(doc, [1, 2]);
    ops.addText(doc, [1, 2], 13);
    ops.addZone(doc, [[0, 0], [0, 1], [1, 1]]);
    ops.addFluxStroke(doc, "vert", [[0, 0], [1, 1]], 4);
    expect(JSON.stringify(doc)).toBe(frozen);
  });

  it("crée balise, point, texte, zone et flux au format de la bêta", () => {
    let doc = blankDoc();
    doc = ops.addPing(doc, [10, 20], "armes", "p1")!.doc;
    doc = ops.addPoint(doc, [11, 21], "o1")!.doc;
    doc = ops.addText(doc, [12, 22], 99, "t1")!.doc;
    doc = ops.addZone(doc, [[0, 0], [0, 10], [10, 10], [10, 0]], "z1")!.doc;
    doc = ops.addFluxStroke(doc, "rouge", [[0, 0], [5, 5]], 4, "f1")!.doc;
    expect(doc.pings).toEqual([{ id: "p1", ll: [10, 20], title: "", note: "", type: "armes" }]);
    expect(doc.points).toEqual([{ id: "o1", ll: [11, 21], title: "", note: "", date: "" }]);
    expect(doc.texts).toEqual([{ id: "t1", ll: [12, 22], title: "", note: "", date: "", size: 40 }]);
    expect(doc.zones[0].ring).toEqual([[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]);
    expect(doc.flux.rouge).toEqual([{ id: "f1", points: [[0, 0], [5, 5]], width: 4, opacity: 0.65 }]);
    expect(parseMapDoc(doc)).toEqual(doc);
  });

  it("refuse un contour de moins de 3 points distincts et un flux de moins de 2 points", () => {
    expect(ops.addZone(blankDoc(), [[0, 0], [1, 1]])).toBeNull();
    // Lasso revenu exactement sur son point de départ : l'anneau n'aurait que 3 points.
    expect(ops.addZone(blankDoc(), [[0, 0], [5, 5], [0, 0]])).toBeNull();
    expect(ops.addZone(blankDoc(), [[0, 0], [5, 5], [5, 5], [0, 0]])).toBeNull();
    const closed = ops.addZone(blankDoc(), [[0, 0], [0, 5], [5, 5], [0, 0]], "z1");
    expect(closed?.doc.zones[0].ring).toEqual([[0, 0], [0, 5], [5, 5], [0, 0]]);
    expect(parseMapDoc(closed?.doc)).not.toBeNull();
    expect(ops.addFluxStroke(blankDoc(), "jaune", [[0, 0]], 4)).toBeNull();
  });
});

describe("mises à jour des fiches", () => {
  it("met à jour titre, notes, date et type", () => {
    let doc = ops.addPing(blankDoc(), [0, 0], "strategique", "p1")!.doc;
    doc = ops.updateFiche(doc, "p", "p1", { title: "Ormuz", note: "Détroit", date: "2024-01-02" });
    doc = ops.updateFiche(doc, "p", "p1", { title: undefined });
    doc = ops.setPingType(doc, "p1", "maritime");
    expect(doc.pings[0]).toEqual({ id: "p1", ll: [0, 0], title: "Ormuz", note: "Détroit", date: "2024-01-02", type: "maritime" });
    expect(ops.updateFiche(doc, "z", "absent", { title: "x" })).toBe(doc);
  });

  it("supprime la clé des notes et dates de pays vides", () => {
    let doc = ops.setCountryNote(blankDoc(), "FRA", "Note");
    doc = ops.setCountryDate(doc, "FRA", "2024-01-01");
    expect(doc.notes).toEqual({ FRA: "Note" });
    doc = ops.setCountryNote(doc, "FRA", "");
    doc = ops.setCountryDate(doc, "FRA", "");
    expect(doc.notes).toEqual({});
    expect(doc.dates).toEqual({});
    expect("FRA" in doc.notes).toBe(false);
  });

  it("partage la fiche de flux par couleur", () => {
    const doc = beta();
    const found = ops.findFlux(doc, "lv1abh2ee02");
    expect(found?.color).toBe("bleu-fonce");
    const next = ops.updateFluxFiche(doc, "bleu-fonce", { title: "Pétrole" });
    expect(next.fluxFiches["bleu-fonce"]).toEqual({ ...doc.fluxFiches["bleu-fonce"], title: "Pétrole" });
    expect(ops.updateFluxFiche(blankDoc(), "vert", { note: "Eau" }).fluxFiches).toEqual({ vert: { note: "Eau" } });
    expect(next.fluxFiches.jaune).toEqual(doc.fluxFiches.jaune);
  });
});

describe("bornes du schéma", () => {
  it("coupe les textes trop longs : tout document produit par l'éditeur se relit", () => {
    let doc = beta();
    doc = ops.setCountryNote(doc, "FRA", "x".repeat(MAX_NOTE_LENGTH + 1));
    doc = ops.setCountryDate(doc, "FRA", "9".repeat(MAX_DATE_LENGTH + 1));
    doc = ops.updateFiche(doc, "p", "lv1abd2r8wn", { title: "t".repeat(MAX_TITLE_LENGTH + 1), note: "n".repeat(MAX_NOTE_LENGTH + 5) });
    doc = ops.updateFiche(doc, "l", "lv1abc0q7k2", { date: "d".repeat(MAX_DATE_LENGTH + 1) });
    doc = ops.updateFluxFiche(doc, "rouge", { title: "r".repeat(MAX_TITLE_LENGTH + 1) });
    expect(doc.notes.FRA).toHaveLength(MAX_NOTE_LENGTH);
    expect(doc.dates.FRA).toHaveLength(MAX_DATE_LENGTH);
    expect(doc.pings[0].title).toHaveLength(MAX_TITLE_LENGTH);
    expect(doc.pings[0].note).toHaveLength(MAX_NOTE_LENGTH);
    expect(doc.fluxFiches.rouge?.title).toHaveLength(MAX_TITLE_LENGTH);
    expect(parseMapDoc(doc)).toEqual(doc);
  });

  it("ne coupe pas un caractère en deux et ignore un code pays inconnu", () => {
    expect(ops.cut("ab😀", 3)).toBe("ab");
    expect(ops.cut("abc", 3)).toBe("abc");
    const doc = blankDoc();
    expect(ops.setCountryNote(doc, "ZZZ", "x")).toBe(doc);
    expect(ops.setCountryDate(doc, "ZZZ", "2024-01-01")).toBe(doc);
  });

  it("ramène les coordonnées et épaisseurs aberrantes dans les bornes", () => {
    let doc = ops.addPing(blankDoc(), [181, -91], "crise", "p1")!.doc;
    doc = ops.addFluxStroke(doc, "jaune", [[0, 0], [1, 1]], Number.NaN, "f1")!.doc;
    expect(doc.pings[0].ll).toEqual([180, -90]);
    expect(doc.flux.jaune?.[0].width).toBe(1);
    expect(parseMapDoc(doc)).toEqual(doc);
  });

  // Documents de 20 000 éléments par type : ~1 s seul, bien plus quand toute la suite tourne (délai 30 s).
  const many = <T>(count: number, make: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => make(i));
  const ping = (i: number) => ({ id: `p${i}`, ll: [0, 0] as LonLat, type: "crise" as const, title: "", note: "" });
  const point = (i: number) => ({ id: `o${i}`, ll: [0, 0] as LonLat, title: "", note: "", date: "" });
  const text = (i: number) => ({ id: `t${i}`, ll: [0, 0] as LonLat, title: "", note: "", date: "", size: 13 });
  const zone = (i: number) => ({ id: `z${i}`, ring: [[0, 0], [0, 1], [1, 1], [0, 0]] as LonLat[], title: "", note: "" });
  const stroke = (i: number, length = 2) => ({
    id: `f${i}`,
    points: many(length, (j): LonLat => [j % 2, j % 3]),
    width: 4,
    opacity: 0.65,
  });

  it("refuse un ajout au-delà de MAX_ITEMS par collection : le document reste lisible", () => {
    const pingsAndLinks: MapDoc = {
      ...blankDoc(),
      pings: many(MAX_ITEMS, ping),
      links: many(MAX_ITEMS, (i) => ({ id: `l${i}`, a: `p:p${i}` as const, b: "c:FRA" as const, title: "", note: "" })),
    };
    expect(parseMapDoc(pingsAndLinks)).not.toBeNull();
    expect(ops.addPing(pingsAndLinks, [1, 1], "crise")).toBeNull();
    expect(ops.addLink(pingsAndLinks, "c:FRA", "c:DEU")).toBeNull();
    // Le lien existant reste retrouvé ; les autres collections ont encore de la place.
    expect(ops.addLink(pingsAndLinks, "c:FRA", "p:p0")?.id).toBe("l0");
    expect(ops.addPoint(pingsAndLinks, [1, 1])).not.toBeNull();

    const pointsAndTexts: MapDoc = { ...blankDoc(), points: many(MAX_ITEMS, point), texts: many(MAX_ITEMS, text) };
    expect(parseMapDoc(pointsAndTexts)).not.toBeNull();
    expect(ops.addPoint(pointsAndTexts, [1, 1])).toBeNull();
    expect(ops.addText(pointsAndTexts, [1, 1], 13)).toBeNull();

    const zonesAndFlux: MapDoc = { ...blankDoc(), zones: many(MAX_ITEMS, zone), flux: { vert: many(MAX_ITEMS, (i) => stroke(i)) } };
    expect(parseMapDoc(zonesAndFlux)).not.toBeNull();
    expect(ops.addZone(zonesAndFlux, [[0, 0], [0, 1], [1, 1]])).toBeNull();
    expect(ops.addFluxStroke(zonesAndFlux, "vert", [[0, 0], [1, 1]], 4)).toBeNull();
    // Le plafond des flux vaut toutes couleurs confondues.
    expect(ops.addFluxStroke(zonesAndFlux, "rouge", [[0, 0], [1, 1]], 4)).toBeNull();
    const split = { ...zonesAndFlux, flux: { vert: zonesAndFlux.flux.vert!.slice(0, MAX_ITEMS - 1) } };
    expect(ops.addFluxStroke(split, "rouge", [[0, 0], [1, 1]], 4)).not.toBeNull();
  }, 30_000);

  it("refuse un ajout au-delà de MAX_TOTAL_ITEMS éléments en tout (mêmes bornes que le schéma)", () => {
    const rest = MAX_TOTAL_ITEMS - 2 * MAX_ITEMS - 1;
    const almost: MapDoc = { ...blankDoc(), pings: many(MAX_ITEMS, ping), points: many(MAX_ITEMS, point), texts: many(rest, text) };
    expect(parseMapDoc(almost)).not.toBeNull();
    const last = ops.addZone(almost, [[0, 0], [0, 1], [1, 1]]);
    expect(last).not.toBeNull();
    const full = last!.doc;
    expect(parseMapDoc(full)).not.toBeNull();
    expect(ops.addText(full, [1, 1], 13)).toBeNull();
    expect(ops.addZone(full, [[0, 0], [0, 1], [1, 1]])).toBeNull();
    expect(ops.addFluxStroke(full, "vert", [[0, 0], [1, 1]], 4)).toBeNull();
    expect(ops.addLink(full, "c:FRA", "c:DEU")).toBeNull();
    expect(parseMapDoc({ ...full, texts: [...full.texts, text(MAX_ITEMS)] })).toBeNull();
  }, 30_000);

  it("refuse une zone ou un trait au-delà de MAX_TOTAL_PATH_POINTS sommets en tout", () => {
    const strokes = many(MAX_TOTAL_PATH_POINTS / MAX_PATH_POINTS, (i) => stroke(i, MAX_PATH_POINTS));
    const full: MapDoc = { ...blankDoc(), flux: { vert: strokes } };
    expect(parseMapDoc(full)).not.toBeNull();
    expect(ops.addFluxStroke(full, "rouge", [[0, 0], [1, 1]], 4)).toBeNull();
    expect(ops.addZone(full, [[0, 0], [0, 1], [1, 1]])).toBeNull();
    // Un trait plus court laisse la place d'une petite zone (3 points + fermeture).
    const roomy = { ...full, flux: { vert: [...strokes.slice(1), stroke(99, MAX_PATH_POINTS - 4)] } };
    expect(ops.addZone(roomy, [[0, 0], [0, 1], [1, 1]])).not.toBeNull();
    expect(parseMapDoc({ ...full, zones: [zone(0)] })).toBeNull();
  }, 30_000);
});

describe("gomme", () => {
  it("supprime une balise et, en cascade, les liens qui s'y rattachent", () => {
    const doc = beta();
    const next = ops.erase(doc, "p", "lv1abd2r8wn");
    expect(next.pings.map((p) => p.id)).not.toContain("lv1abd2r8wn");
    expect(next.links.map((l) => l.id)).toEqual(["lv1abc0q7k2", "lv1abc2k9pq", "lv1abc3z0zz"]);
    expect(doc.pings).toHaveLength(3);
  });

  it("cascade pour les points, zones et textes, mais pas pour un lien", () => {
    const doc = beta();
    expect(ops.erase(doc, "o", "lv1abe5t2aa").links).toHaveLength(3);
    expect(ops.erase(doc, "t", "lv1abf7h1bb").links).toHaveLength(3);
    expect(ops.erase(doc, "z", "lv1abg0c4cc").links).toHaveLength(3);
    const noLink = ops.erase(doc, "l", "lv1abc0q7k2");
    expect(noLink.links).toHaveLength(3);
    expect(noLink.pings).toEqual(doc.pings);
  });

  it("supprime un trait de flux et ignore les pays", () => {
    const doc = beta();
    expect(ops.erase(doc, "flux", "lv1abh1dd01").flux.jaune).toEqual([]);
    expect(ops.erase(doc, "c", "FRA")).toBe(doc);
    expect(ops.entityExists(doc, "flux", "lv1abh1dd01")).toBe(true);
    expect(ops.entityExists(doc, "c", "XTR")).toBe(true);
  });
});

describe("résumés", () => {
  it("hasContent et statsOf", () => {
    expect(ops.hasContent(blankDoc())).toBe(false);
    expect(ops.hasContent(ops.setCountryDate(blankDoc(), "FRA", "2024-01-01"))).toBe(true);
    expect(ops.hasContent(ops.addFluxStroke(blankDoc(), "jaune", [[0, 0], [1, 1]], 2)!.doc)).toBe(true);
    expect(ops.statsOf(beta())).toBe("2 pays annotés · 4 liens · 3 balises · 1 zones · 1 textes");
  });

  it("relationsOf renvoie l'autre extrémité", () => {
    const rel = ops.relationsOf(beta(), "c:FRA");
    expect(rel.map((r) => r.other)).toEqual(["c:DEU"]);
  });
});

describe("références", () => {
  it("parseRef / makeRef", () => {
    expect(parseRef("c:FRA")).toEqual({ k: "c", id: "FRA" });
    expect(parseRef("FRA")).toEqual({ k: "c", id: "FRA" });
    expect(parseRef("q:abc")).toBeNull();
    expect(parseRef('p:x"><img')).toBeNull();
    expect(makeRef("z", "abc")).toBe("z:abc");
  });

  it("nameOfRef reprend les libellés de la bêta", () => {
    const doc = beta();
    expect(nameOfRef(doc, "c:FRA")).toBe("France");
    expect(nameOfRef(doc, "p:lv1abd2r8wn")).toBe("Kyiv");
    expect(nameOfRef(doc, "p:lv1abd3qq01")).toBe("Balise maritime");
    expect(nameOfRef(doc, "p:absent")).toBe("Balise supprimée");
    expect(nameOfRef(doc, "o:absent")).toBe("Point supprimé");
    expect(nameOfRef(doc, "z:absent")).toBe("Zone supprimée");
    expect(nameOfRef(doc, "t:absent")).toBe("Texte supprimé");
    expect(nameOfRef(ops.addText(doc, [0, 0], 13, "t2")!.doc, "t:t2")).toBe("Texte sans titre");
  });

  it("anchorOf utilise l'ancre de pays fournie et le centroïde des zones", () => {
    const doc = beta();
    const paris: LonLat = [2.35, 48.86];
    expect(anchorOf(doc, "c:FRA", (code) => (code === "FRA" ? paris : null))).toEqual(paris);
    expect(anchorOf(doc, "p:lv1abd2r8wn", () => null)).toEqual([30.5234, 50.4501]);
    const [lon, lat] = anchorOf(doc, "z:lv1abg0c4cc", () => null) ?? [NaN, NaN];
    expect(lon).toBeCloseTo(21, 0);
    expect(lat).toBeCloseTo(43, 0);
    expect(anchorOf(doc, "z:absent", () => null)).toBeNull();
  });

  it("linkAnchors donne les mêmes ancres que anchorOf et omet les liens orphelins", () => {
    const doc = beta();
    const anchor = (code: string): LonLat | null => (code === "XKX" ? null : [Number(code.length), 0]);
    const lines = linkAnchors(doc, anchor);
    for (const { link, a, b } of lines) {
      expect(a).toEqual(anchorOf(doc, link.a, anchor));
      expect(b).toEqual(anchorOf(doc, link.b, anchor));
    }
    // Le lien zone → Kosovo n'a pas d'ancre de pays ici : il est omis.
    expect(lines.map((l) => l.id)).toEqual(doc.links.filter((l) => l.b !== "c:XKX").map((l) => l.id));
    // Centroïde de zone calculé une fois par anneau : même tableau d'un appel à l'autre.
    const zoneLink = (src: typeof doc) => linkAnchors(src, () => [0, 0]).find((l) => l.link.a.startsWith("z:"));
    expect(zoneLink(doc)?.a).toBe(zoneLink({ ...doc, links: [...doc.links] })?.a);
  });
});
