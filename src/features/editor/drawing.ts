// Tracés à main levée (lasso, pinceau flux) : échantillonnage des points du pointeur (bêta, lignes 761-784).
import type { FluxColor, LonLat } from "@/features/map-doc/types";
import type { Tool } from "./hints";

/** Écart minimal à l'écran entre deux points du lasso (px, zoom compris). */
export const LASSO_MIN_STEP_PX = 6;
/** Écart minimal à l'écran entre deux points du pinceau flux (px, zoom compris). */
export const FLUX_MIN_STEP_PX = 3;

/** Tracé en cours : contour du lasso, ou trait du pinceau flux (calque brouillon). */
export type Draft =
  | { kind: "lasso"; points: readonly LonLat[] }
  | { kind: "flux"; points: readonly LonLat[]; color: FluxColor; width: number };

/** Projection sans zoom : [lon, lat] → coordonnées du SVG, ou null si le point n'est pas représentable. */
export type Project = (ll: LonLat) => [number, number] | null;

/**
 * Ajoute ll au tracé s'il est à au moins minPx pixels à l'écran du dernier point (écart projeté × échelle
 * du zoom k). Renvoie le même tableau si le point est ignoré (aucun re-rendu du brouillon).
 */
export function appendTracePoint(
  points: readonly LonLat[],
  ll: LonLat,
  project: Project,
  k: number,
  minPx: number,
): readonly LonLat[] {
  const last = points[points.length - 1];
  if (last) {
    const a = project(last);
    const b = project(ll);
    if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) * k < minPx) return points;
  }
  return [...points, ll];
}

/**
 * Début d'un tracé à l'appui du pointeur : lasso, ou trait du pinceau dans la couleur et l'épaisseur
 * courantes. null pour les autres outils.
 */
export function startDraft(tool: Tool, ll: LonLat, color: FluxColor, width: number): Draft | null {
  if (tool === "lasso") return { kind: "lasso", points: [ll] };
  if (tool === "flux") return { kind: "flux", points: [ll], color, width };
  return null;
}

/** Prolonge le tracé (6 px pour le lasso, 3 px pour le flux) ; renvoie le même objet si rien ne change. */
export function extendDraft(draft: Draft, ll: LonLat, project: Project, k: number): Draft {
  const minPx = draft.kind === "lasso" ? LASSO_MIN_STEP_PX : FLUX_MIN_STEP_PX;
  const points = appendTracePoint(draft.points, ll, project, k, minPx);
  return points === draft.points ? draft : { ...draft, points };
}
