import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLUX_COLORS, FLUX_COLOR_IDS, colorCss, isMapColor, parseMapColor } from "./palette";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** Valeur hexadécimale d'une variable de globals.css. */
function tokenValue(token: string): string | undefined {
  return new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css)?.[1];
}

/** Rapport de contraste WCAG entre deux couleurs « #rrggbb ». */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("palette de la carte", () => {
  it("compte au moins 20 couleurs nommées, distinctes, dont les 10 de la bêta en tête", () => {
    expect(FLUX_COLOR_IDS.length).toBeGreaterThanOrEqual(20);
    expect(FLUX_COLOR_IDS.slice(0, 10)).toEqual([
      "jaune",
      "orange",
      "violet",
      "bleu-fonce",
      "bleu-clair",
      "rouge",
      "marron",
      "gris-clair",
      "vert",
      "vert-fonce",
    ]);
    expect(new Set(FLUX_COLORS.map((c) => c.label)).size).toBe(FLUX_COLORS.length);
    for (const id of FLUX_COLOR_IDS) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("définit chaque couleur dans globals.css, distincte des autres", () => {
    const values = FLUX_COLORS.map((c) => tokenValue(c.token)?.toLowerCase());
    expect(values.every(Boolean)).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });

  it("reste lisible sur le fond sombre (contraste ≥ 3:1, sauf les deux teintes foncées de la bêta)", () => {
    const bg = tokenValue("--color-bg")!;
    const legacyDark = new Set(["bleu-fonce", "vert-fonce"]);
    for (const c of FLUX_COLORS) {
      if (legacyDark.has(c.id)) continue;
      expect(contrast(tokenValue(c.token)!, bg), c.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("lit une couleur : jeton de la palette ou #rrggbb (ramené en minuscules), rien d'autre", () => {
    expect(parseMapColor("corail")).toBe("corail");
    expect(parseMapColor("#A1B2C3")).toBe("#a1b2c3");
    for (const bad of ["rose", "red", "#abc", "#a1b2c3d4", " #a1b2c3", "url(#a)", "var(--color-bg)", ""]) {
      expect(parseMapColor(bad)).toBeNull();
    }
    expect(isMapColor("#a1b2c3")).toBe(true);
    expect(isMapColor("#A1B2C3")).toBe(false);
  });

  it("donne la valeur CSS d'une couleur", () => {
    expect(colorCss("vert")).toBe("var(--color-flux-vert)");
    expect(colorCss("#a1b2c3")).toBe("#a1b2c3");
  });
});
