import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { DragView } from "@/features/editor/globeDetail";
import { dragRotation } from "@/features/editor/projection";
import type { Rotation } from "@/features/editor/projection";

/** En deçà (px), un appui suivi d'un relâchement reste un clic. */
const DRAG_THRESHOLD_PX = 3;

/** État du globe au début d'un glisser. */
export type GlobeDragStart = { rotation: Rotation; radius: number; drag: DragView };

export type GlobeDragOptions = {
  /** Vrai si le glisser doit faire tourner le globe (vue globe, outil autre que lasso et pinceau). */
  active: () => boolean;
  /** Rotation, rayon du globe (px) et cadrage du zoom au moment de l'appui ; null si la carte n'est pas prête. */
  start: () => GlobeDragStart | null;
  /** Nouvelle rotation : appelé au plus une fois par image. */
  onRotate: (rotation: Rotation) => void;
  /** Début (cadrage figé) et fin (null) d'une rotation. */
  onDragChange: (drag: DragView | null) => void;
  /** Pincement à deux doigts : zoom de `ratio` autour du point (clientX, clientY). */
  onPinch: (ratio: number, clientX: number, clientY: number) => void;
  /** Fin du pincement (un doigt levé) : l'échelle atteinte peut alors être prise en compte, une seule fois. */
  onPinchEnd: () => void;
};

type Gesture =
  | { kind: "rotate"; pointerId: number; x0: number; y0: number; moved: boolean; start: GlobeDragStart }
  | { kind: "pinch"; distance: number };

type Point = { x: number; y: number };

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Vue globe : le glisser fait tourner le globe (souris, stylet ou un doigt), deux doigts zooment.
 * La rotation est transmise au plus une fois par image (requestAnimationFrame). Un glisser qui a fait
 * tourner le globe ne compte pas comme un clic (consumeClick).
 */
export function useGlobeDrag(options: GlobeDragOptions) {
  const optionsRef = useRef(options);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef(0);
  const pendingRotation = useRef<Rotation | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return useMemo(() => {
    function scheduleRotation(rotation: Rotation) {
      pendingRotation.current = rotation;
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const next = pendingRotation.current;
        pendingRotation.current = null;
        if (next) optionsRef.current.onRotate(next);
      });
    }

    /** Fin d'une rotation : dernière position appliquée tout de suite, puis retour à la pleine résolution. */
    function endRotation() {
      const g = gesture.current;
      if (g?.kind !== "rotate" || !g.moved) return;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      const last = pendingRotation.current;
      pendingRotation.current = null;
      if (last) optionsRef.current.onRotate(last);
      optionsRef.current.onDragChange(null);
    }

    /** Vrai pendant une rotation effective (seuil franchi, pointeur pas encore relâché). */
    function isRotating(): boolean {
      const g = gesture.current;
      return g?.kind === "rotate" && g.moved;
    }

    function onPointerDown(ev: ReactPointerEvent<SVGSVGElement>) {
      // Tout nouvel appui principal ouvre un nouveau clic, même hors rotation (planisphère, lasso…) : un
      // glisser au doigt ou relâché hors de la fenêtre n'a pas produit de clic qui aurait remis l'indicateur.
      if (ev.isPrimary) suppressClick.current = false;
      if (!optionsRef.current.active() || (ev.pointerType === "mouse" && ev.button !== 0)) return;
      // Souris : un seul pointeur (un relâchement hors de la carte, avant capture, n'a pas été vu).
      // Les doigts sont capturés d'office par le <svg> : leur relâchement arrive toujours.
      if (ev.pointerType !== "touch") {
        // Rotation restée ouverte (relâchement non reçu) : elle est terminée avant d'en commencer une autre.
        endRotation();
        gesture.current = null;
        pointers.current.clear();
      }
      if (pointers.current.size === 0) suppressClick.current = false;
      pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.current.size === 1) {
        const start = optionsRef.current.start();
        gesture.current = start
          ? { kind: "rotate", pointerId: ev.pointerId, x0: ev.clientX, y0: ev.clientY, moved: false, start }
          : null;
      } else if (pointers.current.size === 2) {
        // Second doigt : la rotation s'arrête là où elle est, le pincement zoome.
        endRotation();
        const [a, b] = [...pointers.current.values()];
        gesture.current = { kind: "pinch", distance: distance(a, b) };
        suppressClick.current = true;
      }
    }

    function onPointerMove(ev: ReactPointerEvent<SVGSVGElement>) {
      if (!pointers.current.has(ev.pointerId)) return;
      // Souris ou stylet sans bouton enfoncé : le relâchement a eu lieu hors de la carte, avant la capture
      // (seuil de 3 px), et n'a pas été reçu. Le geste se termine ici : le survol ne fait jamais tourner le globe.
      if (ev.pointerType !== "touch" && (ev.buttons & 1) === 0) return onPointerEnd(ev);
      pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const g = gesture.current;
      if (g?.kind === "rotate" && g.pointerId === ev.pointerId) {
        const dx = ev.clientX - g.x0;
        const dy = ev.clientY - g.y0;
        if (!g.moved) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          // Capture seulement maintenant : un simple clic garde sa cible (pays, balise…).
          g.moved = true;
          suppressClick.current = true;
          ev.currentTarget.setPointerCapture(ev.pointerId);
          optionsRef.current.onDragChange(g.start.drag);
        }
        scheduleRotation(dragRotation(g.start.rotation, dx, dy, g.start.drag.k, g.start.radius));
      } else if (g?.kind === "pinch" && pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        const d = distance(a, b);
        if (g.distance > 0 && d > 0) optionsRef.current.onPinch(d / g.distance, (a.x + b.x) / 2, (a.y + b.y) / 2);
        g.distance = d;
      }
    }

    function onPointerEnd(ev: ReactPointerEvent<SVGSVGElement>) {
      if (!pointers.current.delete(ev.pointerId)) return;
      const g = gesture.current;
      if (g?.kind === "rotate" && g.pointerId === ev.pointerId) endRotation();
      if (g?.kind === "pinch" && pointers.current.size < 2) optionsRef.current.onPinchEnd();
      // Après un pincement, le doigt restant ne fait plus rien jusqu'au prochain appui.
      if (g?.kind === "rotate" ? g.pointerId === ev.pointerId : pointers.current.size < 2) gesture.current = null;
    }

    /** Vrai (une fois) si le clic qui suit vient d'un glisser ou d'un pincement : il est alors ignoré. */
    function consumeClick(): boolean {
      const suppressed = suppressClick.current;
      suppressClick.current = false;
      return suppressed;
    }

    return {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      consumeClick,
      isRotating,
    };
  }, []);
}
