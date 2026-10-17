// Gestes de la frise traduits en vues : molette (zoom ou déplacement) et glisser. Fonctions pures.
import { panViewport, sameViewport, zoomViewport } from "./viewport";
import type { Viewport } from "./viewport";

/** Sensibilité de la molette : facteur de zoom par pixel de défilement. */
export const WHEEL_ZOOM = 0.0015;
/** Hauteur d'une ligne (pixels) quand le navigateur compte le défilement en lignes (deltaMode 1). */
export const WHEEL_LINE_PX = 16;
/** Déplacement (pixels) au-delà duquel un appui devient un glisser, et non plus un clic. */
export const DRAG_THRESHOLD = 4;

export type WheelInput = { deltaX: number; deltaY: number; deltaMode: number; shiftKey: boolean };

/**
 * Vue après un cran de molette sur une frise large de `width` pixels, le pointeur à `anchor` (part de la
 * largeur). Maj + molette, ou défilement surtout horizontal (pavé tactile) : déplacement ; sinon zoom
 * autour du pointeur.
 *
 * null : la molette est laissée à la page (zoom sans effet, déjà au maximum ou sur toute la frise), qui
 * peut alors défiler vers les listes. Un déplacement est toujours gardé, même bloqué au bord de la frise :
 * un balayage horizontal laissé au navigateur pourrait revenir à la page précédente.
 */
export function wheelToViewport(view: Viewport, e: WheelInput, width: number, anchor: number): Viewport | null {
  if (width <= 0) return null;
  const unit = e.deltaMode === 1 ? WHEEL_LINE_PX : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;
  const pan = e.shiftKey ? dy || dx : Math.abs(dx) > Math.abs(dy) ? dx : 0;
  if (pan !== 0) return panViewport(view, pan / width);
  if (dy === 0) return null;
  const next = zoomViewport(view, Math.exp(-dy * WHEEL_ZOOM), anchor);
  return sameViewport(next, view) ? null : next;
}

/** Appui en cours : position et vue au moment de l'appui, et s'il est déjà devenu un glisser. */
export type DragStart = { x: number; view: Viewport; moved: boolean };

/**
 * Vue pendant un glisser, le pointeur en `clientX` ; null tant que l'appui reste un clic (moins de
 * DRAG_THRESHOLD pixels). La vue suit le pointeur : glisser vers la droite remonte le temps.
 */
export function dragViewport(drag: DragStart, clientX: number, width: number): Viewport | null {
  if (width <= 0) return null;
  const dx = clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD) return null;
  return panViewport(drag.view, -dx / width);
}
