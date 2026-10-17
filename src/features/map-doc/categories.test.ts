import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORY_LABEL,
  addCategory,
  categoryUsage,
  findCategory,
  nextCategoryColor,
  removeCategory,
  updateCategory,
} from "./categories";
import { addExtraFiche, findExtraFiche } from "./fiches";
import { MAX_CATEGORIES, MAX_CATEGORY_LABEL_LENGTH, MAX_STYLES } from "./limits";
import { addLink, hasContent } from "./ops";
import { blankDoc, parseMapDoc } from "./schema";
import { setElementStyle, styleOf } from "./styles";
import type { MapDoc } from "./types";

const linked = (): MapDoc => addLink(blankDoc(), "c:FRA", "c:ESP", "l1")!.doc;

describe("catégories", () => {
  it("ajoute, renomme et recolore une catégorie", () => {
    const added = addCategory(linked(), "  Défense  ", "rouge", "k1")!;
    expect(added.doc.categories).toEqual([{ id: "k1", label: "Défense", color: "rouge" }]);
    expect(hasContent({ ...blankDoc(), categories: added.doc.categories })).toBe(true);
    let doc = updateCategory(added.doc, "k1", { label: "Armées", color: "#abcdef" });
    expect(findCategory(doc, "k1")).toEqual({ id: "k1", label: "Armées", color: "#abcdef" });
    // Nom vide : nom par défaut ; trop long : coupé ; couleur invalide : ignorée.
    doc = updateCategory(doc, "k1", { label: "  ", color: "#ABCDEF" as never });
    expect(findCategory(doc, "k1")).toEqual({ id: "k1", label: DEFAULT_CATEGORY_LABEL, color: "#abcdef" });
    doc = updateCategory(doc, "k1", { label: "x".repeat(MAX_CATEGORY_LABEL_LENGTH + 10) });
    expect(findCategory(doc, "k1")?.label).toHaveLength(MAX_CATEGORY_LABEL_LENGTH);
    expect(updateCategory(doc, "inconnue", { label: "x" })).toBe(doc);
    expect(parseMapDoc(doc)).toEqual(doc);
  });

  it("refuse une couleur invalide, un identifiant pris et plus de MAX_CATEGORIES catégories", () => {
    expect(addCategory(blankDoc(), "x", "red" as never)).toBeNull();
    const one = addCategory(blankDoc(), "x", "vert", "k1")!.doc;
    expect(addCategory(one, "y", "vert", "k1")).toBeNull();
    let doc = blankDoc();
    for (let i = 0; i < MAX_CATEGORIES; i++) doc = addCategory(doc, `c${i}`, "vert", `k${i}`)!.doc;
    expect(addCategory(doc, "de trop", "vert")).toBeNull();
  });

  it("supprime une catégorie et retire ses références des fiches et des styles", () => {
    let doc = addCategory(linked(), "Défense", "rouge", "k1")!.doc;
    doc = addCategory(doc, "Économie", "bleu", "k2")!.doc;
    doc = addExtraFiche(doc, "c:FRA", { category: "k1", color: "cyan" }, "f1")!.doc;
    doc = addExtraFiche(doc, "c:FRA", { category: "k2" }, "f2")!.doc;
    doc = setElementStyle(doc, "c:FRA", { category: "k1", color: "vert" });
    doc = setElementStyle(doc, "l:l1", { category: "k1" });
    doc = setElementStyle(doc, "c:ESP", { category: "k2" });

    const removed = removeCategory(doc, "k1");
    expect(removed.categories.map((c) => c.id)).toEqual(["k2"]);
    expect(findExtraFiche(removed, "f1")?.fiche).toEqual({ id: "f1", title: "", note: "", color: "cyan" });
    expect(findExtraFiche(removed, "f2")?.fiche.category).toBe("k2");
    // Un style qui n'avait que cette catégorie disparaît.
    expect(removed.styles).toEqual({ "c:FRA": { color: "vert" }, "c:ESP": { category: "k2" } });
    expect(parseMapDoc(removed)).toEqual(removed);
    expect(removeCategory(removed, "k1")).toBe(removed);
  });
});

