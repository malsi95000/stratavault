// Tracés géographiques de la vue globe, calculés une fois par élément (indépendants de la rotation) :
// liens en arcs aériens, flux lissés et densifiés le long des grands cercles.
import { geoDistance, geoInterpolate } from "d3";
import type { LonLat } from "@/lib/geo";
import { toVector } from "./globe3d";
import type { RoutePoint } from "./globe3d";

/** Altitude d'un arc par radian de distance (rayon terrestre = 1) : Paris–New York culmine à ~0,14. */
export const ARC_ALTITUDE_PER_RADIAN = 0.15;
/** Altitude maximale d'un arc, pour que les longues liaisons restent près du globe. */
export const ARC_MAX_ALTITUDE = 0.25;
/** Pas maximal entre deux points d'un arc (degrés) et bornes du nombre de segments. */
const ARC_STEP_DEG = 2;
const ARC_MIN_SEGMENTS = 8;
const ARC_MAX_SEGMENTS = 90;
/**
 * Points de tous les arcs de la carte (hors ombres). Au-delà de ~440 liens, chaque arc a moins de
 * segments : une carte qui en compte des milliers (fichier importé) ne fige pas la rotation du globe.
 */
export const ARC_LAYER_BUDGET = 40_000;

/** Altitude des flux : juste assez pour détacher le trait de son ombre près de l'horizon. */
export const FLUX_ALTITUDE = 0.012;
/** Pas maximal entre deux points d'un flux (degrés) : le trait épouse la courbure du globe. */
export const FLUX_MAX_STEP_DEG = 1;
/**
 * Écart minimal entre deux points d'un flux avant lissage (degrés) : retire seulement les doublons. Le pinceau
 * enregistre déjà un point tous les 3 px à l'écran ; au zoom 40, cela fait ~0,012° sur le globe : un seuil
 * plus grand effacerait les détails d'un flux tracé zoomé. Le coût par image reste borné par routePath.
 */
export const FLUX_MIN_STEP_DEG = 0.002;
/** Nombre de points au-delà duquel le lissage s'arrête (coût de chaque image de rotation). */
export const FLUX_SMOOTHING_BUDGET = 16_000;
const FLUX_SMOOTHING_ITERATIONS = 2;
/**
 * Nombre de points au-delà duquel la densification élargit son pas : un tracé très long ou hostile
 * (milliers d'allers-retours d'un bout à l'autre du globe, fichier importé) ne peut pas multiplier
 * ses points. Un flux n'a jamais plus de points que max(budget, points d'origine).
 */
export const FLUX_ROUTE_BUDGET = 16_000;
/**
 * Points de tous les flux de la carte (hors ombres et hors points d'origine) : le budget par flux ne
 * borne pas une carte de milliers de longs traits (un petit fichier importé en produirait des millions).
 */
export const FLUX_LAYER_BUDGET = 60_000;

const DEGREES = 180 / Math.PI;

/** Altitude maximale d'un arc selon la distance angulaire (radians) entre ses extrémités. */
export function arcAltitude(angle: number): number {
  return Math.min(ARC_MAX_ALTITUDE, ARC_ALTITUDE_PER_RADIAN * angle);
}

/** Nombre maximal de segments de chaque arc pour une carte de `count` liens (au moins 2). */
export function arcSegmentCap(count: number): number {
  return Math.max(2, Math.min(ARC_MAX_SEGMENTS, Math.floor(ARC_LAYER_BUDGET / Math.max(1, count)) - 1));
}

/**
 * Arc aérien d'un lien : il suit le grand cercle de a à b et s'élève selon un profil sin(πt), nul aux
 * extrémités et maximal à mi-parcours. Vide si les extrémités sont confondues ou antipodales (aucun
 * grand cercle unique). `maxSegments` : voir arcSegmentCap.
 */
export function arcRoute(a: LonLat, b: LonLat, maxSegments = ARC_MAX_SEGMENTS): RoutePoint[] {
  const angle = geoDistance(a, b);
  if (!(angle > 0) || Math.PI - angle < 1e-9) return [];
  const peak = arcAltitude(angle);
  const cap = Math.max(2, Math.min(ARC_MAX_SEGMENTS, maxSegments));
  const segments = Math.min(cap, Math.max(ARC_MIN_SEGMENTS, Math.ceil((angle * DEGREES) / ARC_STEP_DEG)));
  const interpolate = geoInterpolate(a, b);
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    return { v: toVector(interpolate(t)), r: 1 + peak * Math.sin(Math.PI * t) };
  });
}

