import { describe, expect, it } from "vitest";
import { MAX_CATEGORIES, MAX_FICHES_PER_ELEMENT } from "@/features/map-doc/limits";
import * as ops from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import { HINT_CATEGORIES_FULL, HINT_FICHES_FULL } from "./hints";
import { createEditorStore } from "./store";
import { selectedElement } from "./storeFiches";

/** Store avec un lien France–Espagne (l1) et un flux (f1). */
function storeWithLink() {
  const store = createEditorStore();
  let doc = ops.addLink(blankDoc(), "c:FRA", "c:ESP", "l1")!.doc;
  doc = ops.addFluxStroke(doc, "rouge", [[0, 0], [5, 5]], 4, "f1")!.doc;
  store.getState().hydrate(doc, null);
  return store;
}

describe("store : fiches supplémentaires", () => {
  it("élément du panneau : pays, lien, balise… mais pas un flux", () => {
    expect(selectedElement(null)).toBeNull();
    expect(selectedElement({ k: "c", id: "FRA" })).toBe("c:FRA");
    expect(selectedElement({ k: "l", id: "l1", fiche: "x" })).toBe("l:l1");
    expect(selectedElement({ k: "flux", id: "f1" })).toBeNull();
  });

  it("« Nouvelle fiche » ajoute une fiche à l'élément ouvert et l'ouvre ; retour à la fiche principale", () => {
    const store = storeWithLink();
    // Rien sans élément ouvert, ni pour un autre élément que celui du panneau.
    store.getState().addExtraFiche("c:FRA");
    expect(store.getState().doc.fiches).toEqual({});
    store.getState().open("l", "l1");
    store.getState().addExtraFiche("c:FRA");
    expect(store.getState().doc.fiches).toEqual({});

    store.getState().addExtraFiche("l:l1");
    const [fiche] = store.getState().doc.fiches["l:l1"]!;
    expect(store.getState().selection).toEqual({ k: "l", id: "l1", fiche: fiche.id });
    store.getState().updateExtraFiche(fiche.id, { title: "Traité", color: "cyan" });
    expect(store.getState().doc.fiches["l:l1"]).toEqual([{ id: fiche.id, title: "Traité", note: "", color: "cyan" }]);

    store.getState().openExtraFiche(null);
    expect(store.getState().selection).toEqual({ k: "l", id: "l1" });
    store.getState().openExtraFiche(fiche.id);
    expect(store.getState().selection?.fiche).toBe(fiche.id);
    // Ouvrir un autre élément revient à sa fiche principale.
    store.getState().open("c", "FRA");
    expect(store.getState().selection).toEqual({ k: "c", id: "FRA" });
    // Une fiche d'un autre élément ne s'ouvre pas dans ce panneau.
    store.getState().openExtraFiche(fiche.id);
    expect(store.getState().selection).toEqual({ k: "c", id: "FRA" });
  });

  it("supprimer la fiche ouverte ramène à la fiche principale ; la gomme emporte les fiches du lien", () => {
    const store = storeWithLink();
    store.getState().open("c", "FRA");
    store.getState().addExtraFiche("c:FRA");
    const id = store.getState().selection!.fiche!;
    store.getState().removeExtraFiche(id);
    expect(store.getState().doc.fiches).toEqual({});
    expect(store.getState().selection).toEqual({ k: "c", id: "FRA" });

    store.getState().open("l", "l1");
    store.getState().addExtraFiche("l:l1");
    store.getState().setElementStyle("l:l1", { color: "vert" });
    store.getState().gomme("l", "l1");
    expect(store.getState().doc.fiches).toEqual({});
    expect(store.getState().doc.styles).toEqual({});
    expect(store.getState().selection).toBeNull();
  });

  it("plafond atteint : rien n'est ajouté et l'aide l'explique", () => {
    const store = storeWithLink();
    let doc = store.getState().doc;
    for (let i = 0; i < MAX_FICHES_PER_ELEMENT; i++) doc = ops.addExtraFiche(doc, "c:FRA", {}, `f${i}`)!.doc;
    store.getState().hydrate(doc, null);
    store.getState().open("c", "FRA");
    store.getState().addExtraFiche("c:FRA");
    expect(store.getState().doc).toBe(doc);
    expect(store.getState().hint).toBe(HINT_FICHES_FULL);
  });
});

describe("store : couleurs et catégories", () => {
  it("style d'un pays, catégories créées, renommées, recolorées et supprimées", () => {
    const store = storeWithLink();
    const id = store.getState().addCategory("Défense", "rouge")!;
    expect(store.getState().doc.categories).toEqual([{ id, label: "Défense", color: "rouge" }]);
    store.getState().setElementStyle("c:FRA", { category: id, color: "#abcdef" });
    expect(store.getState().doc.styles).toEqual({ "c:FRA": { color: "#abcdef", category: id } });
    store.getState().setElementStyle("c:FRA", { color: null });
    store.getState().updateCategory(id, { label: "Armées", color: "bleu" });
    expect(store.getState().doc.categories).toEqual([{ id, label: "Armées", color: "bleu" }]);
    store.getState().removeCategory(id);
    expect(store.getState().doc.categories).toEqual([]);
    expect(store.getState().doc.styles).toEqual({});
  });

  it("plafond des catégories : null et texte d'aide", () => {
    const store = storeWithLink();
    for (let i = 0; i < MAX_CATEGORIES; i++) expect(store.getState().addCategory(`c${i}`, "vert")).not.toBeNull();
    expect(store.getState().addCategory("de trop", "vert")).toBeNull();
    expect(store.getState().hint).toBe(HINT_CATEGORIES_FULL);
  });
});

describe("store : plein écran", () => {
  it("Échap quitte d'abord le plein écran, puis ferme la fiche ; fermer quitte aussi le plein écran", () => {
    const store = storeWithLink();
    store.getState().open("c", "FRA");
    store.getState().setPanelExpanded(true);
    store.getState().cancel();
    expect(store.getState().panelExpanded).toBe(false);
    expect(store.getState().selection).toEqual({ k: "c", id: "FRA" });
    store.getState().cancel();
    expect(store.getState().selection).toBeNull();

    store.getState().open("c", "FRA");
    store.getState().setPanelExpanded(true);
    store.getState().close();
    expect(store.getState().panelExpanded).toBe(false);

    // Une autre carte (import, banque) repart du panneau normal, fenêtre des catégories fermée.
    store.getState().open("c", "FRA");
    store.getState().setPanelExpanded(true);
    store.getState().setCategoriesOpen(true);
    store.getState().replaceDoc(blankDoc());
    expect(store.getState().panelExpanded).toBe(false);
    expect(store.getState().categoriesOpen).toBe(false);
  });
});
