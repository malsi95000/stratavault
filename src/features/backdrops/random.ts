// Générateur pseudo-aléatoire à graine (mulberry32) : un motif est identique à chaque rendu, sur le
// serveur comme dans les tests.

export type Random = () => number;

/** Suite de nombres dans [0, 1), toujours la même pour une même graine. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nombre tiré entre `min` et `max`. */
export const between = (random: Random, min: number, max: number) => min + random() * (max - min);
