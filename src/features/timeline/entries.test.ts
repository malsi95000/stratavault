import { describe, expect, it } from "vitest";
import * as ops from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import { collectEntries, entryKeyOf } from "./entries";
import { timelineDoc } from "./fixtures";

const byKey = (doc = timelineDoc()) => new Map(collectEntries(doc).map((e) => [e.key, e]));

describe("fiches de la carte mises à plat", () => {
  it("une carte vide n'a aucune fiche", () => {
    expect(collectEntries(blankDoc())).toEqual([]);
  });

  it("chaque élément donne sa fiche principale, les flux une fiche par couleur tracée", () => {
    const keys = [...byKey().keys()];
    expect(keys).toEqual([
      "main:c:FRA",
      "fiche:x1",
      "fiche:x2",
      "main:c:DEU",
      "main:c:BEL",
      "main:l:l1",
      "fiche:x3",
      "main:p:p1",
      "main:o:o1",
      "main:z:z1",
      "main:t:t1",
      "flux:vert",
    ]);
  });

  it("titre, date et cible de chaque fiche", () => {
    const e = byKey();
    expect(e.get("main:c:FRA")).toMatchObject({ kind: "c", owner: "FRA", title: "France", date: "1914-08-03", main: true });
    expect(e.get("main:c:FRA")!.when).toMatchObject({ year: 1914, month: 8, day: 3 });
    expect(e.get("main:c:DEU")).toMatchObject({ when: null, title: "Allemagne" });
    expect(e.get("main:p:p1")).toMatchObject({ title: "Bataille de la Marne", target: { k: "p", id: "p1" } });
    expect(e.get("main:o:o1")).toMatchObject({ title: "Point" });
    expect(e.get("main:z:z1")).toMatchObject({ title: "Zone", when: null });
    // Lien sans titre : le nom de ses extrémités est calculé à l'affichage (labels.ts).
    expect(e.get("main:l:l1")).toMatchObject({ title: "", ref: "l:l1" });
    expect(e.get("fiche:x1")).toMatchObject({ title: "Verdun", main: false, target: { k: "c", id: "FRA", fiche: "x1" } });
    expect(e.get("fiche:x2")).toMatchObject({ title: "Sans date", when: null });
    // Flux : ouvert depuis son premier trait, titre par défaut de la fiche technique.
    expect(e.get("flux:vert")).toMatchObject({ kind: "flux", owner: "vert", ref: null, target: { k: "flux", id: "f1" }, title: "Flux vert" });
    expect(e.get("flux:vert")!.when).toMatchObject({ year: 1916 });
  });

  it("couleur : la sienne, sinon celle de sa catégorie, sinon celle de l'élément", () => {
    const e = byKey();
    expect(e.get("main:c:FRA")).toMatchObject({ color: "jaune", category: null });
    expect(e.get("main:c:BEL")).toMatchObject({ color: "rouge", category: "conflits" });
    expect(e.get("fiche:x1")).toMatchObject({ color: "rouge", category: "conflits" });
    // Fiche sans couleur ni catégorie : celles de son élément.
    expect(e.get("fiche:x2")).toMatchObject({ color: "jaune", category: null });
    expect(e.get("main:l:l1")).toMatchObject({ color: "bleu", category: "diplo" });
    expect(e.get("fiche:x3")).toMatchObject({ color: "#123abc", category: "diplo" });
    // Balise : pas de couleur (filtre « Sans couleur »), mais celle de son type pour l'affichage.
    expect(e.get("main:p:p1")).toMatchObject({ color: null, category: null, tint: "var(--color-ping-crise)" });
    expect(e.get("main:c:FRA")?.tint).toBeUndefined();
    expect(e.get("flux:vert")).toMatchObject({ color: "vert" });
  });

  it("un pays sans notes, date ni style n'a pas de fiche principale, mais garde ses fiches supplémentaires", () => {
    let doc = blankDoc();
    doc = ops.addExtraFiche(doc, "c:ITA", { title: "Seule" }, "s1")!.doc;
    expect(collectEntries(doc).map((e) => e.key)).toEqual(["fiche:s1"]);
  });

  it("la fiche technique d'une couleur sans trait n'est pas reprise", () => {
    const doc = ops.updateFluxFiche(blankDoc(), "rouge", { date: "1950" });
    expect(collectEntries(doc)).toEqual([]);
  });

  it("clé de la fiche ouverte dans le panneau", () => {
    const flux = (id: string) => (id === "f2" ? "vert" : null);
    expect(entryKeyOf(null, flux)).toBeNull();
    expect(entryKeyOf({ k: "c", id: "FRA" }, flux)).toBe("main:c:FRA");
    expect(entryKeyOf({ k: "c", id: "FRA", fiche: "x1" }, flux)).toBe("fiche:x1");
    expect(entryKeyOf({ k: "flux", id: "f2" }, flux)).toBe("flux:vert");
    expect(entryKeyOf({ k: "flux", id: "inconnu" }, flux)).toBeNull();
  });
});
