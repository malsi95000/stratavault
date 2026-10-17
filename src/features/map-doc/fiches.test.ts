import { describe, expect, it } from "vitest";
import { addExtraFiche, extraFichesOf, findExtraFiche, removeExtraFiche, updateExtraFiche } from "./fiches";
import { MAX_FICHES_PER_ELEMENT, MAX_TOTAL_FICHES } from "./limits";
import { addCategory, addLink, addPing, addPoint, addText, addZone, erase, erasedFicheCount } from "./ops";
import { blankDoc, parseMapDoc } from "./schema";
import { MAX_NOTE_LENGTH, MAX_TITLE_LENGTH } from "./types";
import type { MapDoc } from "./types";

/** Carte avec un lien France–Espagne (l1) et un point (o1). */
function sample(): MapDoc {
  const linked = addLink(blankDoc(), "c:FRA", "c:ESP", "l1")!.doc;
  return addPoint(linked, [2, 48], "o1")!.doc;
}

describe("fiches supplémentaires", () => {
  it("ajoute des fiches à un pays, un lien ou un point, dans l'ordre, sans modifier l'entrée", () => {
    const doc = sample();
    const before = JSON.stringify(doc);
    const a = addExtraFiche(doc, "c:FRA", { title: "Dissuasion" }, "f1")!;
    const b = addExtraFiche(a.doc, "c:FRA", {}, "f2")!;
    const c = addExtraFiche(b.doc, "l:l1", { note: "Traité" }, "f3")!;
    const d = addExtraFiche(c.doc, "o:o1", {}, "f4")!;
    expect(JSON.stringify(doc)).toBe(before);
    expect(extraFichesOf(d.doc, "c:FRA")).toEqual([
      { id: "f1", title: "Dissuasion", note: "" },
      { id: "f2", title: "", note: "" },
    ]);
    expect(findExtraFiche(d.doc, "f3")).toEqual({ owner: "l:l1", fiche: { id: "f3", title: "", note: "Traité" } });
    expect(findExtraFiche(d.doc, "inconnue")).toBeNull();
    expect(parseMapDoc(JSON.parse(JSON.stringify(d.doc)))).toEqual(d.doc);
  });

  it("refuse un élément absent ou mal désigné et un identifiant déjà pris", () => {
    const doc = sample();
    expect(addExtraFiche(doc, "c:ZZZ")).toBeNull();
    expect(addExtraFiche(doc, "l:inconnu")).toBeNull();
    expect(addExtraFiche(doc, "p:o1")).toBeNull();
    const added = addExtraFiche(doc, "c:FRA", {}, "f1")!;
    expect(addExtraFiche(added.doc, "c:ESP", {}, "f1")).toBeNull();
  });

  it("met à jour titre, notes, date, couleur et catégorie ; null retire couleur et catégorie", () => {
    const withCategory = addCategory(sample(), "Défense", "rouge", "k1")!.doc;
    let doc = addExtraFiche(withCategory, "c:FRA", {}, "f1")!.doc;
    doc = updateExtraFiche(doc, "f1", { title: "T", note: "N", date: "2024-01-01", color: "cyan", category: "k1" });
    expect(findExtraFiche(doc, "f1")?.fiche).toEqual({
      id: "f1",
      title: "T",
      note: "N",
      date: "2024-01-01",
      color: "cyan",
      category: "k1",
    });
    // Couleur invalide et catégorie inconnue ignorées ; une clé absente ne change rien.
    const ignored = updateExtraFiche(doc, "f1", { color: "red" as never, category: "k2" });
    expect(findExtraFiche(ignored, "f1")?.fiche).toEqual(findExtraFiche(doc, "f1")?.fiche);
    const cleared = updateExtraFiche(doc, "f1", { color: null, category: null });
    expect(findExtraFiche(cleared, "f1")?.fiche).toEqual({ id: "f1", title: "T", note: "N", date: "2024-01-01" });
    expect(updateExtraFiche(doc, "inconnue", { title: "x" })).toBe(doc);
  });

  it("coupe les textes aux bornes du schéma", () => {
    let doc = addExtraFiche(sample(), "c:FRA", {}, "f1")!.doc;
    doc = updateExtraFiche(doc, "f1", { title: "a".repeat(MAX_TITLE_LENGTH + 5), note: "b".repeat(MAX_NOTE_LENGTH + 5) });
    expect(findExtraFiche(doc, "f1")?.fiche.title).toHaveLength(MAX_TITLE_LENGTH);
    expect(findExtraFiche(doc, "f1")?.fiche.note).toHaveLength(MAX_NOTE_LENGTH);
    expect(parseMapDoc(doc)).not.toBeNull();
  });

  it("supprime une fiche ; la clé de l'élément disparaît avec sa dernière fiche", () => {
    let doc = addExtraFiche(sample(), "c:FRA", {}, "f1")!.doc;
    doc = addExtraFiche(doc, "c:FRA", {}, "f2")!.doc;
    doc = removeExtraFiche(doc, "f1");
    expect(extraFichesOf(doc, "c:FRA").map((f) => f.id)).toEqual(["f2"]);
    doc = removeExtraFiche(doc, "f2");
    expect(doc.fiches).toEqual({});
    expect(removeExtraFiche(doc, "f2")).toBe(doc);
  });

  it("refuse une fiche au-delà des plafonds par élément et pour toute la carte", () => {
    let doc = sample();
    for (let i = 0; i < MAX_FICHES_PER_ELEMENT; i++) doc = addExtraFiche(doc, "c:FRA", {}, `f${i}`)!.doc;
    expect(addExtraFiche(doc, "c:FRA")).toBeNull();
    expect(addExtraFiche(doc, "c:ESP")).not.toBeNull();

    const full: MapDoc = { ...blankDoc(), fiches: {} };
    const perOwner = Array.from({ length: MAX_FICHES_PER_ELEMENT }, (_, i) => i);
    const owners = ["FRA", "ESP", "DEU", "ITA", "PRT"];
    let n = 0;
    for (let o = 0; n < MAX_TOTAL_FICHES; o++) {
      const ref = `c:${owners[o % owners.length]}${o}` as const;
      full.fiches[ref] = perOwner.map(() => ({ id: `t${n++}`, title: "", note: "" }));
    }
    expect(addExtraFiche(full, "c:FRA")).toBeNull();
  });
});

