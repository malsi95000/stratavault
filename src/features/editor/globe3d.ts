// Tracés en relief de la vue globe (liens en arcs aériens, flux surélevés) : calcul en 3D, rotation du
// globe, projection orthographique, puis découpe des tronçons cachés par la Terre.
// Unités : le rayon de la Terre vaut 1 ; un point à l'altitude h est à la distance 1 + h du centre.
import { geoRotation } from "d3";
import type { GeoProjection } from "d3";
import type { LonLat } from "@/lib/geo";

export type Vec3 = [x: number, y: number, z: number];

/** Point d'un tracé : direction (vecteur unitaire géographique) et distance au centre (1 = au sol). */
export type RoutePoint = { v: Vec3; r: number };

/**
 * Repère de la vue : rotation du globe (matrice 3 × 3, par lignes), rayon et centre du disque à l'écran,
 * et écart minimal entre deux points dessinés (px du SVG avant zoom : la résolution suit le zoom).
 */
export type GlobeView = { matrix: readonly number[]; scale: number; tx: number; ty: number; minStep: number };

const RADIANS = Math.PI / 180;
/**
 * Écart minimal à l'écran entre deux points dessinés d'un tracé en relief (px, zoom compris) : sur des
 * courbes douces, l'écart avec la courbe exacte reste invisible, et le coût d'une image suit la longueur
 * du tracé à l'écran plutôt que son nombre de points.
 */
export const ROUTE_STEP_PX = 2;
/** Itérations de la recherche du point où un tronçon passe derrière la Terre (précision ~ 1/1000 du pas). */
const BISECTION_STEPS = 10;

/** [lon, lat] → vecteur unitaire (x vers lon 0 / lat 0, y vers lon 90° E, z vers le pôle Nord). */
export function toVector([lon, lat]: LonLat): Vec3 {
  const l = lon * RADIANS;
  const p = lat * RADIANS;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

/** Vecteur → [lon, lat] (degrés). */
export function toLonLat([x, y, z]: Vec3): LonLat {
  return [Math.atan2(y, x) / RADIANS, Math.asin(Math.max(-1, Math.min(1, z / Math.hypot(x, y, z)))) / RADIANS];
}

/**
 * Repère de la projection orthographique du globe. La rotation de d3 étant linéaire sur les vecteurs, sa
 * matrice s'obtient en tournant les trois axes ; elle sert ensuite pour tous les points de l'image.
 */
export function globeView(projection: GeoProjection, minStep = 0): GlobeView {
  const rotate = geoRotation(projection.rotate());
  const axes = [toVector(rotate([0, 0])), toVector(rotate([90, 0])), toVector(rotate([0, 90]))];
  // Colonnes = images des axes ; stockée par lignes.
  const matrix = [0, 1, 2].flatMap((row) => axes.map((axis) => axis[row]));
  const [tx, ty] = projection.translate();
  return { matrix, scale: projection.scale(), tx, ty, minStep };
}

/**
 * Point du tracé → repère de la vue : X vers la droite, Y vers le haut, Z vers l'observateur
 * (orthographique de d3 : x = cos φ sin λ, y = sin φ, et la face visible est cos φ cos λ > 0).
 */
export function toViewSpace({ v, r }: RoutePoint, { matrix: m }: GlobeView): Vec3 {
  const gx = m[0] * v[0] + m[1] * v[1] + m[2] * v[2];
  const gy = m[3] * v[0] + m[4] * v[1] + m[5] * v[2];
  const gz = m[6] * v[0] + m[7] * v[1] + m[8] * v[2];
  return [gy * r, gz * r, gx * r];
}

/** Coordonnées du SVG (avant zoom) d'un point du repère de la vue. */
export function toScreen([x, y]: Vec3, view: GlobeView): [number, number] {
  return [view.tx + view.scale * x, view.ty - view.scale * y];
}

/**
 * Caché par la Terre : derrière son centre (Z < 0) ET devant son disque (X² + Y² < 1). Un point en
 * altitude qui dépasse du disque reste visible même au-delà de l'horizon.
 */
export function isOccluded([x, y, z]: Vec3): boolean {
  return z < 0 && x * x + y * y < 1;
}

/** Point entre a et b (t de 0 à 1) : direction interpolée, distance au centre interpolée. */
function between(a: Vec3, b: Vec3, t: number): Vec3 {
  const ra = Math.hypot(...a);
  const rb = Math.hypot(...b);
  const d: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const length = Math.hypot(...d) || 1;
  const r = ra + (rb - ra) * t;
  return [(d[0] / length) * r, (d[1] / length) * r, (d[2] / length) * r];
}

/** Point de passage derrière la Terre entre un point visible et un point caché (dichotomie). */
function horizonCrossing(visible: Vec3, hidden: Vec3): Vec3 {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (isOccluded(between(visible, hidden, mid))) hi = mid;
    else lo = mid;
  }
  return between(visible, hidden, lo);
}

