import { describe, expect, it } from "vitest";
import { HINTS, HINT_SELECT_GLOBE, toolHint } from "./hints";

describe("texte d'aide selon la vue", () => {
  it("vue globe : l'outil Sélection explique la rotation", () => {
    expect(toolHint("select", true)).toBe(HINT_SELECT_GLOBE);
    expect(HINT_SELECT_GLOBE).toMatch(/Molette : zoom, glisser : faire tourner le globe\.$/);
  });

  it("planisphère, et autres outils sur le globe : textes de la bêta", () => {
    expect(toolHint("select", false)).toBe(HINTS.select);
    for (const tool of ["link", "ping", "point", "lasso", "texte", "gomme", "flux"] as const) {
      expect(toolHint(tool, true)).toBe(HINTS[tool]);
    }
  });
});
