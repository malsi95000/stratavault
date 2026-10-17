// Apparition des blocs de l'accueil au défilement (ACC-05).

export type RevealState = "shown" | "hidden";

/**
 * État d'un bloc juste après le chargement. Seul un bloc encore sous l'écran est caché, en attendant
 * d'y entrer : un bloc déjà visible (ou au-dessus, page ouverte sur une ancre) ne clignote pas. Rien
 * n'est caché quand l'utilisateur préfère réduire les animations.
 */
export function initialReveal(top: number, viewportHeight: number, reducedMotion: boolean): RevealState {
  return !reducedMotion && top > viewportHeight ? "hidden" : "shown";
}

/** Décalage d'apparition du `index`-ième bloc d'une liste (effet de cascade, borné). */
export function staggerDelay(index: number, stepMs = 70, maxMs = 350): number {
  return Math.min(Math.max(0, index) * stepMs, maxMs);
}
