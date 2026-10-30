// Lecture seule de l'éditeur (carte partagée) : aucune modification du document, outil Sélection seul,
// chargements toujours possibles.
import { describe, expect, it } from "vitest";
import { blankDoc } from "@/features/map-doc/schema";
import { HINT_READ_ONLY } from "./hints";
import { createEditorStore } from "./store";

const docWithNote = () => ({ ...blankDoc(), notes: { FRA: "Paris" } });

describe("lecture seule", () => {
  it("par défaut, l'éditeur modifie la carte comme avant", () => {
    const store = createEditorStore();
    expect(store.getState().readOnly).toBe(false);
    store.getState().placePoint([2, 48]);
    expect(store.getState().doc.points).toHaveLength(1);
  });

  it("toute modification du document est ignorée, avec un message dans la barre d'aide", () => {
    const store = createEditorStore();
    store.getState().hydrate(docWithNote(), null);
    store.getState().setReadOnly(true);
    const before = store.getState().doc;
    const s = store.getState();
    s.placePoint([2, 48]);
    s.placePing([2, 48]);
    s.placeText([2, 48]);
    s.addZone([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    s.addFlux([
      [0, 0],
      [5, 5],
    ]);
    s.setCountryNote("FRA", "Lyon");
    s.setCountryDate("FRA", "2026-01-01");
    s.addCategory("Alliés", "rouge");
    s.setElementStyle("c:FRA", { color: "rouge" });
    s.open("c", "FRA");
    s.addExtraFiche("c:FRA");
    expect(store.getState().doc).toBe(before);
    expect(store.getState().hint).toBe(HINT_READ_ONLY);
    // Ouvrir une fiche reste possible.
    expect(store.getState().selection).toEqual({ k: "c", id: "FRA" });
  });

  it("seul l'outil Sélection reste disponible ; lien et tracé en cours annulés", () => {
    const store = createEditorStore();
    store.getState().setTool("link");
    store.getState().pick("c:FRA");
    store.getState().setReadOnly(true);
    expect(store.getState()).toMatchObject({ tool: "select", pending: null, drawing: null });
    store.getState().setTool("gomme");
    store.getState().choosePingType("crise");
    store.getState().chooseFluxColor("rouge");
    expect(store.getState().tool).toBe("select");
    store.getState().setReadOnly(false);
    store.getState().setTool("gomme");
    expect(store.getState().tool).toBe("gomme");
  });

  it("les chargements remplacent le document ; une carte relue garde la fiche ouverte si elle existe encore", () => {
    const store = createEditorStore();
    store.getState().setReadOnly(true);
    store.getState().hydrate(docWithNote(), null);
    expect(store.getState().doc.notes).toEqual({ FRA: "Paris" });
    store.getState().open("c", "FRA");
    const loads = store.getState().docLoads;
    store.getState().loadSharedDoc({ ...blankDoc(), notes: { FRA: "Lyon" } });
    expect(store.getState().doc.notes).toEqual({ FRA: "Lyon" });
    expect(store.getState().selection).toEqual({ k: "c", id: "FRA" });
    // Pas une nouvelle carte : la frise garde son cadrage.
    expect(store.getState().docLoads).toBe(loads);
    store.getState().replaceDoc(blankDoc());
    expect(store.getState().doc.notes).toEqual({});
  });

  it("une carte relue sans l'élément ouvert ferme sa fiche", () => {
    const store = createEditorStore();
    store.getState().placePoint([2, 48]);
    const point = store.getState().doc.points[0].id;
    expect(store.getState().selection).toEqual({ k: "o", id: point });
    store.getState().setPanelExpanded(true);
    store.getState().setReadOnly(true);
    store.getState().loadSharedDoc(blankDoc());
    expect(store.getState().selection).toBe(null);
    expect(store.getState().panelExpanded).toBe(false);
  });
});
