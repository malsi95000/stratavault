import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Toolbar from "./Toolbar";

describe("barre d'outils", () => {
  const html = renderToStaticMarkup(createElement(Toolbar));

  it("présente les 8 outils dans l'ordre de la bêta, avec leurs libellés", () => {
    expect(html).toContain('role="toolbar" aria-label="Outils"');
    const labels = [...html.matchAll(/aria-pressed="(?:true|false)"(?: aria-expanded="(?:true|false)")? title="[^"]*" aria-label="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(labels.filter((l) => !l.startsWith("Balise") && !l.startsWith("Ping"))).toEqual([
      "Sélection",
      "Tracer un lien",
      "Poser une balise",
      "Pinceau flux",
      "Lasso de zone",
      "Ajouter un texte",
      "Gomme",
      "Placer un point",
    ]);
    expect(html).toContain('aria-pressed="true" title="Sélection (V) : ouvrir la fiche d&#x27;un pays, d&#x27;un lien, d&#x27;une zone ou d&#x27;une balise"');
  });

  it("propose 6 types de balise, 10 couleurs de flux et les curseurs d'épaisseur et de taille", () => {
    for (const label of [
      "Balise maritime",
      "Balise entreprise",
      "Balise groupe armé",
      "Balise point stratégique",
      "Ping crise",
      "Ping base militaire",
    ]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('aria-pressed="true" title="Balise point stratégique"');
    expect(html.match(/var\(--color-flux-/g)).toHaveLength(10);
    expect(html).toContain("Couleur du flux");
    expect(html).toMatch(/Épaisseur : <output[^>]*>4<\/output>/);
    expect(html).toContain('min="1" max="16"');
    expect(html).toMatch(/Taille du texte : <output[^>]*>13<\/output>/);
    expect(html).toContain('min="6" max="40"');
  });
});
