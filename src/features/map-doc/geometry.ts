import { geoArea, geoCentroid } from "d3";
import type { LonLat } from "./types";

const samePoint = (a: LonLat, b: LonLat) => a[0] === b[0] && a[1] === b[1];

/**
 * Ferme l'anneau (dernier point = premier) et l'oriente pour qu'il délimite la plus petite des deux
 * surfaces de la sphère. La bêta gardait le sens du tracé : un lasso dessiné dans le sens inverse
 * désignait tout le globe sauf la zone, et son centroïde tombait aux antipodes.
 */
export function normalizeRing(points: readonly LonLat[]): LonLat[] {
  const ring = points.map((p): LonLat => [p[0], p[1]]);
  if (ring.length > 0 && !samePoint(ring[0], ring[ring.length - 1])) ring.push([ring[0][0], ring[0][1]]);
  if (ring.length >= 4 && geoArea({ type: "Polygon", coordinates: [ring] }) > 2 * Math.PI) ring.reverse();
  return ring;
}

/** Centroïde sphérique d'une zone (point d'ancrage de ses liens). */
export function ringCentroid(ring: readonly LonLat[]): LonLat {
  const [lon, lat] = geoCentroid({ type: "Polygon", coordinates: [ring.map((p) => [p[0], p[1]])] });
  return [lon, lat];
}
