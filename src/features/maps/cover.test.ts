import { describe, expect, it } from "vitest";
import {
  COVER_ICONS,
  MAX_COVER_BYTES,
  MAX_COVER_SVG_BYTES,
  coverDataUrl,
  isSafeCoverSvg,
  parseMapCover,
} from "./cover";
import { UNSAFE_SVG_BODIES, coverSvg } from "./coverFixtures";

const svg = coverSvg;

describe("logo d'une carte", () => {
  it("accepte une icône du jeu et une couleur de la palette ou #rrggbb (normalisée)", () => {
    expect(parseMapCover({ kind: "icon", icon: "anchor", color: "corail" })).toEqual({
      kind: "icon",
      icon: "anchor",
      color: "corail",
    });
    expect(parseMapCover({ kind: "icon", icon: "globe", color: "#A1B2C3", extra: 1 })).toEqual({
      kind: "icon",
      icon: "globe",
      color: "#a1b2c3",
    });
    expect(new Set(COVER_ICONS).size).toBe(COVER_ICONS.length);
    // Même forme que la base : ^[a-z0-9-]{1,32}$.
    for (const icon of COVER_ICONS) expect(icon).toMatch(/^[a-z0-9-]{1,32}$/);
  });

  it("refuse une icône inconnue, une couleur invalide ou un type inconnu", () => {
    for (const bad of [
      { kind: "icon", icon: "skull", color: "vert" },
      { kind: "icon", icon: "globe", color: "red" },
      { kind: "icon", icon: "globe" },
      { kind: "image", url: "https://exemple.fr/logo.png" },
      null,
      "globe",
    ]) {
      expect(parseMapCover(bad)).toBeNull();
    }
  });
});

describe("aperçu SVG d'une carte", () => {
  it("accepte une miniature SVG simple", () => {
    const thumb = svg('<rect width="160" height="90" fill="#0a1015"/><path d="M1 2L3 4Z" fill="#232b32"/>');
    expect(isSafeCoverSvg(thumb)).toBe(true);
    expect(parseMapCover({ kind: "preview", svg: thumb })).toEqual({ kind: "preview", svg: thumb });
  });

  it("refuse tout contenu actif ou référence externe, et un autre début ou une autre fin", () => {
    for (const body of UNSAFE_SVG_BODIES) {
      expect(isSafeCoverSvg(svg(body)), body).toBe(false);
    }
    expect(isSafeCoverSvg("<svg><rect/></svg>")).toBe(false);
    expect(isSafeCoverSvg(`${svg("")} `)).toBe(false);
    expect(isSafeCoverSvg(`<?xml version="1.0"?>${svg("")}`)).toBe(false);
  });

  it("borne la taille de l'aperçu et du logo en JSON", () => {
    const filler = (bytes: number) => svg(`<g>${"x".repeat(bytes - svg("<g></g>").length)}</g>`);
    expect(filler(MAX_COVER_SVG_BYTES)).toHaveLength(MAX_COVER_SVG_BYTES);
    expect(isSafeCoverSvg(filler(MAX_COVER_SVG_BYTES))).toBe(true);
    expect(isSafeCoverSvg(filler(MAX_COVER_SVG_BYTES + 1))).toBe(false);
    // Les guillemets échappés en JSON comptent : un SVG valide peut dépasser MAX_COVER_BYTES une fois écrit.
    const quotes = svg(`<g>${'"'.repeat(MAX_COVER_SVG_BYTES - 200)}</g>`);
    expect(isSafeCoverSvg(quotes)).toBe(true);
    expect(JSON.stringify({ kind: "preview", svg: quotes }).length).toBeGreaterThan(MAX_COVER_BYTES);
    expect(parseMapCover({ kind: "preview", svg: quotes })).toBeNull();
  });

  it("donne une adresse data: pour un <img>, jamais pour un SVG refusé", () => {
    const thumb = svg('<circle r="2"/>');
    const url = coverDataUrl(thumb);
    expect(url?.startsWith("data:image/svg+xml;charset=utf-8,%3Csvg")).toBe(true);
    expect(decodeURIComponent(url!.slice(url!.indexOf(",") + 1))).toBe(thumb);
    expect(url).not.toMatch(/[<>"'#\s]/);
    expect(coverDataUrl(svg("<script>x</script>"))).toBeNull();
  });
});
