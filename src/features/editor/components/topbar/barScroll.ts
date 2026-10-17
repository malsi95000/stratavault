// Défilement horizontal de la barre du haut quand elle manque de place (écran étroit, ou fiche
// ouverte qui la fait s'arrêter au bord du panneau). Calculs purs, utilisés par useBarScroll.

/** Côtés où du contenu est caché : un dégradé le signale. */
export type BarEdges = { before: boolean; after: boolean };

export const NO_EDGES: BarEdges = { before: false, after: false };

/** Hauteur d'une ligne pour une molette qui compte en lignes (deltaMode 1). */
const LINE_PX = 16;

/** Côtés cachés de la barre, d'après sa position de défilement (à 1 px près, pour les zooms fractionnaires). */
export function barEdges(scrollLeft: number, scrollWidth: number, clientWidth: number): BarEdges {
  const max = scrollWidth - clientWidth;
  if (max <= 1) return NO_EDGES;
  return { before: scrollLeft > 1, after: scrollLeft < max - 1 };
}

export const sameEdges = (a: BarEdges, b: BarEdges) => a.before === b.before && a.after === b.after;

/**
 * Nouvelle position de défilement après un cran de molette : une molette verticale fait défiler la
 * barre horizontalement. null si rien ne change (la barre tient en entier, ou elle est déjà au bout) :
 * l'évènement est alors laissé au navigateur.
 */
export function wheelScrollLeft(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  wheel: { deltaX: number; deltaY: number; deltaMode: number },
): number | null {
  const max = scrollWidth - clientWidth;
  if (max <= 0) return null;
  const raw = Math.abs(wheel.deltaX) > Math.abs(wheel.deltaY) ? wheel.deltaX : wheel.deltaY;
  const delta = wheel.deltaMode === 1 ? raw * LINE_PX : wheel.deltaMode === 2 ? raw * clientWidth : raw;
  const next = Math.min(max, Math.max(0, scrollLeft + delta));
  return next === scrollLeft ? null : next;
}

/** Classe du dégradé qui signale le contenu caché à gauche, à droite ou des deux côtés. */
export function edgeMaskClass(edges: BarEdges): string | undefined {
  if (edges.before && edges.after) {
    return "[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)]";
  }
  if (edges.before) return "[mask-image:linear-gradient(to_right,transparent,black_2rem)]";
  if (edges.after) return "[mask-image:linear-gradient(to_left,transparent,black_2rem)]";
  return undefined;
}
