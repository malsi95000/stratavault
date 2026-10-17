import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HistoriquePage from "@/app/historique/page";
import { BACKDROP_VARIANTS, type BackdropVariant } from "@/features/backdrops/types";
import { backdropLayers } from "@/features/backdrops/variants";
import { ROOT, sourceFiles } from "@/test/sourceFiles";
import PageBackdrop from "./PageBackdrop";

const render = (variant: BackdropVariant) => renderToStaticMarkup(createElement(PageBackdrop, { variant }));

describe("fond de page thématique", () => {
  it("est décoratif : caché aux lecteurs d'écran, sans texte, sans interaction", () => {
    for (const variant of BACKDROP_VARIANTS) {
      const html = render(variant);
      expect(html).toMatch(/^<div aria-hidden="true" data-backdrop="[a-z]+"/);
      expect(html).toContain("pointer-events-none");
      expect(html).toContain('focusable="false"');
      expect(html).not.toMatch(/<(text|a|script|foreignObject|image)\b/);
      expect(html.match(/<path /g)).toHaveLength(backdropLayers(variant).length);
    }
  });

  it("reste derrière le contenu et couvre l'écran, trait fin quel que soit l'agrandissement", () => {
    const html = render("contours");
    expect(html).toContain("fixed inset-0 -z-10");
    expect(html).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(html).toContain('vector-effect="non-scaling-stroke"');
    // Pas répété sur chaque feuille imprimée.
    expect(html).toMatch(/class="[^"]*\bprint:hidden\b/);
    // Le body isole son empilement : sans cela, son fond passerait devant le motif (-z-10).
    const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/<body className="isolate /);
  });

  it("dessine les traits avec les jetons de couleur de globals.css", () => {
    const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
    for (const tone of ["line", "strong", "accent"]) expect(css).toMatch(new RegExp(`--color-backdrop-${tone}: #`));
    const html = BACKDROP_VARIANTS.map(render).join("");
    expect(html).not.toMatch(/stroke="#/);
    expect(html).toContain("stroke-backdrop-strong");
  });

  it("habille l'historique de ses strates", () => {
    const html = renderToStaticMarkup(createElement(HistoriquePage));
    expect(html).toContain('data-backdrop="strata"');
  });

  it("donne un fond différent à chaque famille de pages annexes, et aucun à l'éditeur", () => {
    const files = new Map(sourceFiles().map((file) => [file.path, file.text]));
    const expected: Record<string, BackdropVariant> = {
      "src/app/historique/page.tsx": "strata",
      "src/app/espace/page.tsx": "graticule",
      "src/app/compte/page.tsx": "relief",
      "src/components/legal/LegalDocument.tsx": "coastlines",
    };
    for (const [path, variant] of Object.entries(expected)) {
      expect(files.get(path), path).toContain(`<PageBackdrop variant="${variant}" />`);
    }
    // Connexion, inscription, mots de passe, confirmation : AuthCard, courbes de niveau par défaut.
    expect(files.get("src/components/auth/AuthCard.tsx")).toContain('backdrop = "contours"');
    expect(files.get("src/components/auth/AuthCard.tsx")).toContain("<PageBackdrop variant={backdrop} />");
    expect(new Set([...Object.values(expected), "contours"]).size).toBe(5);
    expect(files.get("src/app/carte/page.tsx")).not.toContain("PageBackdrop");
    expect(files.get("src/app/page.tsx")).not.toContain("PageBackdrop");
  });

  it("n'est jamais chargé dans le navigateur (calcul côté serveur)", () => {
    const clients = sourceFiles().filter((file) => /^["']use client["']/.test(file.text));
    for (const file of clients) {
      expect(file.text, file.path).not.toMatch(/features\/backdrops|backdrop\/PageBackdrop/);
    }
    expect(readFileSync(join(ROOT, "src/components/backdrop/PageBackdrop.tsx"), "utf8")).toMatch(/^import "server-only";/);
  });
});
