import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import * as ops from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import type { EntityKind, MapDoc } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import type { EditorState } from "@/features/editor/store";
import { Fiche } from "../Panel";
import { FLUX_COLOR_IDS } from "@/features/map-doc/palette";
import { extraFicheTitle, frenchDate } from "./format";
import { DELETE_CONFIRM, DELETE_EXTRA_FICHE_CONFIRM, deleteConfirm, gommeConfirm } from "./texts";
import { deleteCategoryConfirm } from "../categories/texts";

// Le rendu serveur lit l'état initial du store (getServerSnapshot de zustand) : on le remplace le temps d'un test.
const initial = useEditorStore.getInitialState();
const saved: Partial<EditorState> = { doc: initial.doc, selection: initial.selection, pending: initial.pending };
afterEach(() => Object.assign(initial, saved));
const render = (doc: MapDoc, k: EntityKind, id: string) => {
  Object.assign(initial, { doc });
  return renderToStaticMarkup(createElement(Fiche, { selection: { k, id } }));
};

function sample() {
  let doc = blankDoc();
  doc = ops.addPing(doc, [32.5, 29.9], "maritime", "p1")!.doc;
  doc = ops.addPoint(doc, [2.3522, 48.8566], "o1")!.doc;
  doc = ops.addZone(doc, [[20, 42], [20, 44], [22, 44], [22, 42]], "z1")!.doc;
  doc = ops.addText(doc, [10, 45], 13, "t1")!.doc;
  doc = ops.addFluxStroke(doc, "bleu-fonce", [[0, 0], [5, 5]], 4, "f1")!.doc;
  doc = ops.addLink(doc, "c:FRA", "p:p1", "l1")!.doc;
  doc = ops.addLink(doc, "o:o1", "z:z1", "l2")!.doc;
  doc = ops.addLink(doc, "t:t1", "c:DEU", "l3")!.doc;
  return doc;
}

