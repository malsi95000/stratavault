// Relief imaginaire d'où sont tirées les courbes de niveau : une somme de collines (et de cuvettes)
// en cloche, échantillonnée sur une grille.
import { between, seededRandom } from "./random";

/** Colline en cloche : centre et rayon en fraction de la largeur du dessin, hauteur (négative : cuvette). */
export type Hill = { x: number; y: number; radius: number; height: number };

export type Grid = { cols: number; rows: number; values: Float64Array };

export type HillOptions = {
  seed: number;
  count: number;
  /** Rayon minimal et maximal, en fraction de la largeur. */
  radius: readonly [number, number];
  /** Part des cuvettes parmi les collines (0 à 1). */
  hollows?: number;
};

/** Collines tirées au hasard (à graine) sur tout le dessin, un peu au-delà des bords. */
export function randomHills({ seed, count, radius, hollows = 0 }: HillOptions): Hill[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => ({
    x: between(random, -0.1, 1.1),
    y: between(random, -0.1, 1.1),
    radius: between(random, radius[0], radius[1]),
    height: (random() < hollows ? -1 : 1) * between(random, 0.5, 1),
  }));
}

/**
 * Altitude au centre de chaque case d'une grille `cols` × `rows` couvrant un dessin de proportions
 * `aspect` (hauteur / largeur). Rangée par rangée, comme l'attend d3-contour.
 */
export function sampleTerrain(hills: readonly Hill[], cols: number, rows: number, aspect: number): Grid {
  const values = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const y = ((j + 0.5) / rows) * aspect;
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) / cols;
      let z = 0;
      for (const hill of hills) {
        const dx = x - hill.x;
        const dy = y - hill.y * aspect;
        z += hill.height * Math.exp(-(dx * dx + dy * dy) / (2 * hill.radius * hill.radius));
      }
      values[j * cols + i] = z;
    }
  }
  return { cols, rows, values };
}
