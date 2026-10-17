import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { blankDoc } from "@/features/map-doc/schema";
import Panel from "./components/Panel";
import { collapsesOnEscape, editorShortcut, expandedShortcut, ficheKey, panelFocusTarget, panelUpdate } from "./panelFocus";
import { isExpanded, useEditorStore } from "./store";
import type { EditorState } from "./store";

// Le rendu serveur lit l'état initial du store : on le remplace le temps d'un test.
const initial = useEditorStore.getInitialState();
const saved: Partial<EditorState> = {
  doc: initial.doc,
  selection: initial.selection,
  panelExpanded: initial.panelExpanded,
  saveStatus: initial.saveStatus,
};
afterEach(() => Object.assign(initial, saved));

describe("panneau des fiches : focus", () => {
  it("une clé par fiche affichée (principale ou supplémentaire)", () => {
    expect(ficheKey({ k: "c", id: "FRA" })).toBe("c:FRA:");
    expect(ficheKey({ k: "c", id: "FRA", fiche: "f1" })).toBe("c:FRA:f1");
  });

  it("retour à la fiche principale : le bouton de la fiche quittée ; sinon le titre de la fiche", () => {
    expect(panelFocusTarget({ k: "c", id: "FRA", fiche: "f1" }, { k: "c", id: "FRA" })).toEqual({ ficheButton: "f1" });
    // Nouvelle fiche, fiche de la liste, autre élément, première ouverture : le titre.
    expect(panelFocusTarget({ k: "c", id: "FRA" }, { k: "c", id: "FRA", fiche: "f2" })).toBe("heading");
    expect(panelFocusTarget({ k: "c", id: "FRA", fiche: "f1" }, { k: "c", id: "ESP" })).toBe("heading");
    expect(panelFocusTarget({ k: "l", id: "FRA", fiche: "f1" }, { k: "c", id: "FRA" })).toBe("heading");
    expect(panelFocusTarget(null, { k: "c", id: "FRA" })).toBe("heading");
  });

  it("élément recliqué (nouvel objet, même fiche) : ni retour en haut ni focus", () => {
    const shown = { k: "c" as const, id: "FRA" };
    expect(panelUpdate({ k: "c", id: "FRA" }, true, shown)).toEqual({ remember: shown, focus: null });
    const extra = { k: "c" as const, id: "FRA", fiche: "f1" };
    expect(panelUpdate({ k: "c", id: "FRA", fiche: "f1" }, true, extra)).toEqual({ remember: extra, focus: null });
  });

  it("autre fiche affichée : retour en haut, focus selon panelFocusTarget", () => {
    const main = { k: "c" as const, id: "FRA" };
    expect(panelUpdate({ k: "c", id: "FRA", fiche: "f1" }, true, main)).toEqual({ remember: main, focus: { ficheButton: "f1" } });
    expect(panelUpdate(null, true, main)).toEqual({ remember: main, focus: "heading" });
  });

  it("panneau fermé puis rouvert : la fiche quittée est oubliée, le focus va au titre", () => {
    const extra = { k: "c" as const, id: "FRA", fiche: "f1" };
    // Fermeture (Échap) : la fiche reste affichée pendant l'animation, mais n'est plus mémorisée.
    const closed = panelUpdate(extra, false, extra);
    expect(closed).toEqual({ remember: null, focus: null });
    // Clic sur la France : sa fiche principale s'ouvre en haut, focus sur le titre (pas le bouton de f1).
    const main = { k: "c" as const, id: "FRA" };
    expect(panelUpdate(closed.remember, true, main)).toEqual({ remember: main, focus: "heading" });
    // Même fiche rouverte : elle repart aussi du haut.
    expect(panelUpdate(null, true, extra).focus).toBe("heading");
  });
});

describe("panneau des fiches : plein écran", () => {
  it("Échap dans le panneau ne quitte que le plein écran, une seule fois", () => {
    expect(collapsesOnEscape({ key: "Escape", defaultPrevented: false }, true)).toBe(true);
    // Hors plein écran : Échap remonte au raccourci global (fermer la fiche).
    expect(collapsesOnEscape({ key: "Escape", defaultPrevented: false }, false)).toBe(false);
    // Déjà traité (un menu, un dialogue) : rien.
    expect(collapsesOnEscape({ key: "Escape", defaultPrevented: true }, true)).toBe(false);
    expect(collapsesOnEscape({ key: "a", defaultPrevented: false }, true)).toBe(false);
  });

  it("raccourcis globaux : outils inactifs en plein écran, Échap conservé", () => {
    expect(expandedShortcut({ type: "tool", tool: "link" }, true)).toBeNull();
    expect(expandedShortcut({ type: "tool", tool: "link" }, false)).toEqual({ type: "tool", tool: "link" });
    expect(expandedShortcut({ type: "cancel" }, true)).toEqual({ type: "cancel" });
    expect(expandedShortcut(null, true)).toBeNull();
  });

  it("vue frise : raccourcis d'outils inactifs, Échap actif", () => {
    const gomme = { type: "tool", tool: "gomme" } as const;
    expect(editorShortcut(gomme, { expanded: false, frise: true })).toBeNull();
    expect(editorShortcut(gomme, { expanded: true, frise: false })).toBeNull();
    expect(editorShortcut(gomme, { expanded: false, frise: false })).toEqual(gomme);
    expect(editorShortcut({ type: "cancel" }, { expanded: false, frise: true })).toEqual({ type: "cancel" });
  });

  it("plein écran seulement avec une fiche ouverte", () => {
    const state = useEditorStore.getState();
    expect(isExpanded({ ...state, selection: null, panelExpanded: true })).toBe(false);
    expect(isExpanded({ ...state, selection: { k: "c", id: "FRA" }, panelExpanded: false })).toBe(false);
    expect(isExpanded({ ...state, selection: { k: "c", id: "FRA" }, panelExpanded: true })).toBe(true);
  });

  it("le panneau couvre toute la largeur et reprend le statut d'enregistrement", () => {
    Object.assign(initial, { doc: blankDoc(), selection: { k: "c", id: "FRA" }, panelExpanded: true, saveStatus: "Échec" });
    const html = renderToStaticMarkup(createElement(Panel));
    expect(html).toContain('data-expanded="true"');
    expect(html).toContain("width:100%");
    expect(html).toContain('data-focus-scope=""');
    expect(html).toMatch(/<h2 tabindex="-1" data-focus-fallback=""[^>]*>France<\/h2>/);
    expect(html).toContain('<p role="status" class="mt-0 mb-2 text-[13px] text-mute">Échec</p>');

    Object.assign(initial, { panelExpanded: false });
    const side = renderToStaticMarkup(createElement(Panel));
    expect(side).toContain('data-expanded="false"');
    expect(side).toContain("width:min(360px, 100%)");
    expect(side).not.toContain("Échec");
  });
});
