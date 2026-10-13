import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import * as ops from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import type { EntityKind, MapDoc } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import type { EditorState } from "@/features/editor/store";
import { Fiche } from "../Panel";
import { DELETE_CONFIRM } from "./texts";

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
  });
});
