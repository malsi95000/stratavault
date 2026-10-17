// Portion visible de la frise (en années décimales) : zoom, déplacement, cadrage. Fonctions pures.

/** La frise couvre du 1er janvier 1800 au 31 décembre 2100. */
export const TIMELINE_START = 1800;
export const TIMELINE_END = 2101;
const FULL_SPAN = TIMELINE_END - TIMELINE_START;
/** Zoom maximal : six mois à l'écran. */
export const MIN_SPAN = 0.5;
/** Cadrage automatique : au moins dix ans, pour qu'une seule date ne remplisse pas l'écran. */
export const MIN_FIT_SPAN = 10;
/** Marge du cadrage automatique, de chaque côté, en part de l'étendue. */
const FIT_MARGIN = 0.08;

export type Viewport = { start: number; end: number };

export const FULL_VIEW: Viewport = { start: TIMELINE_START, end: TIMELINE_END };

/** Vrai si la date (années décimales) est sur la frise. */
export const inTimeline = (value: number) => value >= TIMELINE_START && value < TIMELINE_END;

/** Ramène la vue dans la frise, avec une étendue comprise entre MIN_SPAN et toute la frise. */
export function clampViewport({ start, end }: Viewport): Viewport {
  const span = Math.min(FULL_SPAN, Math.max(MIN_SPAN, Number.isFinite(end - start) ? end - start : FULL_SPAN));
  const center = Number.isFinite(start + end) ? (start + end) / 2 : (TIMELINE_START + TIMELINE_END) / 2;
  const s = Math.min(TIMELINE_END - span, Math.max(TIMELINE_START, center - span / 2));
  return { start: s, end: s + span };
}

/**
 * Zoom d'un facteur (> 1 : rapproche) autour d'un point de l'écran, donné en part de la largeur
 * (0 : bord gauche, 1 : bord droit) ; la date sous ce point ne bouge pas, sauf aux bords de la frise.
 */
export function zoomViewport(view: Viewport, factor: number, anchor = 0.5): Viewport {
  const span = view.end - view.start;
  const next = Math.min(FULL_SPAN, Math.max(MIN_SPAN, span / factor));
  const pivot = view.start + span * anchor;
  const start = pivot - next * anchor;
  return clampViewport({ start, end: start + next });
}

/** Déplace la vue d'une part de son étendue (négatif : vers le passé). */
export function panViewport(view: Viewport, fraction: number): Viewport {
  const shift = (view.end - view.start) * fraction;
  return clampViewport({ start: view.start + shift, end: view.end + shift });
}

/**
 * Cadre une période (début inclus, fin exclue), avec une marge ; toute la frise si elle est vide.
 * `minSpan` : étendue minimale (dix ans pour le cadrage automatique ; MIN_SPAN pour zoomer sur un
 * groupe de fiches proches, afin de les séparer).
 */
export function fitViewport(start: number, end: number, minSpan = MIN_FIT_SPAN): Viewport {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return FULL_VIEW;
  const span = Math.max(minSpan, (end - start) * (1 + 2 * FIT_MARGIN));
  const center = (start + end) / 2;
  return clampViewport({ start: center - span / 2, end: center + span / 2 });
}

/** Position horizontale (pixels) d'une date dans une frise large de `width` pixels. */
export const toX = (view: Viewport, value: number, width: number) =>
  ((value - view.start) / (view.end - view.start)) * width;

export const sameViewport = (a: Viewport, b: Viewport) => a.start === b.start && a.end === b.end;

/**
 * Vue pour zoomer sur un groupe de fiches proches (période `start`–`end`, jusqu'à six mois) ; null si
 * ce zoom ne changerait rien : la vue est déjà au zoom maximal, ou déjà cadrée sur le groupe.
 */
export function groupZoomViewport(view: Viewport, start: number, end: number): Viewport | null {
  if (view.end - view.start <= MIN_SPAN * (1 + 1e-9)) return null;
  const next = fitViewport(start, end, MIN_SPAN);
  return sameViewport(next, view) ? null : next;
}
