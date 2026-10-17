import { describe, expect, it } from "vitest";
import * as ops from "@/features/map-doc/ops";
import { collectEntries } from "@/features/timeline/entries";
import { timelineDoc } from "@/features/timeline/fixtures";
import { EMPTY_FILTER, activeCriteria, compileFilter, isFilterActive, normalizeFilter, periodOf, toggled } from "./filter";
import type { Filter } from "./filter";
import { categoryOptions, colorOptions } from "./options";
import { categoryLabel, colorLabel, filterSummary, matchCountLabel, periodLabel } from "./summary";
import { isVisible, visibilityOf, visibilitySelector } from "./visibility";

const doc = timelineDoc();
const entries = collectEntries(doc);
const f = (patch: Partial<Filter>): Filter => ({ ...EMPTY_FILTER, ...patch });
/** Clés des fiches qui passent le filtre. */
const keys = (filter: Filter) => {
  const matches = compileFilter(filter);
  return matches ? entries.filter(matches).map((e) => e.key) : "tout";
};

describe("filtre", () => {
  it("vide : rien n'est filtré", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(compileFilter(EMPTY_FILTER)).toBeNull();
    expect(keys(f({ from: "   " }))).toBe("tout");
  });

  it("période : bornes incluses, une date couvre toute sa durée", () => {
    expect(periodOf(f({ from: "1914", to: "1918" }))).toEqual({ start: 1914, end: 1919, invalid: [] });
    expect(keys(f({ from: "1916", to: "1918" }))).toEqual(["fiche:x1", "main:l:l1", "flux:vert"]);
    // « 1916 » (flux) chevauche juin 1916 ; Verdun (21 février) non.
    expect(keys(f({ from: "1916-06" }))).toEqual(["main:l:l1", "fiche:x3", "main:o:o1", "flux:vert"]);
    expect(keys(f({ to: "1914-08-03" }))).toEqual(["main:c:FRA", "main:t:t1"]);
    // Les fiches sans date ne sont dans aucune période.
    expect(keys(f({ from: "1700" }))).not.toContain("main:c:DEU");
  });

  it("période illisible : ignorée et signalée ; à l'envers : rien ne correspond", () => {
    expect(periodOf(f({ from: "hier", to: "1918" }))).toEqual({ start: null, end: 1919, invalid: ["from"] });
    expect(activeCriteria(f({ from: "hier" }))).toBe(0);
    expect(keys(f({ from: "1919", to: "1914" }))).toEqual([]);
    // Bornes au mois, à l'envers : le flux « 1916 » chevaucherait les deux bornes, il ne passe pas non plus.
    expect(keys(f({ from: "1916-06", to: "1916-03" }))).toEqual([]);
    expect(keys(f({ from: "1916-06-01", to: "1916-06-01" }))).toEqual(["flux:vert"]);
  });

  it("couleurs, catégories et types : une valeur suffit dans un critère, tous les critères sont requis", () => {
    expect(keys(f({ colors: ["rouge"] }))).toEqual(["fiche:x1", "main:c:BEL"]);
    expect(keys(f({ colors: ["rouge", "vert"] }))).toEqual(["fiche:x1", "main:c:BEL", "flux:vert"]);
    expect(keys(f({ colors: [null] }))).toEqual(["main:c:DEU", "main:p:p1", "main:o:o1", "main:z:z1", "main:t:t1"]);
    expect(keys(f({ categories: ["diplo"] }))).toEqual(["main:l:l1", "fiche:x3"]);
    expect(keys(f({ categories: [null], kinds: ["c"] }))).toEqual(["main:c:FRA", "fiche:x2", "main:c:DEU"]);
    expect(keys(f({ kinds: ["flux", "p"] }))).toEqual(["main:p:p1", "flux:vert"]);
    expect(keys(f({ kinds: ["l"], from: "1919" }))).toEqual(["fiche:x3"]);
    expect(activeCriteria(f({ kinds: ["l"], from: "1919", colors: [null], categories: ["x"] }))).toBe(4);
  });

  it("oublie les catégories supprimées de la carte", () => {
    const filter = f({ categories: ["conflits", "disparue", null] });
    expect(normalizeFilter(filter, doc.categories).categories).toEqual(["conflits", null]);
    const same = f({ categories: ["conflits"] });
    expect(normalizeFilter(same, doc.categories)).toBe(same);
  });

  it("coche et décoche", () => {
    expect(toggled(["a"], "b")).toEqual(["a", "b"]);
    expect(toggled(["a", "b"], "a")).toEqual(["b"]);
    expect(toggled<string | null>([], null)).toEqual([null]);
  });
});