describe("fiches du panneau (textes de la bêta)", () => {
  it("fiche relationnelle", () => {
    const html = render(ops.updateFiche(sample(), "l", "l1", { title: "Alliance" }), "l", "l1");
    expect(html).toContain("France – Balise maritime");
    expect(html).toContain("Fiche relationnelle");
    expect(html).toContain("Nature de la relation");
    expect(html).toContain('placeholder="Alliance, tension, accord commercial…"');
    expect(html).toContain('placeholder="Contexte, dates, enjeux…"');
    expect(html).toContain('type="date"');
    expect(html).toContain("Ouvrir la fiche de");
    expect(html).toContain("Supprimer ce lien");
    expect(html).toContain('value="Alliance"');
  });

  it("fiche point", () => {
    const html = render(sample(), "o", "o1");
    expect(html).toContain("Fiche point");
    expect(html).toContain("48.86° N, 2.35° E");
    expect(html).toContain('placeholder="Ville, lieu ou repère…"');
    expect(html).toContain('placeholder="Informations sur ce point…"');
    expect(html).toContain("Relations tracées");
    expect(html).toContain("Zone");
    expect(html).toContain("Supprimer ce point");
  });

  it("fiche de zone", () => {
    const html = render(sample(), "z", "z1");
    expect(html).toContain("Fiche de zone");
    expect(html).toContain('placeholder="Zone d’influence, couloir maritime…"');
    expect(html).toContain('placeholder="Informations sur cette zone…"');
    expect(html).toContain("Supprimer cette zone");
  });

  it("fiche texte", () => {
    const html = render(sample(), "t", "t1");
    expect(html).toContain(">Texte</h2>");
    expect(html).toContain("Petit titre sur la carte");
    expect(html).toContain("Titre affiché");
    expect(html).toContain('maxLength="60"');
    expect(html).toContain('placeholder="Route de la soie, Ligne Maginot…"');
    expect(html).toContain('placeholder="Informations complémentaires…"');
    expect(html).toContain("Allemagne");
    expect(html).toContain("Supprimer ce texte");
  });

  it("fiche de flux partagée par couleur", () => {
    let html = render(sample(), "flux", "f1");
    expect(html).toContain("Flux bleu foncé");
    expect(html).toContain("Fiche technique partagée par couleur");
    expect(html).toContain('placeholder="Informations, analyse, légende…"');
    expect(html).not.toContain("Supprimer");
    html = render(ops.updateFluxFiche(sample(), "bleu-fonce", { title: "Gazoducs" }), "flux", "f1");
    expect(html).toContain(">Gazoducs</h2>");
  });

  it("fiche balise", () => {
    const html = render(sample(), "p", "p1");
    expect(html).toContain("Fiche balise");
    expect(html).toContain("Catégorie");
    expect(html).toContain("Position");
    expect(html).toContain("29.90° N, 32.50° E");
    expect(html).toContain('<option value="maritime" selected="">Balise maritime</option>');
    expect(html).toContain('placeholder="Détroit, base navale, incident…"');
    expect(html).toContain("France");
    expect(html).toContain("Supprimer cette balise");
  });

  it("fiche d'un élément disparu : rien n'est affiché", () => {
    expect(render(blankDoc(), "p", "absent")).toBe("");
  });

  it("messages de confirmation de suppression", () => {
    expect(DELETE_CONFIRM).toEqual({
      o: "Supprimer ce point, ses notes et les liens qui s’y rattachent ?",
      l: "Supprimer ce lien et ses notes ?",
      z: "Supprimer cette zone, ses notes et les liens qui s’y rattachent ?",
      p: "Supprimer cette balise, ses notes et les liens qui s’y rattachent ?",
      t: "Supprimer ce texte, ses notes et les liens qui s’y rattachent ?",
    });
    // Les fiches supplémentaires emportées (élément et liens rattachés) sont annoncées.
    expect(deleteConfirm("l", 0)).toBe(DELETE_CONFIRM.l);
    expect(deleteConfirm("l", 1)).toBe("Supprimer ce lien et ses notes ? 1 fiche supplémentaire sera aussi supprimée.");
    expect(deleteConfirm("p", 10)).toBe(`${DELETE_CONFIRM.p} 10 fiches supplémentaires seront aussi supprimées.`);
  });

  it("gomme : confirmation seulement si des fiches supplémentaires seraient emportées", () => {
    let doc = ops.addLink(sample(), "p:p1", "c:FRA", "l1")!.doc;
    expect(gommeConfirm(doc, "p", "p1")).toBeNull();
    // Fiche d'un lien rattaché : emportée avec la balise.
    doc = ops.addExtraFiche(doc, "l:l1", {}, "x1")!.doc;
    expect(gommeConfirm(doc, "p", "p1")).toBe(deleteConfirm("p", 1));
    expect(gommeConfirm(doc, "l", "l1")).toBe(deleteConfirm("l", 1));
    expect(gommeConfirm(doc, "o", "o1")).toBeNull();
    // Ni les pays ni les flux ne portent de fiches supplémentaires.
    expect(gommeConfirm(doc, "c", "FRA")).toBeNull();
    expect(gommeConfirm(doc, "flux", "f1")).toBeNull();
  });
});

