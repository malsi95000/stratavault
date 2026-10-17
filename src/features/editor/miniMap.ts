// Mini-carte d'un pays (fiche pays) : sa silhouette, ses voisins et un graticule, dans une projection
// azimutale équivalente centrée sur lui. Purement décorative : tracés calculés une fois par pays.
import { geoArea, geoAzimuthalEqualArea, geoCentroid, geoCircle, geoDistance, geoGraticule10, geoPath } from "d3";
import type { GeoPermissibleObjects } from "d3";
import type { Geometry, Polygon, Position } from "geojson";
import { countryByCode } from "@/data/countries";
import type { LonLat } from "@/lib/geo";
import type { CountryFeature, World } from "./world";

export const MINI_MAP_WIDTH = 132;
export const MINI_MAP_HEIGHT = 100;
/** Marge intérieure (px) autour du pays. */
const PADDING = 10;
/** Rayon (degrés) affiché au minimum autour du pays : un micro-État reste entouré de ses voisins. */
const MIN_RADIUS_DEG = 2;

export type MiniMap = {
  width: number;
  height: number;
  /** Graticule (tous les 10°). */
  graticule: string;
  /** Pays voisins (tous dans un seul tracé). */
  context: string;
  /** Le pays (vide s'il n'a pas de géométrie). */
  country: string;
  /** Position de la capitale d'une entité sans géométrie (Tuvalu…), sinon null. */
  marker: [number, number] | null;
};

/** Emprise en longitude/latitude [ouest, sud, est, nord] d'une géométrie, sans trigonométrie. */
type Box = [number, number, number, number];

const boxes = new WeakMap<CountryFeature, Box>();

function polygonsOf(g: Geometry): Position[][][] {
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}

function boxOf(f: CountryFeature): Box {
  let box = boxes.get(f);
  if (box) return box;
  box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygonsOf(f.geometry)) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        if (lon < box[0]) box[0] = lon;
        if (lat < box[1]) box[1] = lat;
        if (lon > box[2]) box[2] = lon;
        if (lat > box[3]) box[3] = lat;
      }
    }
  }
  boxes.set(f, box);
  return box;
}

/** Vrai si l'emprise touche la région [centre ± rayon] (longitudes comparées modulo 360°). */
export function boxNear(box: Box, center: LonLat, radiusDeg: number): boolean {
  const [west, south, east, north] = box;
  if (south > center[1] + radiusDeg || north < center[1] - radiusDeg) return false;
  // Près d'un pôle, toutes les longitudes sont proches.
  const poleward = Math.max(Math.abs(center[1] - radiusDeg), Math.abs(center[1] + radiusDeg));
  if (poleward >= 89) return true;
  const span = radiusDeg / Math.cos((poleward * Math.PI) / 180);
  if (span >= 180) return true;
  return [-360, 0, 360].some((shift) => west + shift <= center[0] + span && east + shift >= center[0] - span);
}

/** Plus grand polygone d'un pays (France métropolitaine plutôt que la Guyane, États-Unis contigus…). */
function mainPolygon(f: CountryFeature): Polygon | null {
  let best: Polygon | null = null;
  let bestArea = -1;
  for (const coordinates of polygonsOf(f.geometry)) {
    const polygon: Polygon = { type: "Polygon", coordinates };
    const area = geoArea(polygon);
    if (area > bestArea) [best, bestArea] = [polygon, area];
  }
  return best;
}

/**
 * Mini-carte du pays `code`, ou null s'il est inconnu ou ne peut pas être situé (ni géométrie, ni
 * capitale).
 */
export function miniMap(world: World, code: string, width = MINI_MAP_WIDTH, height = MINI_MAP_HEIGHT): MiniMap | null {
  const country = countryByCode.get(code);
  if (!country) return null;
  const feature = world.featureByCode.get(code) ?? null;
  const main = feature ? mainPolygon(feature) : null;
  const capital = country.capitals[0]?.ll ?? null;
  const center: LonLat | null = main ? (geoCentroid(main) as LonLat) : capital;
  if (!center || !center.every(Number.isFinite)) return null;

  // Le cadrage englobe le territoire principal et un cercle minimal autour de son centre.
  const circle = geoCircle().center(center).radius(MIN_RADIUS_DEG)();
  const frame: GeoPermissibleObjects = { type: "GeometryCollection", geometries: main ? [main, circle] : [circle] };
  const projection = geoAzimuthalEqualArea()
    .rotate([-center[0], -center[1]])
    .fitExtent(
      [
        [PADDING, PADDING],
        [width - PADDING, height - PADDING],
      ],
      frame,
    )
    .clipExtent([
      [0, 0],
      [width, height],
    ]);
  const path = geoPath(projection);

  // Rayon angulaire de la vue (degrés) : distance du centre au coin le plus éloigné, un peu élargie.
  let viewRadius = 0;
  for (const xy of [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ] as const) {
    const ll = projection.invert?.([xy[0], xy[1]]);
    viewRadius = Math.max(viewRadius, ll ? (geoDistance(center, ll) * 180) / Math.PI : 180);
  }
  viewRadius = viewRadius * 1.2 + 1;
  let context = "";
  for (const shape of world.shapes) {
    if (shape.feature === feature || !boxNear(boxOf(shape.feature), center, viewRadius)) continue;
    context += path(shape.feature) ?? "";
  }

  const xy = !feature && capital ? projection(capital) : null;
  return {
    width,
    height,
    graticule: path(geoGraticule10()) ?? "",
    context,
    country: feature ? (path(feature) ?? "") : "",
    marker: xy ? [xy[0], xy[1]] : null,
  };
}
