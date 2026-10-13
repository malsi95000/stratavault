// Fond de carte de la vue globe : niveaux de détail et tri des pays visibles, pour une rotation fluide.
// Chaque image de la rotation reprojette les 241 géométries (~80 000 points) : trop lent en pleine
// résolution (~70 ms). Pendant un glisser, on dessine donc une version simplifiée adaptée au zoom, et
// seulement les pays qui peuvent apparaître à l'écran ; la pleine résolution revient au relâchement.
import { geoArea, geoCentroid, geoDistance, geoStream } from "d3";
import type { GeoProjection } from "d3";
import type { Geometry, Position } from "geojson";
import { feature } from "topojson-client";
import type { LonLat } from "@/lib/geo";
import { viewCenter } from "./projection";
import type { CountryFeature, World, WorldTopology } from "./world";

/** Calotte sphérique : centre et rayon angulaire (radians). */
export type Cap = { center: LonLat; radius: number };

/** Une résolution du fond de carte : géométries dans l'ordre de world.shapes, et leurs calottes englobantes. */
export type DetailLevel = { epsilon: number; features: readonly CountryFeature[]; caps: readonly Cap[] };

/** Tolérances de simplification (degrés) des versions allégées, de la plus grossière à la plus fine. */
export const SIMPLIFIED_EPSILONS = [0.2, 0.05, 0.015] as const;
/** Écart toléré à l'écran pendant un glisser (px). */
export const DRAG_TOLERANCE_PX = 1.5;
/** Écart toléré à l'écran au repos (px) : invisible. */
export const REST_TOLERANCE_PX = 0.3;

/** Rectangle visible, en coordonnées du SVG avant zoom. */
export type Viewport = { x: number; y: number; width: number; height: number };
/** Cadrage figé au début d'un glisser : échelle du zoom et zone visible. */
export type DragView = { k: number; viewport: Viewport };

const HEMISPHERE = Math.PI / 2;

/** Arcs du fichier en coordonnées absolues (le fichier les stocke quantifiés et en écarts successifs). */
export function decodeArcs(topology: WorldTopology): LonLat[][] {
  const t = topology.transform;
  if (!t) return topology.arcs.map((arc) => arc.map(([x, y]): LonLat => [x, y]));
  const [sx, sy] = t.scale;
  const [tx, ty] = t.translate;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]): LonLat => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
}

/** Distance (degrés) du point p au segment [a, b], dans le plan lon/lat. */
function distanceToSegment([px, py]: LonLat, [ax, ay]: LonLat, [bx, by]: LonLat): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
}

/**
 * Douglas-Peucker : garde les extrémités, donc une frontière partagée reste identique chez les deux voisins.
 * Un arc fermé (petite île) garde au moins 4 points pour ne pas se réduire à un trait.
 */
export function simplifyLine(points: readonly LonLat[], epsilon: number): LonLat[] {
  if (points.length <= 2 || epsilon <= 0) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let farthest = -1;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distanceToSegment(points[i], points[a], points[b]);
      if (d > farthest) [farthest, index] = [d, i];
    }
    if (farthest > epsilon) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  const simplified = points.filter((_, i) => keep[i] === 1);
  const first = points[0];
  const last = points[points.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1];
  if (!closed || simplified.length >= 4 || points.length <= 4) return simplified;
  // Petite île : quatre sommets répartis le long du contour, dans l'ordre (même sens de parcours).
  const n = points.length - 1;
  return [points[0], points[Math.floor(n / 3)], points[Math.floor((2 * n) / 3)], points[n]];
}

/** Topologie aux arcs simplifiés (coordonnées absolues, sans quantification). */
export function simplifyTopology(topology: WorldTopology, epsilon: number): WorldTopology {
  const arcs = decodeArcs(topology).map((arc) => simplifyLine(arc, epsilon));
  return { ...topology, transform: undefined, arcs };
}

/** Calotte qui contient toute la géométrie (centroïde, distance du point le plus éloigné). */
export function boundingCap(f: CountryFeature): Cap {
  const center = geoCentroid(f);
  if (!center.every(Number.isFinite)) return { center: [0, 0], radius: Math.PI };
  let radius = 0;
  const visit = (x: number, y: number) => {
    radius = Math.max(radius, geoDistance(center, [x, y]));
  };
  const noop = () => {};
  geoStream(f, { point: visit, lineStart: noop, lineEnd: noop, polygonStart: noop, polygonEnd: noop, sphere: noop });
  return { center, radius };
}

/** Vrai si les deux calottes peuvent se toucher. */
export function capsOverlap(a: Cap, b: Cap): boolean {
  return geoDistance(a.center, b.center) <= a.radius + b.radius;
}

const polygonsOf = (g: Geometry): Position[][][] =>
  g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];

/**
 * Un polygone dont la simplification a inversé le sens de parcours couvrirait tout le globe sauf
 * lui-même (aire > hémisphère) : on reprend alors ce polygone d'origine.
 */
