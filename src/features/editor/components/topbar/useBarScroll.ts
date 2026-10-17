"use client";

import { useEffect, useRef, useState } from "react";
import { NO_EDGES, barEdges, sameEdges, wheelScrollLeft } from "./barScroll";
import type { BarEdges } from "./barScroll";

/**
 * Barre du haut qui défile horizontalement : la molette verticale la fait défiler, un dégradé
 * signale les boutons cachés (sa barre de défilement est masquée), et elle revient au début quand le
 * focus la quitte (le logo n'y reste pas coupé après un passage au clavier sur les derniers boutons).
 */
export function useBarScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState<BarEdges>(NO_EDGES);

  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const update = () => {
      const next = barEdges(bar.scrollLeft, bar.scrollWidth, bar.clientWidth);
      setEdges((prev) => (sameEdges(prev, next) ? prev : next));
    };
    const onWheel = (event: WheelEvent) => {
      const next = wheelScrollLeft(bar.scrollLeft, bar.scrollWidth, bar.clientWidth, event);
      if (next === null) return;
      event.preventDefault();
      bar.scrollLeft = next;
    };
    const onFocusOut = (event: FocusEvent) => {
      const to = event.relatedTarget;
      if (!(to instanceof Node) || !bar.contains(to)) bar.scrollLeft = 0;
    };
    update();
    bar.addEventListener("scroll", update, { passive: true });
    bar.addEventListener("wheel", onWheel, { passive: false });
    bar.addEventListener("focusout", onFocusOut);
    // La largeur change avec la fenêtre, le panneau ouvert, ou le contenu (nombre de filtres, e-mail).
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    for (const child of bar.children) observer.observe(child);
    return () => {
      bar.removeEventListener("scroll", update);
      bar.removeEventListener("wheel", onWheel);
      bar.removeEventListener("focusout", onFocusOut);
      observer.disconnect();
    };
  }, []);

  return { ref, edges };
}
