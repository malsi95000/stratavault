import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COVER_ICONS, COVER_SVG_PREFIX } from "@/features/maps/cover";
import type { MapCover } from "@/features/maps/cover";
import { FLUX_COLOR_IDS } from "@/features/map-doc/palette";
import BankCard from "../components/BankCard";
import CoverImage from "../components/cover/CoverImage";
import CoverPicker from "../components/cover/CoverPicker";
import { COVER_ICON_DEFS } from "./coverIcons";
import { coverDescription, coverOf, draftFrom, sameCover } from "./coverDraft";
import type { CoverDraft } from "./coverDraft";
import { PREVIEW_NOTE, PREVIEW_REFRESH } from "./texts";

const icon: MapCover = { kind: "icon", icon: "ship", color: "cyan" };
const preview: MapCover = { kind: "preview", svg: `${COVER_SVG_PREFIX} viewBox="0 0 2 2"><rect width="2" height="2"/></svg>` };

describe("choix du logo", () => {
  it("part du logo de la carte, sinon d'aucun logo (icône et couleur par défaut prêtes)", () => {
    expect(draftFrom(undefined)).toEqual({ mode: "none", icon: "globe", color: "jaune", preview: null });
    expect(draftFrom(icon)).toMatchObject({ mode: "icon", icon: "ship", color: "cyan" });
    expect(draftFrom(preview)).toMatchObject({ mode: "preview", preview });
  });

  it("donne le logo à enregistrer ; rien tant que l'aperçu n'est pas prêt", () => {
    const draft = draftFrom(null);
    expect(coverOf(draft)).toBeNull();
    expect(coverOf({ ...draft, mode: "icon", icon: "anchor", color: "#abcdef" })).toEqual({
      kind: "icon",
      icon: "anchor",
      color: "#abcdef",
    });
    expect(coverOf({ ...draft, mode: "preview" })).toBeUndefined();
    expect(coverOf({ ...draft, mode: "preview", preview: preview as CoverDraft["preview"] })).toBe(preview);
  });

  it("compare deux logos", () => {
    expect(sameCover(null, undefined)).toBe(true);
    expect(sameCover(icon, { ...icon })).toBe(true);
    expect(sameCover(icon, { ...icon, color: "rouge" })).toBe(false);
    expect(sameCover(icon, preview)).toBe(false);
    expect(sameCover(preview, null)).toBe(false);
  });

  it("décrit un logo", () => {
    const label = (i: keyof typeof COVER_ICON_DEFS) => COVER_ICON_DEFS[i].label;
    expect(coverDescription(null, label)).toBe("Aucun logo");
    expect(coverDescription(icon, label)).toBe("Logo : navire");
    expect(coverDescription(preview, label)).toBe("Aperçu de la carte");
  });

  it("chaque icône proposée a son dessin et son nom français", () => {
    for (const name of COVER_ICONS) expect(COVER_ICON_DEFS[name].label).not.toBe("");
    expect(new Set(COVER_ICONS.map((i) => COVER_ICON_DEFS[i].label)).size).toBe(COVER_ICONS.length);
  });
});

describe("affichage du logo", () => {
  it("aperçu : une image data: (jamais du SVG inséré dans la page)", () => {
    const html = renderToStaticMarkup(createElement(CoverImage, { cover: preview }));
    expect(html).toContain('<img src="data:image/svg+xml;charset=utf-8,%3Csvg%20');
    expect(html).not.toContain("<rect");
  });

  it("aperçu dangereux (venu d'une base corrompue) : rien n'est affiché", () => {
    const evil = { kind: "preview", svg: `${COVER_SVG_PREFIX}><script>alert(1)</script></svg>` } as MapCover;
    const html = renderToStaticMarkup(createElement(CoverImage, { cover: evil }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("script");
  });

  it("icône : dessin lucide à la couleur choisie ; sans logo : cadre vide", () => {
    expect(renderToStaticMarkup(createElement(CoverImage, { cover: icon }))).toContain("color:var(--color-flux-cyan)");
    expect(renderToStaticMarkup(createElement(CoverImage, { cover: undefined }))).toContain("border-dashed");
  });

  it("carte de la banque : logo et bouton « Logo » décrit par le nom de la carte", () => {
    const html = renderToStaticMarkup(
      createElement(BankCard, {
        item: { id: "m1", name: "Sahel", active: false, meta: "", cover: icon },
        onContinue: () => {},
        onRename: () => {},
        onDelete: () => {},
        loadDoc: async () => null,
        onCover: async () => true,
      }),
    );
    expect(html).toContain("color:var(--color-flux-cyan)");
    expect(html).toMatch(/aria-describedby="([^"]+)"[^>]*>Logo<\/button>/);
  });
});

describe("sélecteur du logo", () => {
  const render = (draft: CoverDraft) =>
    renderToStaticMarkup(createElement(CoverPicker, { value: draft, onChange: () => {}, loadDoc: async () => null }));

  it("propose aucun logo, une icône ou l'aperçu de la carte", () => {
    const html = render(draftFrom(null));
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain("Aperçu de la carte");
    expect(html).not.toContain('aria-label="Icône du logo"');
  });

  it("icône : 20 icônes en boutons radio (une seule tabulation) et les couleurs de la palette", () => {
    const html = render(draftFrom(icon));
    expect(html.match(/role="radio"/g)).toHaveLength(COVER_ICONS.length + FLUX_COLOR_IDS.length);
    expect(html).toMatch(/aria-label="Navire" aria-checked="true" tabindex="0"/);
    expect(html).toContain('aria-label="Couleur du logo"');
  });

  it("aperçu : affiché comme image, avec « Actualiser l'aperçu »", () => {
    const html = render(draftFrom(preview));
    expect(html).toContain("<img");
    expect(html).toContain(PREVIEW_REFRESH);
    expect(html).toContain(PREVIEW_NOTE.replaceAll("’", "’"));
  });
});