describe("styles des éléments", () => {
  it("donne une couleur et une catégorie à un pays ou un lien ; null les retire", () => {
    let doc = addCategory(linked(), "Défense", "rouge", "k1")!.doc;
    doc = setElementStyle(doc, "c:FRA", { color: "#123456" });
    doc = setElementStyle(doc, "c:FRA", { category: "k1" });
    doc = setElementStyle(doc, "l:l1", { color: "corail" });
    expect(styleOf(doc, "c:FRA")).toEqual({ color: "#123456", category: "k1" });
    expect(styleOf(doc, "l:l1")).toEqual({ color: "corail" });
    expect(parseMapDoc(doc)).toEqual(doc);
    doc = setElementStyle(doc, "c:FRA", { color: null });
    expect(styleOf(doc, "c:FRA")).toEqual({ category: "k1" });
    doc = setElementStyle(doc, "c:FRA", { category: null });
    expect(styleOf(doc, "c:FRA")).toBeUndefined();
    expect(Object.keys(doc.styles)).toEqual(["l:l1"]);
  });

  it("ignore un élément absent, une couleur invalide, une catégorie inconnue", () => {
    const doc = linked();
    expect(setElementStyle(doc, "c:ZZZ", { color: "vert" })).toBe(doc);
    expect(setElementStyle(doc, "l:inconnu", { color: "vert" })).toBe(doc);
    expect(setElementStyle(doc, "c:FRA", { color: "url(#x)" as never }).styles).toEqual({});
    expect(setElementStyle(doc, "c:FRA", { category: "k9" }).styles).toEqual({});
    expect(styleOf(doc, "constructor" as never)).toBeUndefined();
  });

  it("refuse un nouveau style au-delà de MAX_STYLES, mais modifie un style existant", () => {
    const pings = Array.from({ length: MAX_STYLES }, (_, i) => ({
      id: `p${i}`,
      ll: [0, 0] as [number, number],
      type: "crise" as const,
      title: "",
      note: "",
    }));
    const styles = Object.fromEntries(pings.map((p) => [`p:${p.id}`, { color: "vert" as const }]));
    const doc: MapDoc = { ...linked(), pings, styles };
    expect(setElementStyle(doc, "c:FRA", { color: "rouge" })).toBe(doc);
    expect(styleOf(setElementStyle(doc, "p:p0", { color: "rouge" }), "p:p0")).toEqual({ color: "rouge" });
  });
});

describe("catégories : usage et couleur proposée", () => {
  it("compte les éléments et les fiches qui portent une catégorie", () => {
    let doc = addCategory(linked(), "Défense", "rouge", "k1")!.doc;
    doc = addCategory(doc, "Économie", "bleu", "k2")!.doc;
    doc = setElementStyle(doc, "c:FRA", { category: "k1" });
    doc = setElementStyle(doc, "l:l1", { category: "k1" });
    doc = addExtraFiche(doc, "c:ESP", { category: "k1" }, "f1")!.doc;
    doc = addExtraFiche(doc, "c:ESP", { category: "k2" }, "f2")!.doc;
    expect(categoryUsage(doc, "k1")).toBe(3);
    expect(categoryUsage(doc, "k2")).toBe(1);
    expect(categoryUsage(doc, "absente")).toBe(0);
  });

  it("propose la première couleur de la palette encore libre", () => {
    expect(nextCategoryColor(blankDoc())).toBe("jaune");
    let doc = addCategory(blankDoc(), "a", "jaune", "k1")!.doc;
    doc = addCategory(doc, "b", "#123456", "k2")!.doc;
    expect(nextCategoryColor(doc)).toBe("orange");
  });
});
