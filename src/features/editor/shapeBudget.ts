// Budgets de rendu des zones et des flux du planisphère (comme ARC_LAYER_BUDGET pour les liens et
// FLUX_LAYER_BUDGET pour les flux du globe).
//
// Pourquoi : geoPath rééchantillonne chaque segment selon sa courbure à l'écran. Un fichier importé
// hostile (milliers de segments d'un bout à l'autre du globe) produirait ainsi des millions de points,
// et les zones sont recalculées à chaque image de la rotation du globe. Les tracés sont donc préparés
// une fois : allégés s'ils dépassent leur part du budget, densifiés le long des grands cercles (pas
// d'au plus SHAPE_STEP_DEG degrés, la forme reste celle que dessinerait geoPath), puis projetés SANS
// rééchantillonnage (projection.precision(0)) : le nombre de points projetés ne dépasse jamais le budget.
// Une carte réaliste (tracés à main levée, un point tous les 3 à 6 px) reste sous le budget : rien
// n'est allégé, le rendu est inchangé.
import type { LonLat } from "@/lib/geo";
import { geoDistance } from "d3";
import { densifyRoute } from "./globeRoutes";

/** Pas maximal entre deux points projetés d'une zone ou d'un flux (degrés). */
export const SHAPE_STEP_DEG = 1;
/** Points de toutes les zones (recalculées à chaque image de la rotation du globe). */
export const ZONE_LAYER_BUDGET = 60_000;
/** Points de tous les flux du planisphère (recalculés seulement quand les flux changent). */
export const FLAT_FLUX_LAYER_BUDGET = 150_000;
/** Une zone garde au moins un triangle fermé ; un flux, ses deux extrémités. */
export const MIN_RING_POINTS = 4;
export const MIN_LINE_POINTS = 2;

const DEGREES = 180 / Math.PI;

/**
 * Au plus `max` points du tracé, pris à pas régulier ; le premier et le dernier sont toujours gardés
 * (un anneau reste fermé). Le tracé est renvoyé tel quel s'il tient déjà.
 */
export function decimate(points: readonly LonLat[], max: number): readonly LonLat[] {
  if (points.length <= max) return points;
  const count = Math.max(2, max);
  const step = (points.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => points[Math.round(i * step)]);
}

/**
 * Budget qui laisse densifier le tracé au pas SHAPE_STEP_DEG exactement (majorant du nombre de
 * points : densifyRoute n'élargit son pas que si le budget manque).
 */
export function naturalShapeSize(points: readonly LonLat[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += geoDistance(points[i - 1], points[i]) * DEGREES;
  return points.length + Math.ceil(length / SHAPE_STEP_DEG);
}

/**
 * Part du budget du calque pour chaque tracé. Tant que l'ensemble tient dans `layerBudget`, chaque
 * tracé garde sa taille naturelle (rendu exact, inchangé). Au-delà (carte hostile ou démesurée), le
 * budget est réparti au prorata des tailles, avec un minimum par tracé (`minPoints`).
 */
export function shapeBudgets(paths: readonly (readonly LonLat[])[], layerBudget: number, minPoints: number): number[] {
  const sizes = paths.map(naturalShapeSize);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= layerBudget) return sizes;
  return sizes.map((size) => Math.max(minPoints, Math.floor((layerBudget * size) / total)));
}

/**
 * Tracé prêt à projeter sans rééchantillonnage : allégé s'il dépasse son budget, puis densifié le
 * long des grands cercles, au plus `budget` points (au moins `minPoints`).
 */
export function fitShape(points: readonly LonLat[], budget: number, minPoints: number): LonLat[] {
  const room = Math.max(minPoints, budget);
  return densifyRoute(decimate(points, room), SHAPE_STEP_DEG, room);
}
