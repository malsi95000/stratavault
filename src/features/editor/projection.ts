// Projection de la carte et conversion écran → [lon, lat] (bêta : draw, screenToLL).
// Deux vues : planisphère (Winkel tripel, comme la bêta) et globe (orthographique qu'on fait tourner).
import { geoDistance, geoOrthographic, geoRotation } from "d3";
import { geoWinkel3 } from "d3-geo-projection";
import type { GeoProjection } from "d3";
import type { LonLat } from "@/lib/geo";

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 40;

export type MapView = "planisphere" | "globe";

/** Rotation du globe [λ, φ] en degrés (d3 projection.rotate) : le centre du globe est [-λ, -φ]. */
export type Rotation = [lambda: number, phi: number];

export const NO_ROTATION: Rotation = [0, 0];

export type ProjectionOptions = {
  /**
   * Faux : pas de rééchantillonnage adaptatif (precision 0). Réservé aux tracés déjà densifiés et
   * bornés (zones, flux : editor/shapeBudget.ts), dont le coût ne doit pas dépendre de leur forme.
   */
  resample?: boolean;
};

/**
 * Projection de la vue, ajustée à la zone utile (marges de la bêta : barre d'outils, barre du haut,
 * barre d'aide). Le globe est coupé à l'horizon (clipAngle 90°) et garde les mêmes marges.
 */
export function makeProjection(
  width: number,
  height: number,
  view: MapView = "planisphere",
  rotation: Rotation = NO_ROTATION,
  { resample = true }: ProjectionOptions = {},
): GeoProjection {
  const projection = view === "globe" ? geoOrthographic().clipAngle(90).rotate(rotation) : geoWinkel3();
  projection.fitExtent(
    [
      [76, 58],
      [width - 24, height - 48],
    ],
    { type: "Sphere" },
  );
  // Après l'ajustement : même échelle et même cadrage que la projection rééchantillonnée.
  return resample ? projection : projection.precision(0);
}

/** Rayon du globe à l'écran (px, sans zoom) pour cette taille de carte. */
export function globeRadius(width: number, height: number): number {
  return makeProjection(width, height, "globe").scale();
}

/** Point de la Terre au centre du globe (ou du planisphère, sans rotation). */
export function viewCenter(projection: GeoProjection): LonLat {
  const [lon, lat] = geoRotation(projection.rotate()).invert([0, 0]);
  return [lon, lat];
}

/**
 * Projette les points d'un calque : [lon, lat] → coordonnées du SVG, ou null si le point n'est pas
 * représentable ou s'il est sur la face cachée du globe (au-delà de l'angle de coupe).
 */
export function pointProjector(projection: GeoProjection): (ll: LonLat) => [number, number] | null {
  // clipAngle() vaut 0 ou null sans coupe (planisphère).
  const clip = ((projection.clipAngle() ?? 0) * Math.PI) / 180;
  const center = clip > 0 ? viewCenter(projection) : null;
  return (ll) => {
    if (center && geoDistance(ll, center) > clip) return null;
    const xy = projection(ll);
    return xy && Number.isFinite(xy[0]) && Number.isFinite(xy[1]) ? xy : null;
  };
}

/** Vrai si le point est sur la face visible (toujours vrai sur le planisphère). */
export function isPointVisible(projection: GeoProjection, ll: LonLat): boolean {
  return pointProjector(projection)(ll) !== null;
}

const wrapLongitude = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Rotation du globe après un glisser de (dx, dy) pixels depuis la rotation de départ. Le point saisi
 * suit à peu près le pointeur : un pixel vaut 1 / (rayon × zoom) radian, donc la sensibilité baisse
 * quand on zoome. φ est borné à ±90° (un pôle au centre, pas de globe à l'envers).
 */
export function dragRotation(start: Rotation, dx: number, dy: number, k: number, radius: number): Rotation {
  const degPerPx = 180 / Math.PI / (radius * k);
  return [wrapLongitude(start[0] + dx * degPerPx), clamp(start[1] - dy * degPerPx, -90, 90)];
}

/** Rotation qui place ll au centre du globe. */
export function rotationCenteredOn([lon, lat]: LonLat): Rotation {
  return [wrapLongitude(-lon), clamp(-lat, -90, 90)];
}

/** Transformation du zoom (d3 ZoomTransform). */
export type ViewTransform = { invert: (point: [number, number]) => [number, number] };

/**
 * Point de l'écran (coordonnées dans le SVG) → [lon, lat] arrondi à 4 décimales,
 * ou null hors de la sphère (contrôle aller-retour de la bêta ; hors du disque du globe, l'inverse
 * de la projection orthographique n'est pas défini).
 */
export function screenToLL(projection: GeoProjection, transform: ViewTransform, px: number, py: number): LonLat | null {
  const [x, y] = transform.invert([px, py]);
  const ll = projection.invert?.([x, y]);
  if (!ll || !ll.every(Number.isFinite) || Math.abs(ll[1]) > 90 || Math.abs(ll[0]) > 180) return null;
  const back = projection(ll);
  if (!back || Math.hypot(back[0] - x, back[1] - y) > 1.5) return null;
  return [+ll[0].toFixed(4), +ll[1].toFixed(4)];
}

/** Position d'un clic (clientX, clientY) → [lon, lat], relativement au rectangle du <svg> (bêta screenToLL). */
export function clientToLL(
  projection: GeoProjection,
  transform: ViewTransform,
  rect: { left: number; top: number },
  clientX: number,
  clientY: number,
): LonLat | null {
  return screenToLL(projection, transform, clientX - rect.left, clientY - rect.top);
}

/** Point géographique au centre de l'écran (width × height), ou null s'il tombe hors de la carte. */
export function screenCenterLL(
  projection: GeoProjection,
  transform: ViewTransform,
  width: number,
  height: number,
): LonLat | null {
  return screenToLL(projection, transform, width / 2, height / 2);
}