/** Réception des tronçons visibles d'un tracé, point par point. */
type RunSink = { start: (p: Vec3) => void; add: (p: Vec3) => void; end: () => void };

/**
 * Parcourt les tronçons visibles d'un tracé de count points (repère de la vue). Chaque tronçon s'arrête
 * exactement là où le tracé passe derrière la Terre, et le suivant reprend là où il en ressort.
 */
function walkVisible(count: number, pointAt: (i: number) => Vec3, sink: RunSink): void {
  let previous: Vec3 | null = null;
  let open = false;
  for (let i = 0; i < count; i++) {
    const p = pointAt(i);
    if (!isOccluded(p)) {
      if (open) sink.add(p);
      else if (previous) {
        sink.start(horizonCrossing(p, previous));
        sink.add(p);
      } else sink.start(p);
      open = true;
    } else if (open && previous) {
      sink.add(horizonCrossing(previous, p));
      sink.end();
      open = false;
    }
    previous = p;
  }
  if (open) sink.end();
}

/** Tronçons visibles d'un tracé (repère de la vue), d'au moins deux points chacun. */
export function visibleRuns(points: readonly Vec3[]): Vec3[][] {
  const runs: Vec3[][] = [];
  let run: Vec3[] = [];
  walkVisible(points.length, (i) => points[i], {
    start: (p) => {
      run = [p];
    },
    add: (p) => run.push(p),
    end: () => {
      if (run.length > 1) runs.push(run);
    },
  });
  return runs;
}

/**
 * Précision des coordonnées (unités SVG avant zoom) : 3 décimales, comme geoPath de d3-geo. Le zoom agrandit
 * le viewBox jusqu'à ×40 : une grille plus grossière ferait des marches visibles et décalerait les extrémités
 * des arcs par rapport aux balises.
 */
export const ROUTE_DIGITS = 3;
const ROUTE_SCALE = 10 ** ROUTE_DIGITS;
const round = (n: number) => Math.round(n * ROUTE_SCALE) / ROUTE_SCALE;

/**
 * Attribut d d'un <path> : tronçons visibles du tracé, projetés à l'écran ; "" s'il est entièrement caché.
 * Les points à moins de view.minStep du précédent sont sautés, sauf le dernier de chaque tronçon : la
 * longueur du tracé suit sa taille à l'écran, pas son nombre de points.
 */
export function routePath(points: readonly RoutePoint[], view: GlobeView): string {
  const { minStep } = view;
  let d = "";
  let runStart = 0;
  let count = 0;
  let lastX = 0;
  let lastY = 0;
  let skippedX = NaN;
  let skippedY = NaN;
  const emit = (x: number, y: number) => {
    d += `L${round(x)},${round(y)}`;
    lastX = x;
    lastY = y;
    count++;
  };
  walkVisible(points.length, (i) => toViewSpace(points[i], view), {
    start: (p) => {
      [lastX, lastY] = toScreen(p, view);
      runStart = d.length;
      d += `M${round(lastX)},${round(lastY)}`;
      count = 1;
      skippedX = NaN;
    },
    add: (p) => {
      const [x, y] = toScreen(p, view);
      if (Math.abs(x - lastX) + Math.abs(y - lastY) >= minStep) {
        emit(x, y);
        skippedX = NaN;
      } else {
        skippedX = x;
        skippedY = y;
      }
    },
    end: () => {
      if (!Number.isNaN(skippedX)) emit(skippedX, skippedY);
      if (count < 2) d = d.slice(0, runStart);
    },
  });
  return d;
}

/** Le même tracé posé au sol (son ombre). */
export function onGround(points: readonly RoutePoint[]): RoutePoint[] {
  return points.map(({ v }) => ({ v, r: 1 }));
}
