import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWorld } from "@/features/editor/world";
import type { WorldTopology } from "@/features/editor/world";
import { COVER_SVG_PREFIX, MAX_COVER_BYTES, MAX_COVER_SVG_BYTES, coverDataUrl, isSafeCoverSvg } from "@/features/maps/cover";
import { jsonByteLength } from "@/features/maps/limits";
import { BETA_EXPORT } from "@/features/map-doc/fixtures";
import { blankDoc, parseMapDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import { PREVIEW_TOKENS } from "./colors";
import { encodePath, linePath, ringPath, roundPoints, simplify } from "./pathData";
import { buildPreviewCover, buildPreviewSvg, fitLayers, svgCost } from "./previewSvg";
import { previewWorldOf } from "./previewWorld";

const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
const topology = JSON.parse(
  readFileSync(new URL("../../../../public/data/countries-50m.json", import.meta.url), "utf8"),
) as WorldTopology;
const world = previewWorldOf(buildWorld(topology));
const beta = parseMapDoc(BETA_EXPORT) as MapDoc;

describe("couleurs de l'aperçu", () => {
  it("recopient exactement les variables de globals.css (l'image n'y a pas accès)", () => {
    for (const { token, hex } of PREVIEW_TOKENS) {
      const value = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css)?.[1];
      expect(value?.toLowerCase(), token).toBe(hex);
    }
  });
});

describe("tracés compacts", () => {
  it("simplifie une ligne presque droite à ses extrémités et garde un vrai sommet", () => {
    expect(simplify([[0, 0], [5, 0.2], [10, 0]], 0.5)).toEqual([[0, 0], [10, 0]]);
    expect(simplify([[0, 0], [5, 4], [10, 0]], 0.5)).toEqual([[0, 0], [5, 4], [10, 0]]);
  });

  it("arrondit au pixel sans doublons consécutifs", () => {
    expect(roundPoints([[0.2, 0.4], [0.4, 0.1], [1.6, 2.5]])).toEqual([[0, 0], [2, 3]]);
  });

  it("écrit des commandes relatives au plus court", () => {
    expect(encodePath([[10, 20], [12, 18], [9, 25]], true)).toBe("M10 20l2-2-3 7z");
    expect(encodePath([[1, 1]], false)).toBe("");
  });

  it("ignore un îlot trop petit et une ligne réduite à un point", () => {
    expect(ringPath([[0, 0], [0.5, 0], [0.5, 0.5]], { tolerance: 0.5, minArea: 1 })).toBe("");
    expect(linePath([[3.1, 3.1], [3.2, 2.9]], { tolerance: 0.5 })).toBe("");
  });
});

describe("assemblage dans la limite", () => {
  const layer = (name: string, n: number) => ({ open: `<g ${name}>`, close: "</g>", items: Array.from({ length: n }, (_, i) => `<i${i}/>`) });

  it("ajoute les calques par ordre d'importance et les rend dans l'ordre d'affichage", () => {
    const layers = [layer("a", 3), layer("b", 3)];
    const all = fitLayers(layers, [1, 0], 1000);
    expect(all).toBe("<g a><i0/><i1/><i2/></g><g b><i0/><i1/><i2/></g>");
    // Juste la place pour le calque « b » et un élément : « a » est sacrifié.
    const tight = fitLayers(layers, [1, 0], svgCost("<g b></g><i0/>"));
    expect(tight).toBe("<g b><i0/></g>");
  });

  it("compte la barre oblique ajoutée devant chaque guillemet en JSON", () => {
    expect(svgCost('<p d="1"/>')).toBe(12);
  });
});

describe("aperçu d'une carte", () => {
  it("dessine le monde d'une carte vierge en un SVG sûr, quelques kilo-octets", () => {
    const svg = buildPreviewSvg(blankDoc(), world);
    expect(svg.startsWith(COVER_SVG_PREFIX)).toBe(true);
    expect(isSafeCoverSvg(svg)).toBe(true);
    expect(svg.length).toBeLessThan(5000);
    expect(coverDataUrl(svg)).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it("dessine pays colorés, zones, flux, liens, points et balises, aux couleurs de la carte", () => {
    const doc: MapDoc = { ...beta, styles: { "c:FRA": { color: "rouge" }, "l:lv1abc0q7k2": { color: "#123abc" } } };
    const svg = buildPreviewSvg(doc, world);
    expect(isSafeCoverSvg(svg)).toBe(true);
    expect(svg).toContain('<path fill="#e2513a" d="M'); // France, rouge
    expect(svg).toContain('stroke="#123abc"'); // lien coloré
    expect(svg).toContain('stroke="#f2b134" d="M'); // autres liens, couleur d'accent
    expect(svg).toContain('stroke="#245a9c" stroke-width="3"'); // flux bleu foncé, épaisseur 12 bornée
    expect(svg).toContain('fill="#ff6b9c"'); // balise crise
    expect(svg.match(/<circle /g)).toHaveLength(beta.pings.length + beta.points.length);
    // Aucun texte saisi n'y entre (titres, notes).
    expect(svg).not.toContain("Route de la soie");
    expect(svg).not.toContain("Paris");
  });

  it("reste sous la limite d'un aperçu, même pour une carte très chargée", () => {
    const strokes = Array.from({ length: 400 }, (_, i) => ({
      id: `s${i}`,
      width: 4,
      points: Array.from({ length: 60 }, (_, j): [number, number] => [-170 + j * 5.5, -60 + ((i * 7 + j * 13) % 120)]),
    }));
    const styles = Object.fromEntries(
      [...world.featureByCode.keys()].map((code, i) => [`c:${code}`, { color: i % 2 ? "vert" : "#abcdef" }]),
    );
    const doc: MapDoc = { ...beta, flux: { ...beta.flux, rouge: strokes }, styles: styles as MapDoc["styles"] };
    const cover = buildPreviewCover(doc, world);
    expect(cover?.kind).toBe("preview");
    const svg = cover?.kind === "preview" ? cover.svg : "";
    expect(new TextEncoder().encode(svg).length).toBeLessThanOrEqual(MAX_COVER_SVG_BYTES);
    expect(jsonByteLength(cover)).toBeLessThanOrEqual(MAX_COVER_BYTES);
    // Les pays passent avant les flux.
    expect(svg).toContain('fill="#abcdef"');
  });

  it("donne le même aperçu pour la même carte", () => {
    expect(buildPreviewSvg(beta, world)).toBe(buildPreviewSvg(beta, world));
  });
});
