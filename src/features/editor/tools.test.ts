import { describe, expect, it } from "vitest";
import { dragMode, isInDialog, isTyping, mapCursorClass, shortcutFor, zoomAccepts } from "./tools";
import type { Tool } from "./hints";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe("raccourcis clavier", () => {
  it("associe V L P O Z T G F aux outils, en minuscule comme en majuscule", () => {
    const expected = { v: "select", l: "link", p: "ping", o: "point", z: "lasso", t: "texte", g: "gomme", f: "flux" };
    for (const [k, tool] of Object.entries(expected)) {
      expect(shortcutFor(key(k), false)).toEqual({ type: "tool", tool });
      expect(shortcutFor(key(k.toUpperCase()), false)).toEqual({ type: "tool", tool });
    }
    expect(shortcutFor(key("x"), false)).toBeNull();
  });

  it("Échap annule ; rien pendant une saisie ou avec Ctrl, Meta ou Alt", () => {
    expect(shortcutFor(key("Escape"), false)).toEqual({ type: "cancel" });
    expect(shortcutFor(key("Escape"), true)).toBeNull();
    expect(shortcutFor(key("v"), true)).toBeNull();
    expect(shortcutFor(key("v", { ctrlKey: true }), false)).toBeNull();
    expect(shortcutFor(key("l", { metaKey: true }), false)).toBeNull();
    expect(shortcutFor(key("p", { altKey: true }), false)).toBeNull();
  });

  it("isTyping ne plante pas hors du navigateur", () => {
    expect(isTyping(null)).toBe(false);
  });

  it("isInDialog ne plante pas hors du navigateur", () => {
    expect(isInDialog(null)).toBe(false);
  });
});

describe("curseurs", () => {
  it("croix pour les outils de dessin et de placement, et sur les pays pour lien, balise, point, flux", () => {
    expect(mapCursorClass("select")).toBe("");
    for (const tool of ["lasso", "texte", "gomme"] as const) {
      expect(mapCursorClass(tool)).toBe("cursor-crosshair");
    }
    for (const tool of ["link", "ping", "point", "flux"] as const) {
      expect(mapCursorClass(tool)).toBe("cursor-crosshair [&_[data-k=c]]:cursor-crosshair");
    }
  });
});

describe("vue globe", () => {
  const tools: Tool[] = ["select", "link", "ping", "point", "texte", "gomme"];

  it("le glisser fait tourner le globe, sauf pour le lasso et le pinceau qui dessinent", () => {
    for (const tool of tools) {
      expect(dragMode(tool, "globe")).toBe("rotate");
      expect(dragMode(tool, "planisphere")).toBe("pan");
    }
    for (const tool of ["lasso", "flux"] as const) {
      expect(dragMode(tool, "globe")).toBe("draw");
      expect(dragMode(tool, "planisphere")).toBe("draw");
    }
  });

  it("le zoom d3 garde la molette partout, mais ne déplace pas la vue au glisser sur le globe", () => {
    const wheel = { type: "wheel", ctrlKey: false, button: 0 };
    const down = { type: "mousedown", ctrlKey: false, button: 0 };
    const touch = { type: "touchstart", ctrlKey: false, button: 0 };
    for (const tool of [...tools, "lasso", "flux"] as Tool[]) {
      expect(zoomAccepts(wheel, tool, "globe")).toBe(true);
      expect(zoomAccepts(wheel, tool, "planisphere")).toBe(true);
      expect(zoomAccepts(down, tool, "globe")).toBe(false);
      expect(zoomAccepts(touch, tool, "globe")).toBe(false);
    }
    expect(zoomAccepts(down, "select", "planisphere")).toBe(true);
    expect(zoomAccepts(touch, "gomme", "planisphere")).toBe(true);
    expect(zoomAccepts(down, "lasso", "planisphere")).toBe(false);
    expect(zoomAccepts({ ...down, button: 2 }, "select", "planisphere")).toBe(false);
    expect(zoomAccepts({ ...down, ctrlKey: true }, "select", "planisphere")).toBe(false);
  });

  it("curseur main pour l'outil Sélection sur le globe", () => {
    expect(mapCursorClass("select", "globe")).toBe("cursor-grab active:cursor-grabbing");
    expect(mapCursorClass("select", "planisphere")).toBe("");
    expect(mapCursorClass("gomme", "globe")).toBe("cursor-crosshair");
  });
});
