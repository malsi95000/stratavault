// État des gestes de la frise (molette, glisser, clic après un glisser), sans React ni DOM : le hook
// useTimelineGestures le branche sur la bande.
import { dragViewport, wheelToViewport } from "@/features/timeline/gestures";
import type { DragStart, WheelInput } from "@/features/timeline/gestures";
import { sameViewport } from "@/features/timeline/viewport";
import type { Viewport } from "@/features/timeline/viewport";

export type GestureDeps = {
  /** Vue affichée. */
  getView: () => Viewport;
  onChange: (view: Viewport) => void;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
};

export type PointerInput = { pointerId: number; clientX: number };

/**
 * Une molette de pavé tactile envoie 60 à 120 événements par seconde : la vue n'est transmise qu'une
 * fois par image. La vue en attente sert de départ aux événements suivants de la même image, pour
 * qu'aucun cran ne soit perdu.
 */
export function createGestureController(deps: GestureDeps) {
  let pending: Viewport | null = null;
  let frame: number | null = null;
  let drag: (DragStart & { pointerId: number }) | null = null;
  let suppressClick = false;

  const current = () => pending ?? deps.getView();
  const schedule = (next: Viewport) => {
    pending = next;
    if (frame !== null) return;
    frame = deps.requestFrame(() => {
      frame = null;
      const view = pending;
      pending = null;
      if (view) deps.onChange(view);
    });
  };

  return {
    /** Molette : vrai si elle est gardée par la frise (l'appelant empêche alors le défilement de la page). */
    wheel(e: WheelInput, width: number, anchor: number): boolean {
      const from = current();
      const next = wheelToViewport(from, e, width, anchor);
      if (!next) return false;
      if (!sameViewport(next, from)) schedule(next);
      return true;
    },
    pointerDown(e: PointerInput & { isPrimary: boolean; button: number }) {
      suppressClick = false;
      if (!e.isPrimary || e.button !== 0) return;
      drag = { pointerId: e.pointerId, x: e.clientX, view: deps.getView(), moved: false };
    },
    /** `capture` est appelé quand l'appui devient un glisser (capture du pointeur). */
    pointerMove(e: PointerInput, width: number, capture: () => void) {
      if (!drag || drag.pointerId !== e.pointerId) return;
      const next = dragViewport(drag, e.clientX, width);
      if (!next) return;
      if (!drag.moved) {
        drag.moved = true;
        capture();
      }
      schedule(next);
    },
    pointerUp(e: Pick<PointerInput, "pointerId">) {
      if (drag?.pointerId !== e.pointerId) return;
      suppressClick = drag.moved;
      drag = null;
    },
    pointerCancel() {
      drag = null;
    },
    /** À poser en phase de capture : un glisser terminé n'est pas un clic. */
    clickCapture(e: { stopPropagation: () => void; preventDefault: () => void }) {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    },
    dispose() {
      if (frame !== null) deps.cancelFrame(frame);
      frame = null;
      pending = null;
    },
  };
}

export type GestureController = ReturnType<typeof createGestureController>;