describe("fiches supplémentaires, couleur et catégorie (bêta 2.1)", () => {
  function withExtras() {
    let doc = ops.addCategory(sample(), "Défense", "rouge", "k1")!.doc;
    doc = ops.addExtraFiche(doc, "c:FRA", { title: "Dissuasion", date: "2024-03-05", category: "k1" }, "f1")!.doc;
    doc = ops.addExtraFiche(doc, "c:FRA", {}, "f2")!.doc;
    doc = ops.addExtraFiche(doc, "l:l1", { title: "Traité", color: "#abcdef" }, "f3")!.doc;
    return ops.setElementStyle(doc, "l:l1", { color: "cyan", category: "k1" });
  }
  const renderSelection = (doc: MapDoc, selection: { k: EntityKind; id: string; fiche?: string }) => {
    Object.assign(initial, { doc });
    return renderToStaticMarkup(createElement(Fiche, { selection }));
  };

  it("fiche pays : liste des fiches, « Nouvelle fiche », couleur et catégorie, plein écran", () => {
    const html = render(withExtras(), "c", "FRA");
    expect(html).toContain(">Fiches</h3>");
    expect(html).toContain("Dissuasion");
    expect(html).toContain("Fiche sans titre");
    expect(html).toContain("5 mars 2024 · Défense");
    expect(html).toContain("Nouvelle fiche");
    expect(html).toContain("Sur la carte");
    expect(html).toContain('<option value="k1">Défense</option>');
    expect(html).toContain("Gérer les catégories…");
    expect(html.match(/var\(--color-flux-/g)?.length).toBeGreaterThanOrEqual(FLUX_COLOR_IDS.length);
    expect(html).toContain('type="color"');
    expect(html).toContain('aria-label="Plein écran"');
    expect(html).toContain("Par défaut");
  });

  it("fiche de lien : couleur propre choisie, catégorie sélectionnée, ses fiches", () => {
    const html = render(withExtras(), "l", "l1");
    expect(html).toContain('<option value="k1" selected="">Défense</option>');
    expect(html).toMatch(/Couleur : <span class="text-ink">Cyan<\/span>/);
    // Groupe radio : seule la couleur choisie est dans l'ordre de tabulation.
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio" title="Cyan" aria-label="Cyan" aria-checked="true" tabindex="0"');
    expect(html.match(/tabindex="0"[^>]*style="background:var\(--color-flux/g)).toHaveLength(1);
    expect(html).toContain("Traité");
    expect(html).toContain("Supprimer ce lien");
  });

  it("fiche supplémentaire ouverte : champs, retour, suppression ; fiche d'un autre élément ignorée", () => {
    const html = renderSelection(withExtras(), { k: "c", id: "FRA", fiche: "f1" });
    expect(html).toContain(">Dissuasion</h2>");
    expect(html).toContain("Fiche de France");
    expect(html).toContain("Fiche principale");
    expect(html).toContain('value="2024-03-05"');
    expect(html).toContain('<option value="k1" selected="">Défense</option>');
    expect(html).toContain("Celle de la catégorie");
    expect(html).toContain("Supprimer cette fiche");
    expect(html).not.toContain("Relations tracées");
    const link = renderSelection(withExtras(), { k: "l", id: "l1", fiche: "f3" });
    expect(link).toContain("Fiche de France – Balise maritime");
    expect(link).toContain("Autre couleur (#abcdef)");
    expect(renderSelection(withExtras(), { k: "l", id: "l1", fiche: "f1" })).toBe("");
  });

  it("balises, points, zones et textes ont aussi leurs fiches ; pas les flux", () => {
    for (const [k, id] of [["p", "p1"], ["o", "o1"], ["z", "z1"], ["t", "t1"]] as const) {
      expect(render(sample(), k, id), k).toContain("Nouvelle fiche");
      expect(render(sample(), k, id), k).not.toContain("Sur la carte");
    }
    expect(render(sample(), "flux", "f1")).not.toContain("Nouvelle fiche");
  });

  it("textes : titre par défaut, dates en français, confirmations", () => {
    expect(extraFicheTitle({ title: "  " })).toBe("Fiche sans titre");
    expect(frenchDate("2026-10-03")).toBe("3 oct. 2026");
    expect(frenchDate("")).toBe("");
    expect(frenchDate("vers 1850")).toBe("vers 1850");
    expect(DELETE_EXTRA_FICHE_CONFIRM).toBe("Supprimer cette fiche, son titre et ses notes ?");
    expect(deleteCategoryConfirm("Défense", 0)).toBe("Supprimer la catégorie «\u00a0Défense\u00a0» ?");
    expect(deleteCategoryConfirm("Défense", 1)).toContain("L’élément ou la fiche qui la porte n’aura plus de catégorie.");
    expect(deleteCategoryConfirm("Défense", 3)).toContain("Les 3 éléments ou fiches qui la portent");
  });
});
