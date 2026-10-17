// Carte d'exemple des tests de la frise et des filtres : chaque sorte d'élément, des dates, des
// couleurs, des catégories et des fiches supplémentaires.
import * as ops from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";

export function timelineDoc(): MapDoc {
  let doc = blankDoc();
  doc = ops.addCategory(doc, "Conflits", "rouge", "conflits")!.doc;
  doc = ops.addCategory(doc, "Diplomatie", "bleu", "diplo")!.doc;
  // Pays : la France datée et colorée, l'Allemagne avec des notes sans date, la Belgique classée.
  doc = ops.setCountryDate(doc, "FRA", "1914-08-03");
  doc = ops.setCountryNote(doc, "FRA", "Mobilisation générale.");
  doc = ops.setElementStyle(doc, "c:FRA", { color: "jaune" });
  doc = ops.setCountryNote(doc, "DEU", "Notes sans date.");
  doc = ops.setElementStyle(doc, "c:BEL", { category: "conflits" });
  // Autres éléments.
  doc = ops.addPing(doc, [2, 49], "crise", "p1")!.doc;
  doc = ops.updateFiche(doc, "p", "p1", { title: "Bataille de la Marne", date: "1914-09-06" });
  doc = ops.addPoint(doc, [2.35, 48.85], "o1")!.doc;
  doc = ops.updateFiche(doc, "o", "o1", { date: "1919-06-28" });
  doc = ops.addZone(doc, [[20, 42], [20, 44], [22, 44], [22, 42]], "z1")!.doc;
  doc = ops.addText(doc, [10, 45], 13, "t1")!.doc;
  doc = ops.updateFiche(doc, "t", "t1", { title: "Avant la frise", date: "1789-07-14" });
  doc = ops.addLink(doc, "c:FRA", "c:DEU", "l1")!.doc;
  doc = ops.updateFiche(doc, "l", "l1", { date: "1918-11-11" });
  doc = ops.setElementStyle(doc, "l:l1", { category: "diplo" });
  doc = ops.addFluxStroke(doc, "vert", [[0, 0], [5, 5]], 4, "f1")!.doc;
  doc = ops.addFluxStroke(doc, "vert", [[1, 1], [6, 6]], 4, "f2")!.doc;
  doc = ops.updateFluxFiche(doc, "vert", { date: "1916" });
  // Fiches supplémentaires : l'une hérite de la couleur de la France, l'autre a sa catégorie.
  doc = ops.addExtraFiche(doc, "c:FRA", { title: "Verdun", date: "1916-02-21", category: "conflits" }, "x1")!.doc;
  doc = ops.addExtraFiche(doc, "c:FRA", { title: "Sans date" }, "x2")!.doc;
  doc = ops.addExtraFiche(doc, "l:l1", { title: "Traité", date: "1919-06-28", color: "#123abc" }, "x3")!.doc;
  return doc;
}
