import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { tutorialFor } from "@/features/editor/help/tutorials";
import { useEditorStore } from "@/features/editor/store";
import { useViewStore } from "@/features/editor/viewStore";
import FiltersPanel from "../filters/FiltersPanel";
import Toolbar from "../Toolbar";
import ViewSwitch from "../ViewSwitch";
import HelpButton from "./HelpButton";
import TutorialCard from "./TutorialCard";

// Rendu serveur : les stores donnent leur état initial, modifié ici puis rétabli.
const editorInitial = useEditorStore.getInitialState();
const viewInitial = useViewStore.getInitialState();
const saved = { filtersOpen: editorInitial.filtersOpen, view: viewInitial.view };
afterEach(() => {
  Object.assign(editorInitial, { filtersOpen: saved.filtersOpen });
  Object.assign(viewInitial, { view: saved.view });
});

describe("bouton « ? » de l'assistant", () => {
  it("ouvre une fenêtre d'aide (dialogue non modal), nommée d'après son sujet", () => {
    const html = renderToStaticMarkup(createElement(HelpButton, { topic: "lasso" }));
    expect(html).toContain('aria-label="Aide : Lasso de zone"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('type="button"');
  });

  it("affiche titre, résumé, étapes numérotées, raccourci et astuce", () => {
    const tutorial = tutorialFor("gomme");
    const html = renderToStaticMarkup(createElement(TutorialCard, { tutorial, titleId: "t" }));
    expect(html).toContain('<h2 id="t"');
    expect(html.match(/<li>/g)).toHaveLength(tutorial.steps.length);
    expect(html).toMatch(/Raccourci : <\/span><kbd[^>]*>G<\/kbd>/);
    expect(html).toContain("Astuce : ");
  });

  it("raccourci en toutes lettres pour la frise (plusieurs touches)", () => {
    const html = renderToStaticMarkup(createElement(TutorialCard, { tutorial: tutorialFor("frise"), titleId: "t" }));
    expect(html).not.toContain("<kbd");
    expect(html).toContain("+ et −");
  });
});

describe("emplacement des « ? »", () => {
  it("un par outil de la barre, nommé comme l'outil", () => {
    const html = renderToStaticMarkup(createElement(Toolbar));
    const labels = [...html.matchAll(/aria-label="Aide : ([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual([
      "Sélection",
      "Tracer un lien",
      "Poser une balise",
      "Pinceau flux",
      "Lasso de zone",
      "Ajouter un texte",
      "Gomme",
      "Placer un point",
    ]);
  });

  it("à côté du choix de la vue, pour la vue affichée", () => {
    for (const [view, title] of [
      ["planisphere", "Planisphère"],
      ["globe", "Globe"],
      ["frise", "Frise chronologique"],
    ] as const) {
      Object.assign(viewInitial, { view });
      expect(renderToStaticMarkup(createElement(ViewSwitch))).toContain(`aria-label="Aide : ${title}"`);
    }
  });

  it("dans l'en-tête du panneau des filtres", () => {
    Object.assign(editorInitial, { filtersOpen: true });
    expect(renderToStaticMarkup(createElement(FiltersPanel))).toContain('aria-label="Aide : Filtres"');
  });
});
