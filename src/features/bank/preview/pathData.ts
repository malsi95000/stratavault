// Tracés compacts de l'aperçu d'une carte : simplification (Douglas-Peucker), coordonnées entières
// et commandes relatives, pour qu'une vignette du monde tienne en quelques kilo-octets.

export type Pt = readonly [number, number];

/** Distance d'un point au segment [a, b]. */
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Simplification de Douglas-Peucker : garde les extrémités et les points à plus de `tolerance` px. */
export function simplify(points: readonly Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let farthest = -1;
    let max = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > max) {
        max = d;
        farthest = i;
      }
    }
    if (farthest < 0) continue;
    keep[farthest] = 1;
    stack.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Points arrondis au pixel, sans doublons consécutifs. */
export function roundPoints(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const [x, y] of points) {
    const p: Pt = [Math.round(x), Math.round(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/** Aire (px², signe selon le sens) d'un anneau. */
export function ringArea(points: readonly Pt[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    twice += x1 * y2 - x2 * y1;
  }
  return twice / 2;
}

/** Nombres d'une commande SVG, séparés au plus court (un signe moins sépare déjà). */
function joinNumbers(values: readonly number[]): string {
  let out = "";
  for (const v of values) out += out === "" || v < 0 ? String(v) : ` ${v}`;
  return out;
}

/**
 * Tracé « M x y l dx dy … » (fermé par « z » si `closed`) de points déjà arrondis ; chaîne vide s'il
 * reste moins de deux points.
 */
export function encodePath(points: readonly Pt[], closed: boolean): string {
  if (points.length < 2) return "";
  const [start, ...rest] = points;
  const deltas: number[] = [];
  let previous = start;
  for (const p of rest) {
    deltas.push(p[0] - previous[0], p[1] - previous[1]);
    previous = p;
  }
  return `M${joinNumbers(start)}l${joinNumbers(deltas)}${closed ? "z" : ""}`;
}

export type ShapeOptions = {
  /** Écart toléré par la simplification (px). */
  tolerance: number;
  /** Anneaux d'une aire inférieure (px²) ignorés : îlots invisibles à cette taille. */
  minArea?: number;
};

/** Tracé d'un anneau (surface) simplifié ; chaîne vide s'il est trop petit pour être vu. */
export function ringPath(points: readonly Pt[], { tolerance, minArea = 0 }: ShapeOptions): string {
  if (points.length < 3 || Math.abs(ringArea(points)) < minArea) return "";
  const ring = roundPoints(simplify(points, tolerance));
  return ring.length >= 3 ? encodePath(ring, true) : "";
}

/** Tracé d'une ligne simplifiée ; chaîne vide si elle se réduit à un point. */
export function linePath(points: readonly Pt[], { tolerance }: ShapeOptions): string {
  return encodePath(roundPoints(simplify(points, tolerance)), false);
}
