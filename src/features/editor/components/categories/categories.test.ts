import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { returnFocusTarget } from "@/components/dialogs/useCloseAutoFocus";
import { MAX_CATEGORIES } from "@/features/map-doc/limits";
import * as ops from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import CategoriesDialog from "./CategoriesDialog";
import CategoryRow, { commitsLabel } from "./CategoryRow";
import { dialogFallback, focusAfterAdd, leaveFieldOnEscape } from "./dialogFocus";
import NewCategoryForm from "./NewCategoryForm";
import { removeCategoryConfirm } from "./texts";

// Le rendu serveur lit l'état initial du store : on le remplace le temps d'un test.
const initial = useEditorStore.getInitialState();
const saved = { doc: initial.doc, categoriesOpen: initial.categoriesOpen };
afterEach(() => {
  Object.assign(initial, saved);
  vi.unstubAllGlobals();
});
const withDoc = (doc: MapDoc) => Object.assign(initial, { doc });

/** Carte avec la catégorie « Défense » (rouge) portée par un pays, un lien et une fiche. */
function sample(): MapDoc {
  let doc = ops.addLink(blankDoc(), "c:FRA", "c:ESP", "l1")!.doc;
  doc = ops.addCategory(doc, "Défense", "rouge", "k1")!.doc;
  doc = ops.setElementStyle(doc, "c:FRA", { category: "k1" });
  doc = ops.setElementStyle(doc, "l:l1", { category: "k1" });
  return ops.addExtraFiche(doc, "c:FRA", { category: "k1" }, "f1")!.doc;
}

describe("une catégorie de la carte", () => {
  it("couleur (palette repliée), nom modifiable, suppression", () => {
    const doc = sample();
    withDoc(doc);
    const html = renderToStaticMarkup(createElement(CategoryRow, { category: doc.categories[0] }));
    expect(html).toContain('aria-expanded="false" aria-label="Couleur de la catégorie Défense : Rouge"');
    expect(html).toContain('aria-label="Nom de la catégorie"');
    expect(html).toContain('value="Défense"');
    expect(html).toContain('aria-label="Supprimer la catégorie Défense"');
    // La palette ne se déplie qu'à la demande.
    expect(html).not.toContain('role="radiogroup"');
  });

  it("le nom s'enregistre à Entrée sans quitter le champ, pas aux autres touches", () => {
    expect(commitsLabel("Enter")).toBe(true);
    expect(commitsLabel("a")).toBe(false);
    expect(commitsLabel("Tab")).toBe(false);
    // Échap est traité par la fenêtre (leaveFieldOnEscape), avant sa fermeture.
    expect(commitsLabel("Escape")).toBe(false);
  });

  it("Échap pendant la saisie : le champ est quitté (onBlur enregistre) avant que la fenêtre se ferme", () => {
    /** Champ minimal : le quitter enregistre le nom saisi, comme le onBlur de CategoryRow. */
    class FakeField {
      constructor(private onBlur: () => void) {}
      blur() {
        this.onBlur();
      }
    }
    vi.stubGlobal("HTMLElement", FakeField);
    const store = useEditorStore;
    store.setState({ doc: sample(), categoriesOpen: true });
    const field = new FakeField(() => store.getState().updateCategory("k1", { label: "Armées" }));
    // Ordre de Radix : onEscapeKeyDown (leaveFieldOnEscape), puis la fermeture, qui démonte la fenêtre
    // tout de suite quand les animations sont réduites : le champ ne reçoit plus la touche.
    leaveFieldOnEscape(field as unknown as Element);
    store.getState().setCategoriesOpen(false);
    expect(store.getState().doc.categories[0].label).toBe("Armées");
    // Rien de focalisé (ou pas un élément HTML) : sans effet.
    expect(() => leaveFieldOnEscape(null)).not.toThrow();
    store.setState({ doc: saved.doc, categoriesOpen: false });
  });

  it("la confirmation de suppression compte les éléments et fiches qui la portent", () => {
    const doc = sample();
    expect(removeCategoryConfirm(doc, doc.categories[0])).toBe(
      "Supprimer la catégorie « Défense » ? Les 3 éléments ou fiches qui la portent n’auront plus de catégorie.",
    );
    const unused = ops.addCategory(doc, "Énergie", "vert", "k2")!.doc;
    expect(removeCategoryConfirm(unused, unused.categories[1])).toBe("Supprimer la catégorie « Énergie » ?");
  });
});

describe("nouvelle catégorie", () => {
  it("propose la première couleur libre ; un nom vide ne peut pas être ajouté", () => {
    withDoc(sample());
    const html = renderToStaticMarkup(createElement(NewCategoryForm));
    expect(html).toContain("Nouvelle catégorie");
    // « Rouge » est prise par « Défense » : la couleur proposée est la suivante libre de la palette.
    const suggested = ops.nextCategoryColor(sample());
    expect(suggested).not.toBe("rouge");
    expect(html).toMatch(new RegExp(`aria-checked="true" tabindex="0"[^>]*style="background:var\\(--color-flux-${suggested}\\)"`));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  it("plafond atteint : plus de formulaire, un message", () => {
    let doc = blankDoc();
    for (let i = 0; i < MAX_CATEGORIES; i++) doc = ops.addCategory(doc, `C${i}`, "rouge", `k${i}`)!.doc;
    withDoc(doc);
    const html = renderToStaticMarkup(createElement(NewCategoryForm));
    expect(html).not.toContain("<form");
    expect(html).toContain(`Nombre maximal de catégories atteint (${MAX_CATEGORIES}).`);
  });
});

describe("fenêtre des catégories", () => {
  it("fermée : rien n'est affiché", () => {
    withDoc(sample());
    expect(renderToStaticMarkup(createElement(CategoriesDialog))).toBe("");
  });

  it("après un ajout, le focus va au champ du nom ; au plafond (formulaire retiré), au titre", () => {
    expect(focusAfterAdd(1)).toBe("name");
    expect(focusAfterAdd(MAX_CATEGORIES - 1)).toBe("name");
    expect(focusAfterAdd(MAX_CATEGORIES)).toBe("fallback");
  });

  it("une ligne supprimée emporte le bouton qui avait le focus : le titre de la fenêtre le reprend", () => {
    /** Élément minimal : branché ou non sur la page, dans une zone `data-focus-scope` éventuelle. */
    class FakeElement {
      constructor(
        public isConnected: boolean,
        private scope: FakeElement | null = null,
        private fallback: FakeElement | null = null,
      ) {}
      closest() {
        return this.scope;
      }
      querySelector() {
        return this.fallback;
      }
    }
    vi.stubGlobal("HTMLElement", FakeElement);
    const title = new FakeElement(true);
    const content = new FakeElement(true, null, title);
    // Le bouton « Ajouter » ou le formulaire, dans le contenu de la fenêtre : son titre.
    expect(dialogFallback(new FakeElement(true, content) as never)).toBe(title);
    expect(dialogFallback(null)).toBeNull();
    // Suppression confirmée : le bouton « Supprimer la catégorie » a disparu avec sa ligne.
    const removed = new FakeElement(false, content);
    expect(returnFocusTarget({ trigger: removed, scope: content } as never)).toBe(title);
    // Le contenu de la fenêtre est une zone de repli, et son titre l'élément de repli (le contenu est
    // rendu dans un portail, absent du rendu serveur : on lit le composant).
    const source = readFileSync(new URL("./CategoriesDialog.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/<DialogContent\s+data-focus-scope=""/);
    expect(source).toContain('<DialogTitle tabIndex={-1} data-focus-fallback=""');
  });
});
