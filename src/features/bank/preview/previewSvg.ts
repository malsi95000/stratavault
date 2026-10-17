// Aperçu automatique d'une carte (DIV-01) : miniature SVG du planisphère (Winkel tripel, comme
// l'éditeur) avec les pays colorés, les zones, les flux, les liens, les points et les balises.
//
// Le SVG n'est fait que de nombres, de couleurs hexadécimales validées et de balises fixes : aucun
// texte saisi par l'utilisateur n'y entre (les textes de la carte ne sont pas dessinés). Il reste
// sous la taille maximale d'un aperçu (MAX_COVER_SVG_BYTES) : les calques sont ajoutés par ordre
// d'importance tant qu'ils tiennent, puis dessinés dans l'ordre de la carte.
import { geoWinkel3 } from "d3-geo-projection";
import type { GeoPermissibleObjects, GeoProjection } from "d3";
import { MAX_COVER_SVG_BYTES, parseMapCover } from "@/features/maps/cover";
import type { MapCover } from "@/features/maps/cover";
import { linkAnchors } from "@/features/map-doc/refs";
import type { CountryAnchor } from "@/features/map-doc/refs";
import { colorsOf } from "@/features/map-doc/styles";
import { FLUX_COLOR_IDS } from "@/features/map-doc/palette";
import type { MapDoc } from "@/features/map-doc/types";
import { PREVIEW_BASE, PREVIEW_FLUX, PREVIEW_PING, previewHex } from "./colors";
import { linePath, ringPath } from "./pathData";
import { projectShapes } from "./project";

/** Taille de la vignette (unités du viewBox, proportions du planisphère). */
export const PREVIEW_WIDTH = 180;
export const PREVIEW_HEIGHT = 112;

/** Fond de carte nécessaire à l'aperçu (voir previewWorld.ts). */
export type PreviewWorld = {
  /** Terres émergées : toutes les géométries des pays, fusionnées. */
  land: GeoPermissibleObjects;
  /** Géométrie de chaque pays, par code. */
  featureByCode: ReadonlyMap<string, GeoPermissibleObjects>;
  /** Point d'ancrage d'un pays (extrémités des liens). */
  countryAnchor: CountryAnchor;
};

const OPEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}">`;
const CLOSE = "</svg>";

const LAND = { tolerance: 0.7, minArea: 1.5 };
const SHAPE = { tolerance: 0.5, minArea: 0.5 };
const LINE = { tolerance: 0.5 };

function makePreviewProjection(): GeoProjection {
  return geoWinkel3().fitExtent(
    [
      [1, 1],
      [PREVIEW_WIDTH - 1, PREVIEW_HEIGHT - 1],
    ],
    { type: "Sphere" },
  );
}

/** Tracé d'une surface (toutes ses parties) ; chaîne vide si rien n'est visible. */
function surfacePath(projection: GeoProjection, object: GeoPermissibleObjects, options = SHAPE): string {
  return projectShapes(projection, object)
    .rings.map((ring) => ringPath(ring, options))
    .join("");
}

/** Tracé d'une ligne (le long des grands cercles, coupée à l'antiméridien). */
function lineShapePath(projection: GeoProjection, object: GeoPermissibleObjects): string {
  return projectShapes(projection, object)
    .lines.map((line) => linePath(line, LINE))
    .join("");
}

/** Fond commun à toutes les cartes (calculé une fois par fond de carte) : fond, sphère, terres. */
const baseCache = new WeakMap<object, string>();
function baseLayer(world: PreviewWorld, projection: GeoProjection): string {
  const cached = baseCache.get(world.land);
  if (cached !== undefined) return cached;
  const sphere = surfacePath(projection, { type: "Sphere" }, { tolerance: 0.3, minArea: 0 });
  const land = surfacePath(projection, world.land, LAND);
  const base =
    `<rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${PREVIEW_BASE["--color-bg"]}"/>` +
    `<path d="${sphere}" fill="${PREVIEW_BASE["--color-map-ocean"]}" stroke="${PREVIEW_BASE["--color-map-edge"]}" stroke-width=".6"/>` +
    `<path d="${land}" fill="${PREVIEW_BASE["--color-map-country"]}"/>`;
  baseCache.set(world.land, base);
  return base;
}

/** Calque de l'aperçu : enveloppe (<g …>) et éléments, ajoutés un par un tant qu'ils tiennent. */
type Layer = { open: string; close: string; items: string[] };

const group = (attributes: string, items: string[]): Layer => ({ open: `<g ${attributes}>`, close: "</g>", items });

const ACC = PREVIEW_BASE["--color-acc"];
const round = (v: number) => Math.round(v);

function countriesLayer(doc: MapDoc, world: PreviewWorld, projection: GeoProjection): Layer {
  const items: string[] = [];
  for (const [code, color] of colorsOf(doc, "c")) {
    const shape = world.featureByCode.get(code);
    const d = shape ? surfacePath(projection, shape) : "";
    if (d) items.push(`<path fill="${previewHex(color)}" d="${d}"/>`);
  }
  return group(`fill-opacity=".8"`, items);
}

