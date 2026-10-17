import { describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "@/features/filters/filter";
import { isVisible } from "@/features/filters/visibility";
import { blankDoc } from "@/features/map-doc/schema";
import { timelineDoc } from "@/features/timeline/fixtures";
import { createEditorStore } from "./store";
import { selectVisibility } from "./storeFilters";

function store() {
  const s = createEditorStore();
  s.getState().hydrate(timelineDoc(), null);
  return s;
}

describe("store : filtres", () => {
  it("change un critère à la fois, réinitialise, ouvre le panneau", () => {
    const s = store();
    s.getState().setFilter({ from: "1914" });
    s.getState().setFilter({ kinds: ["l"] });
    expect(s.getState().filter).toEqual({ ...EMPTY_FILTER, from: "1914", kinds: ["l"] });
    s.getState().resetFilter();
    expect(s.getState().filter).toBe(EMPTY_FILTER);
    s.getState().setFiltersOpen(true);
    expect(s.getState().filtersOpen).toBe(true);
  });

  it("le filtre repart à vide quand une autre carte est ouverte", () => {
    const s = store();
    s.getState().setFilter({ colors: ["rouge"] });
    s.getState().replaceDoc(blankDoc());
    expect(s.getState().filter).toBe(EMPTY_FILTER);
    s.getState().setFilter({ colors: ["rouge"] });
    s.getState().hydrate(timelineDoc(), null);
    expect(s.getState().filter).toBe(EMPTY_FILTER);
  });

  it("chaque carte chargée est comptée (la frise repart de son cadrage automatique)", () => {
    const s = store();
    const loads = s.getState().docLoads;
    s.getState().setFilter({ colors: ["rouge"] });
    expect(s.getState().docLoads).toBe(loads);
    s.getState().replaceDoc(blankDoc());
    s.getState().hydrate(timelineDoc(), null);
    expect(s.getState().docLoads).toBe(loads + 2);
  });

  it("visibilité des éléments : même objet tant que rien ne change", () => {
    const s = store();
    expect(selectVisibility(s.getState())).toBeNull();
    s.getState().setFilter({ kinds: ["p"] });
    const v = selectVisibility(s.getState());
    expect(selectVisibility(s.getState())).toBe(v);
    expect(isVisible(v, "p", "p1")).toBe(true);
    expect(isVisible(v, "c", "FRA")).toBe(false);
  });
});

describe("store : ouverture d'une fiche depuis la frise", () => {
  it("ouvre directement une fiche supplémentaire de l'élément, sinon sa fiche principale", () => {
    const s = store();
    s.getState().open("c", "FRA", "x1");
    expect(s.getState().selection).toEqual({ k: "c", id: "FRA", fiche: "x1" });
    // Fiche d'un autre élément, ou inconnue : fiche principale.
    s.getState().open("c", "FRA", "x3");
    expect(s.getState().selection).toEqual({ k: "c", id: "FRA" });
    s.getState().open("l", "l1", "inconnue");
    expect(s.getState().selection).toEqual({ k: "l", id: "l1" });
    s.getState().open("flux", "f2");
    expect(s.getState().selection).toEqual({ k: "flux", id: "f2" });
    // Élément disparu : rien ne change.
    s.getState().open("p", "absent", "x1");
    expect(s.getState().selection).toEqual({ k: "flux", id: "f2" });
  });
});
