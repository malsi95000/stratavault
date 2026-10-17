// Fonds de page thématiques (ANN-01) : motifs topographiques dessinés en SVG, derrière le contenu
// des pages annexes. Chaque motif est fait de quelques tracés (chaînes « d » d'un <path>), sans texte.

/** Taille du dessin (unités du viewBox). Le SVG est ensuite étiré pour couvrir l'écran (« slice »). */
export const BACKDROP_WIDTH = 1600;
export const BACKDROP_HEIGHT = 1000;

/**
 * Intensité d'un tracé, rendue par un jeton de globals.css :
 * - line : trait de fond (--color-backdrop-line) ;
 * - strong : trait principal, ex. courbe maîtresse (--color-backdrop-strong) ;
 * - accent : rare repère à la couleur d'accent, très atténuée (--color-backdrop-accent).
 */
export type BackdropTone = "line" | "strong" | "accent";

export type BackdropLayer = {
  tone: BackdropTone;
  /** Tracé SVG (commandes M, l, z en coordonnées entières). */
  d: string;
  /** Pointillés facultatifs (« 2 6 »…). */
  dash?: string;
};

/** Motifs disponibles, un par famille de pages. */
export const BACKDROP_VARIANTS = ["contours", "relief", "graticule", "strata", "coastlines"] as const;
export type BackdropVariant = (typeof BACKDROP_VARIANTS)[number];
