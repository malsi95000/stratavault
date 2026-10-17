// Courbes de niveau d'un relief (d3-contour), en tracés compacts. Une courbe qui sort du dessin est
// coupée au bord : d3-contour referme chaque courbe le long du cadre, et ce bout de cadre ne doit
// pas être dessiné.
import { contours } from "d3";
import { linePath, ringPath, type Pt } from "@/features/bank/preview/pathData";
import type { Grid } from "./terrain";
import type { BackdropLayer } from "./types";

export type ContourOptions = {
  /** Nombre de courbes entre l'altitude la plus basse et la plus haute. */
  levels: number;
  /** Une courbe sur `majorEvery` est une courbe maîtresse, plus marquée. */
  majorEvery: number;
  /** Taille du dessin : la grille est étirée à ces dimensions. */
  width: number;
  height: number;
  /** Écart toléré par la simplification (unités du dessin). */
  tolerance: number;
};

const onBorder = ([x, y]: Pt, cols: number, rows: number) => x <= 0 || y <= 0 || x >= cols || y >= rows;

/**
 * Découpe un anneau de d3-contour (premier point répété à la fin) en lignes, sans les segments
 * posés sur le bord de la grille. Un anneau qui ne touche pas le bord reste un seul anneau fermé.
 */
export function splitAtBorder(ring: readonly Pt[], cols: number, rows: number): { closed: boolean; points: Pt[] }[] {
  const border = ring.map((p) => onBorder(p, cols, rows));
  if (!border.includes(true)) return [{ closed: true, points: ring.slice(0, -1) }];
  // On part d'un segment de bord, pour qu'aucune ligne ne soit coupée en deux au début de l'anneau.
  const start = ring.findIndex((_, i) => i < ring.length - 1 && border[i] && border[i + 1]);
  const order = start < 0 ? ring.slice(0, -1) : [...ring.slice(start, -1), ...ring.slice(0, start)];
  const flags = order.map((p) => onBorder(p, cols, rows));
  const lines: { closed: boolean; points: Pt[] }[] = [];
  let current: Pt[] = [];
  for (let i = 0; i <= order.length; i++) {
    const a = order[i % order.length];
    const b = order[(i + 1) % order.length];
    const alongBorder = flags[i % order.length] && flags[(i + 1) % order.length];
    if (i === order.length || alongBorder) {
      if (current.length >= 2) lines.push({ closed: false, points: current });
      current = [];
      continue;
    }
    if (current.length === 0) current.push(a);
    current.push(b);
  }
  return lines;
}

/** Altitudes des courbes : `levels` paliers régulièrement espacés, extrêmes exclus. */
export function contourThresholds(values: ArrayLike<number>, levels: number): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
  }
  const step = (max - min) / (levels + 1);
  return Array.from({ length: levels }, (_, k) => min + step * (k + 1));
}

/** Courbes de niveau de `grid`, en deux tracés : courbes ordinaires et courbes maîtresses. */
export function contourLayers(grid: Grid, options: ContourOptions): BackdropLayer[] {
  const { cols, rows, values } = grid;
  const thresholds = contourThresholds(values, options.levels);
  const sx = options.width / cols;
  const sy = options.height / rows;
  const shapes = { tolerance: options.tolerance };
  const minor: string[] = [];
  const major: string[] = [];
  contours().size([cols, rows]).thresholds(thresholds)(Array.from(values)).forEach((polygon, level) => {
    const out = (level + 1) % options.majorEvery === 0 ? major : minor;
    for (const rings of polygon.coordinates) {
      for (const ring of rings) {
        for (const part of splitAtBorder(ring.map(([x, y]): Pt => [x, y]), cols, rows)) {
          const points = part.points.map(([x, y]): Pt => [x * sx, y * sy]);
          out.push(part.closed ? ringPath(points, { ...shapes, minArea: 60 }) : linePath(points, shapes));
        }
      }
    }
  });
  return [
    { tone: "line", d: minor.join("") },
    { tone: "strong", d: major.join("") },
  ];
}