function repairFlipped(simplified: CountryFeature, original: CountryFeature): CountryFeature {
  const polygons = polygonsOf(simplified.geometry);
  const originals = polygonsOf(original.geometry);
  if (polygons.length !== originals.length) return original;
  let repaired = false;
  const coordinates = polygons.map((polygon, i) => {
    if (geoArea({ type: "Polygon", coordinates: polygon }) <= 2 * Math.PI) return polygon;
    repaired = true;
    return originals[i];
  });
  if (!repaired) return simplified;
  return { ...simplified, geometry: { type: "MultiPolygon", coordinates } };
}

/** Version simplifiée de chaque géométrie, dans l'ordre de world.shapes. */
function simplifiedFeatures(world: World, epsilon: number): CountryFeature[] {
  const simplified = simplifyTopology(world.topology, epsilon);
  return feature(simplified, simplified.objects.countries).features.map((f, i) => repairFlipped(f, world.shapes[i].feature));
}

/** Pleine résolution puis versions allégées, calculées à la demande (coûteux : une fois par fond de carte). */
export function buildDetailLevels(world: World): DetailLevel[] {
  const full = world.shapes.map((s) => s.feature);
  // Les sommets simplifiés sont un sous-ensemble des originaux : les calottes de la pleine résolution valent pour tous.
  const caps = full.map(boundingCap);
  return [
    { epsilon: 0, features: full, caps },
    ...SIMPLIFIED_EPSILONS.map((epsilon) => ({ epsilon, features: simplifiedFeatures(world, epsilon), caps })),
  ];
}

const cache = new WeakMap<World, DetailLevel[]>();

export function detailLevels(world: World): DetailLevel[] {
  let levels = cache.get(world);
  if (!levels) {
    levels = buildDetailLevels(world);
    cache.set(world, levels);
  }
  return levels;
}

/** Tolérance (degrés) qui correspond à px pixels à l'écran, pour un globe de rayon radius au zoom k. */
export function toleranceAt(radius: number, k: number, px: number): number {
  return (px / (radius * k)) * (180 / Math.PI);
}

/** Tolérance de simplification (degrés) des versions disponibles la plus grande sous la tolérance donnée, ou 0. */
export function epsilonFor(tolerance: number): number {
  return Math.max(0, ...SIMPLIFIED_EPSILONS.filter((e) => e <= tolerance));
}

/**
 * Résolution au repos pour un globe de rayon radius au zoom k : allégée de façon invisible à petite
 * échelle (la reprojection complète coûte ~90 ms), pleine dès qu'on zoome un peu.
 */
export function restEpsilon(radius: number, k: number): number {
  return epsilonFor(toleranceAt(radius, k, REST_TOLERANCE_PX));
}

/** Résolution la plus légère dont l'écart reste sous la tolérance (degrés) ; la pleine résolution sinon. */
export function pickLevel(levels: readonly DetailLevel[], tolerance: number): DetailLevel {
  let best = levels[0];
  for (const level of levels) if (level.epsilon <= tolerance && level.epsilon > best.epsilon) best = level;
  return best;
}

/** Face visible du globe. */
export function hemisphereCap(projection: GeoProjection): Cap {
  return { center: viewCenter(projection), radius: HEMISPHERE };
}

/**
 * Calotte qui contient la partie du globe visible dans le rectangle, ou null si le rectangle déborde
 * du disque (on se contente alors de la face visible). Les quatre coins étant dans la calotte, et
 * l'image d'une calotte de la face visible étant une ellipse pleine (convexe), tout le rectangle y est.
 */
export function visibleCap(projection: GeoProjection, { x, y, width, height }: Viewport): Cap | null {
  const invert = (px: number, py: number): LonLat | null => {
    const ll = projection.invert?.([px, py]);
    return ll && ll.every(Number.isFinite) ? [ll[0], ll[1]] : null;
  };
  const center = invert(x + width / 2, y + height / 2);
  if (!center) return null;
  let radius = 0;
  for (const [px, py] of [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ]) {
    const corner = invert(px, py);
    if (!corner) return null;
    radius = Math.max(radius, geoDistance(center, corner));
  }
  radius *= 1.1;
  return geoDistance(center, viewCenter(projection)) + radius < HEMISPHERE ? { center, radius } : null;
}

/**
 * Géométries à dessiner sur le globe, dans l'ordre de world.shapes (null : invisible, rien à calculer).
 * Au repos : face visible, résolution restEpsilon (voir cette fonction). Pendant un glisser : résolution
 * adaptée au zoom et à la zone affichée.
 */
export function globeGeometries(
  levels: readonly DetailLevel[],
  projection: GeoProjection,
  drag: DragView | null,
  /** Résolution au repos (restEpsilon). */
  atRest = 0,
): (CountryFeature | null)[] {
  const level = pickLevel(levels, drag ? toleranceAt(projection.scale(), drag.k, DRAG_TOLERANCE_PX) : atRest);
  const cap = (drag && visibleCap(projection, drag.viewport)) ?? hemisphereCap(projection);
  return level.features.map((f, i) => (capsOverlap(level.caps[i], cap) ? f : null));
}