/** Retire les points à moins de minStep degrés du précédent (le dernier point est toujours gardé). */
export function thinRoute(points: readonly LonLat[], minStep: number): LonLat[] {
  if (points.length <= 2) return [...points];
  const minAngle = minStep / DEGREES;
  const kept: LonLat[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (geoDistance(kept[kept.length - 1], points[i]) >= minAngle) kept.push(points[i]);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

/**
 * Lissage de Chaikin sur la sphère : chaque segment est remplacé par ses points au quart et aux trois
 * quarts (le long du grand cercle), extrémités conservées. Les angles du tracé à main levée s'arrondissent.
 */
export function smoothRoute(points: readonly LonLat[], iterations = 1): LonLat[] {
  let current = [...points];
  for (let n = 0; n < iterations && current.length > 2; n++) {
    const next: LonLat[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const interpolate = geoInterpolate(current[i], current[i + 1]);
      next.push(interpolate(0.25), interpolate(0.75));
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

/**
 * Ajoute des points le long des grands cercles pour qu'aucun pas ne dépasse maxStep degrés. Le pas
 * s'élargit si le résultat dépasserait `budget` points (au plus `budget` points ajoutés en tout).
 */
export function densifyRoute(points: readonly LonLat[], maxStep: number, budget = Infinity): LonLat[] {
  if (points.length === 0) return [];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = geoDistance(points[i - 1], points[i]) * DEGREES;
    lengths.push(length);
    total += length;
  }
  // Points ajoutés : au plus total / step, donc au plus `room`.
  const room = budget - points.length;
  const step = room > 0 ? Math.max(maxStep, total / room) : Infinity;
  const out: LonLat[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const steps = Math.ceil(lengths[i - 1] / step);
    if (steps > 1) {
      const interpolate = geoInterpolate(points[i - 1], points[i]);
      for (let s = 1; s < steps; s++) out.push(interpolate(s / steps));
    }
    out.push(points[i]);
  }
  return out;
}

/** Nombre d'itérations de lissage qui restent dans le budget de points (chacune double le nombre de points). */
function smoothingIterations(count: number, budget: number): number {
  let iterations = 0;
  while (iterations < FLUX_SMOOTHING_ITERATIONS && count * 2 ** (iterations + 1) <= budget) iterations++;
  return iterations;
}

/** Nombre de points du tracé d'un flux sans contrainte globale (majorant). */
function naturalFluxSize(points: readonly LonLat[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += geoDistance(points[i - 1], points[i]) * DEGREES;
  const smoothed = points.length * 2 ** smoothingIterations(points.length, FLUX_SMOOTHING_BUDGET);
  return Math.max(points.length, Math.min(FLUX_ROUTE_BUDGET, smoothed + Math.ceil(length / FLUX_MAX_STEP_DEG)));
}

/**
 * Budget de points du tracé de chaque flux sur le globe. Tant que l'ensemble tient dans
 * FLUX_LAYER_BUDGET, chaque flux garde FLUX_ROUTE_BUDGET : valeur stable, ses tracés mémoïsés ne sont
 * pas recalculés quand un autre flux change. Au-delà (carte hostile ou démesurée), FLUX_LAYER_BUDGET
 * est réparti au prorata de la taille de chaque tracé : le total ne dépasse plus ce budget, plus les
 * points d'origine qui ne s'y logent pas (le planisphère les dessine déjà tous).
 */
export function fluxBudgets(strokes: readonly (readonly LonLat[])[]): number[] {
  const sizes = strokes.map(naturalFluxSize);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= FLUX_LAYER_BUDGET) return sizes.map(() => FLUX_ROUTE_BUDGET);
  return sizes.map((size) => Math.floor((FLUX_LAYER_BUDGET * size) / total));
}

/**
 * Flux sur le globe : tracé allégé, lissé, densifié le long des grands cercles et légèrement surélevé.
 * Au plus max(budget, points d'origine) points (voir fluxBudgets).
 */
export function fluxRoute(points: readonly LonLat[], budget = FLUX_ROUTE_BUDGET): RoutePoint[] {
  const thinned = thinRoute(points, FLUX_MIN_STEP_DEG);
  const smoothed = smoothRoute(thinned, smoothingIterations(thinned.length, Math.min(FLUX_SMOOTHING_BUDGET, budget)));
  return densifyRoute(smoothed, FLUX_MAX_STEP_DEG, Math.min(FLUX_ROUTE_BUDGET, budget)).map((ll) => ({
    v: toVector(ll),
    r: 1 + FLUX_ALTITUDE,
  }));
}