describe("visibilité sur la carte", () => {
  it("un élément est visible si l'une de ses fiches passe le filtre", () => {
    const v = visibilityOf(entries, f({ from: "1916", to: "1916" }));
    // La France par sa fiche « Verdun », le flux vert par sa date ; pas l'Allemagne.
    expect(isVisible(v, "c", "FRA")).toBe(true);
    expect(isVisible(v, "flux", "vert")).toBe(true);
    expect(isVisible(v, "c", "DEU")).toBe(false);
    expect(isVisible(v, "l", "l1")).toBe(false);
    expect(isVisible(null, "l", "l1")).toBe(true);
    expect(visibilityOf(entries, EMPTY_FILTER)).toBeNull();
  });

  it("sélecteur mémoïsé : même résultat tant que la carte et le filtre ne changent pas", () => {
    const select = visibilitySelector();
    const filter = f({ kinds: ["p"] });
    const first = select(doc, filter);
    expect(select(doc, filter)).toBe(first);
    expect(isVisible(first, "p", "p1")).toBe(true);
    const next = select(ops.updateFiche(doc, "p", "p1", { title: "Autre" }), filter);
    expect(next).not.toBe(first);
    expect(select(doc, EMPTY_FILTER)).toBeNull();
    // Filtre réduit à une catégorie supprimée : plus de critère, tout est visible.
    expect(select(doc, f({ categories: ["disparue"] }))).toBeNull();
  });
});

describe("choix et textes du panneau", () => {
  it("couleurs portées par les fiches, dans l'ordre de la palette, « Sans couleur » en dernier", () => {
    expect(colorOptions(entries, EMPTY_FILTER)).toEqual([
      { value: "jaune", count: 2 },
      { value: "rouge", count: 2 },
      { value: "vert", count: 1 },
      { value: "bleu", count: 1 },
      { value: "#123abc", count: 1 },
      { value: null, count: 5 },
    ]);
    // Une couleur cochée sans fiche reste proposée.
    expect(colorOptions([], f({ colors: ["sable"] }))).toEqual([{ value: "sable", count: 0 }]);
  });

  it("catégories de la carte, puis « Sans catégorie »", () => {
    expect(categoryOptions(entries, doc.categories)).toEqual([
      { value: "conflits", count: 2 },
      { value: "diplo", count: 2 },
      { value: null, count: 8 },
    ]);
  });

  it("résumé des critères", () => {
    expect(filterSummary(EMPTY_FILTER, doc.categories)).toEqual([]);
    expect(
      filterSummary(f({ from: "1914", to: "1918", colors: ["rouge", "#123abc", null], categories: ["diplo", null], kinds: ["c", "flux"] }), doc.categories),
    ).toEqual([
      "Période : 1914 – 1918",
      "Couleurs : Rouge, #123abc, Sans couleur",
      "Catégories : Diplomatie, Sans catégorie",
      "Types : Pays, Flux",
    ]);
    expect(periodLabel(f({ from: "1914" }))).toBe("depuis 1914");
    expect(periodLabel(f({ to: "1918" }))).toBe("jusqu’à 1918");
    expect(periodLabel(f({ from: "hier" }))).toBe("");
    expect(colorLabel(null)).toBe("Sans couleur");
    expect(categoryLabel("disparue", doc.categories)).toBe("Catégorie supprimée");
    expect(matchCountLabel(3, 12)).toBe("3 fiches sur 12");
    expect(matchCountLabel(1, 12)).toBe("1 fiche sur 12");
    expect(matchCountLabel(0, 12)).toBe("Aucune fiche ne correspond");
    expect(matchCountLabel(0, 0)).toBe("Aucune fiche sur cette carte");
  });
});
