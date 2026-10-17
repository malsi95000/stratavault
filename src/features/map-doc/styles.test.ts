import { describe, expect, it } from "vitest";
import { addCategory, removeCategory, updateCategory } from "./categories";
import { addLink, addPoint } from "./ops";
import { nameOfElement } from "./refs";
import { blankDoc } from "./schema";
import { colorsOf, displayColor, setElementStyle } from "./styles";
import type { MapDoc } from "./types";

/** France–Espagne (l1), Allemagne–Italie (l2), un point (o1) et une catégorie « Défense » rouge (k1). */
function sample(): MapDoc {
  let doc = addLink(blankDoc(), "c:FRA", "c:ESP", "l1")!.doc;
  doc = addLink(doc, "c:DEU", "c:ITA", "l2")!.doc;
  doc = addPoint(doc, [2, 48], "o1")!.doc;
  return addCategory(doc, "Défense", "rouge", "k1")!.doc;
}

describe("couleur affichée d'un élément", () => {
  it("couleur propre, sinon celle de la catégorie, sinon aucune", () => {
    const { categories } = sample();
    expect(displayColor(undefined, categories)).toBeNull();
    expect(displayColor({ category: "k1" }, categories)).toBe("rouge");
    expect(displayColor({ color: "#123456", category: "k1" }, categories)).toBe("#123456");
    expect(displayColor({ category: "inconnue" }, categories)).toBeNull();
  });

  it("couleurs par sorte d'élément, qui suivent les changements de catégorie", () => {
    let doc = sample();
    doc = setElementStyle(doc, "c:FRA", { color: "cyan" });
    doc = setElementStyle(doc, "c:ESP", { category: "k1" });
    doc = setElementStyle(doc, "l:l1", { category: "k1" });
    doc = setElementStyle(doc, "l:l2", { color: "#abcdef" });
    doc = setElementStyle(doc, "o:o1", { color: "vert" });
    expect([...colorsOf(doc, "c")]).toEqual([
      ["FRA", "cyan"],
      ["ESP", "rouge"],
    ]);
    expect([...colorsOf(doc, "l")]).toEqual([
      ["l1", "rouge"],
      ["l2", "#abcdef"],
    ]);
    // Recolorer la catégorie recolore ses éléments ; la supprimer leur retire sa couleur.
    doc = updateCategory(doc, "k1", { color: "bleu" });
    expect(colorsOf(doc, "c").get("ESP")).toBe("bleu");
    doc = removeCategory(doc, "k1");
    expect([...colorsOf(doc, "c")]).toEqual([["FRA", "cyan"]]);
    expect([...colorsOf(doc, "l")]).toEqual([["l2", "#abcdef"]]);
  });
});

describe("nom d'un élément", () => {
  it("pays, point et lien (ses deux extrémités)", () => {
    const doc = sample();
    expect(nameOfElement(doc, "c:FRA")).toBe("France");
    expect(nameOfElement(doc, "o:o1")).toBe("Point");
    expect(nameOfElement(doc, "l:l1")).toBe("France – Espagne");
    expect(nameOfElement(doc, "l:absent")).toBe("Lien supprimé");
  });
});