function zonesLayer(doc: MapDoc, projection: GeoProjection): Layer {
  const items = doc.zones.flatMap((zone) => {
    const d = surfacePath(projection, { type: "Polygon", coordinates: [zone.ring.map(([lon, lat]) => [lon, lat])] });
    return d ? [`<path d="${d}"/>`] : [];
  });
  return group(`fill="${ACC}" fill-opacity=".2" stroke="${ACC}" stroke-width=".6"`, items);
}

function fluxLayer(doc: MapDoc, projection: GeoProjection): Layer {
  const items: string[] = [];
  for (const color of FLUX_COLOR_IDS) {
    for (const stroke of doc.flux[color] ?? []) {
      const d = lineShapePath(projection, { type: "LineString", coordinates: stroke.points.map(([lon, lat]) => [lon, lat]) });
      const width = Math.max(0.6, Math.min(3, Math.round(stroke.width * 4) / 10));
      if (d) items.push(`<path stroke="${PREVIEW_FLUX[color]}" stroke-width="${width}" d="${d}"/>`);
    }
  }
  return group(`fill="none" stroke-opacity=".65" stroke-linecap="round" stroke-linejoin="round"`, items);
}

function linksLayer(doc: MapDoc, world: PreviewWorld, projection: GeoProjection): Layer {
  const colors = colorsOf(doc, "l");
  const items = linkAnchors(doc, world.countryAnchor).flatMap(({ id, a, b }) => {
    const d = lineShapePath(projection, { type: "LineString", coordinates: [[a[0], a[1]], [b[0], b[1]]] });
    const color = colors.get(id);
    return d ? [`<path stroke="${color ? previewHex(color) : ACC}" d="${d}"/>`] : [];
  });
  return group(`fill="none" stroke-width=".8" stroke-linecap="round"`, items);
}

function dots(points: readonly { ll: readonly [number, number] }[], projection: GeoProjection, fill: (i: number) => string, r: string) {
  return points.flatMap((p, i) => {
    const xy = projection([p.ll[0], p.ll[1]]);
    if (!xy || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return [];
    return [`<circle cx="${round(xy[0])}" cy="${round(xy[1])}" r="${r}"${fill(i)}/>`];
  });
}

function pointsLayer(doc: MapDoc, projection: GeoProjection): Layer {
  return group(`fill="${ACC}"`, dots(doc.points, projection, () => "", "1.3"));
}

function pingsLayer(doc: MapDoc, projection: GeoProjection): Layer {
  const fill = (i: number) => ` fill="${PREVIEW_PING[doc.pings[i].type]}"`;
  return group(`stroke="${PREVIEW_BASE["--color-bg"]}" stroke-width=".5"`, dots(doc.pings, projection, fill, "2"));
}

/**
 * Coût d'un morceau de SVG dans la limite : sa longueur (le SVG n'a que des caractères ASCII), plus
 * une barre oblique par guillemet, ajoutée quand le logo est écrit en JSON (limite MAX_COVER_BYTES).
 */
export const svgCost = (text: string) => text.length + (text.match(/"/g)?.length ?? 0);

/**
 * Garde, calque par calque dans l'ordre de `priority`, les éléments qui tiennent dans `budget`, puis
 * assemble les calques retenus dans leur ordre d'affichage.
 */
export function fitLayers(layers: readonly Layer[], priority: readonly number[], budget: number): string {
  const kept = layers.map((): string[] => []);
  let remaining = budget;
  for (const index of priority) {
    const layer = layers[index];
    const wrapper = svgCost(layer.open) + svgCost(layer.close);
    for (const item of layer.items) {
      const cost = svgCost(item) + (kept[index].length === 0 ? wrapper : 0);
      if (cost > remaining) break;
      kept[index].push(item);
      remaining -= cost;
    }
  }
  return layers.map((layer, i) => (kept[i].length > 0 ? layer.open + kept[i].join("") + layer.close : "")).join("");
}

/** SVG de l'aperçu d'une carte (toujours sous MAX_COVER_SVG_BYTES). */
export function buildPreviewSvg(doc: MapDoc, world: PreviewWorld): string {
  const projection = makePreviewProjection();
  const base = baseLayer(world, projection);
  // Ordre d'affichage : pays, zones, flux, liens, points, balises (comme sur la carte).
  const layers = [
    countriesLayer(doc, world, projection),
    zonesLayer(doc, projection),
    fluxLayer(doc, projection),
    linksLayer(doc, world, projection),
    pointsLayer(doc, projection),
    pingsLayer(doc, projection),
  ];
  // Ordre d'importance quand la place manque : pays, zones, liens, balises, points, puis flux.
  const priority = [0, 1, 3, 5, 4, 2];
  const budget = MAX_COVER_SVG_BYTES - svgCost(OPEN) - svgCost(base) - svgCost(CLOSE);
  return OPEN + base + fitLayers(layers, priority, budget) + CLOSE;
}

/** Aperçu d'une carte, prêt à enregistrer ; null si le résultat n'est pas un aperçu valide (ne devrait pas arriver). */
export function buildPreviewCover(doc: MapDoc, world: PreviewWorld): MapCover | null {
  return parseMapCover({ kind: "preview", svg: buildPreviewSvg(doc, world) });
}
