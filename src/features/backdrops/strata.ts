// Strates : lignes ondulées superposées, comme les couches d'une coupe géologique. Elles suivent
// toutes la même grande ondulation et chacune n'en dévie que de moins de 0,4 écart : deux strates
// voisines ne se croisent jamais.
import { linePath, type Pt } from "@/features/bank/preview/pathData";
import { between, seededRandom, type Random } from "./random";
import type { BackdropLayer } from "./types";

export type StrataOptions = {
  seed: number;
  width: number;
  height: number;
  /** Nombre de strates. */
  count: number;
  /** Une strate sur `majorEvery` est plus marquée. */
  majorEvery: number;
};

type Wave = { amplitude: number; frequency: number; phase: number };

const waves = (random: Random, count: number, amplitude: number, frequency: readonly [number, number]): Wave[] =>
  Array.from({ length: count }, () => ({
    amplitude: between(random, 0.4, 1) * amplitude,
    frequency: between(random, frequency[0], frequency[1]),
    phase: between(random, 0, 2 * Math.PI),
  }));

const waveAt = (list: readonly Wave[], t: number) =>
  list.reduce((sum, w) => sum + w.amplitude * Math.sin(2 * Math.PI * w.frequency * t + w.phase), 0);

/**
 * Strates échantillonnées tous les `stepX` en abscisse, avec leur rang. La grande ondulation décale
 * toutes les strates ensemble : d'autres strates sont donc tracées au-delà du haut et du bas, pour
 * qu'aucune bande vide n'apparaisse au bord.
 */
export function strataLines({ seed, width, height, count }: StrataOptions, stepX = 20): { rank: number; points: Pt[] }[] {
  const random = seededRandom(seed);
  const gap = height / count;
  const shared = waves(random, 3, height * 0.1, [0.3, 1.4]);
  const margin = shared.reduce((sum, w) => sum + w.amplitude, 0);
  const first = Math.floor(-margin / gap);
  const last = Math.ceil((height + margin) / gap);
  const lines: { rank: number; points: Pt[] }[] = [];
  for (let rank = first; rank <= last; rank++) {
    // Écart propre à chaque strate : au plus ± 0,4 × gap, pour ne jamais toucher la voisine.
    const own = waves(random, 2, gap * 0.2, [1, 4]);
    const points: Pt[] = [];
    for (let x = 0; x <= width; x += stepX) {
      const t = x / width;
      points.push([x, rank * gap + waveAt(shared, t) + waveAt(own, t)]);
    }
    lines.push({ rank, points });
  }
  return lines;
}

export function strataLayers(options: StrataOptions): BackdropLayer[] {
  const minor: string[] = [];
  const major: string[] = [];
  for (const { rank, points } of strataLines(options)) {
    (rank % options.majorEvery === 0 ? major : minor).push(linePath(points, { tolerance: 1.2 }));
  }
  return [
    { tone: "line", d: minor.join("") },
    { tone: "strong", d: major.join("") },
  ];
}