describe("gomme : cascade du format v2", () => {
  it("supprime les fiches et le style d'un élément gommé, et ceux des liens supprimés avec lui", () => {
    let doc = addLink(sample(), "o:o1", "c:FRA", "l2")!.doc;
    doc = addExtraFiche(doc, "o:o1", {}, "f1")!.doc;
    doc = addExtraFiche(doc, "l:l2", {}, "f2")!.doc;
    doc = addExtraFiche(doc, "l:l1", {}, "f3")!.doc;
    doc = addExtraFiche(doc, "c:FRA", {}, "f4")!.doc;
    doc = { ...doc, styles: { "o:o1": { color: "vert" }, "l:l2": { color: "rouge" }, "c:FRA": { color: "bleu" } } };

    const erased = erase(doc, "o", "o1");
    expect(erased.links.map((l) => l.id)).toEqual(["l1"]);
    expect(Object.keys(erased.fiches)).toEqual(["l:l1", "c:FRA"]);
    expect(erased.styles).toEqual({ "c:FRA": { color: "bleu" } });
    expect(parseMapDoc(erased)).toEqual(erased);

    const linkErased = erase(doc, "l", "l1");
    expect(Object.keys(linkErased.fiches)).toEqual(["o:o1", "l:l2", "c:FRA"]);
    // Les pays ne se gomment pas.
    expect(erase(doc, "c", "FRA")).toBe(doc);

    // Fiches emportées (texte des confirmations) : l'élément et ses liens, rien pour un pays.
    expect(erasedFicheCount(doc, "o", "o1")).toBe(2);
    expect(erasedFicheCount(doc, "l", "l1")).toBe(1);
    expect(erasedFicheCount(doc, "c", "FRA")).toBe(0);
    expect(erasedFicheCount(sample(), "o", "o1")).toBe(0);
  });

  it("vaut pour chaque sorte d'élément gommable : balise, point, zone, texte", () => {
    let base = addPing(blankDoc(), [10, 20], "crise", "e1")!.doc;
    base = addPoint(base, [11, 21], "e1")!.doc;
    base = addZone(base, [[0, 0], [0, 1], [1, 1]], "e1")!.doc;
    base = addText(base, [12, 22], 14, "e1")!.doc;
    for (const kind of ["p", "o", "z", "t"] as const) {
      const ref = `${kind}:e1` as const;
      let doc = addLink(base, ref, "c:FRA", "lk")!.doc;
      doc = addExtraFiche(doc, ref, {}, "f1")!.doc;
      doc = addExtraFiche(doc, "l:lk", {}, "f2")!.doc;
      doc = addExtraFiche(doc, "c:FRA", {}, "f3")!.doc;
      doc = { ...doc, styles: { [ref]: { color: "vert" as const }, "l:lk": { color: "rouge" }, "c:FRA": { color: "bleu" } } };
      expect(parseMapDoc(doc), kind).toEqual(doc);

      const erased = erase(doc, kind, "e1");
      expect(erased.links, kind).toEqual([]);
      expect(Object.keys(erased.fiches), kind).toEqual(["c:FRA"]);
      expect(erased.styles, kind).toEqual({ "c:FRA": { color: "bleu" } });
      // Les éléments des autres sortes, au même identifiant, restent.
      const remaining = [erased.pings, erased.points, erased.zones, erased.texts].map((list) => list.length);
      expect(remaining.reduce((sum, n) => sum + n), kind).toBe(3);
      expect(parseMapDoc(erased), kind).toEqual(erased);
    }
  });
});
