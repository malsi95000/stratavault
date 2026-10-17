"use client";

import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { Viewport } from "@/features/timeline/viewport";
import { createGestureController } from "./gestureController";
import type { GestureController } from "./gestureController";

/**
 * Gestes de la frise : molette pour zoomer autour du pointeur (défilement horizontal ou Maj + molette
 * pour se déplacer), glisser pour se déplacer dans le temps. Un glisser n'ouvre pas la fiche sous le
 * pointeur à son relâchement. La logique est dans gestureController.
 */
export function useTimelineGestures(
  trackRef: RefObject<HTMLElement | null>,
  view: Viewport,
  onChange: (view: Viewport) => void,
) {
  // Vue et rappel courants, lus par le contrôleur créé une seule fois.
  const latest = useRef({ view, onChange });
  useEffect(() => {
    latest.current = { view, onChange };
  });
  // Contrôleur créé au premier geste (jamais pendant le rendu), puis gardé.
  const controller = useRef<GestureController | null>(null);
  const gestures = () =>
    (controller.current ??= createGestureController({
      getView: () => latest.current.view,
      onChange: (next) => latest.current.onChange(next),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (id) => cancelAnimationFrame(id),
    }));
  useEffect(() => () => controller.current?.dispose(), []);

  // Molette : écouteur natif non passif, pour empêcher le défilement de la page quand la frise la garde.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const width = el.clientWidth;
      const anchor = width > 0 ? (e.clientX - el.getBoundingClientRect().left) / width : 0.5;
      if (gestures().wheel(e, width, anchor)) e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [trackRef]);

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => gestures().pointerDown(e),
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const target = e.currentTarget;
      gestures().pointerMove(e, target.clientWidth, () => target.setPointerCapture(e.pointerId));
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => gestures().pointerUp(e),
    onPointerCancel: () => gestures().pointerCancel(),
    /** À poser en phase de capture : un glisser terminé n'est pas un clic. */
    onClickCapture: (e: { stopPropagation: () => void; preventDefault: () => void }) => gestures().clickCapture(e),
  };
}
