"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Vrai dès que `sentinel` (un repère posé en haut de la page) est sorti de l'écran : la page a
 * défilé. Un IntersectionObserver plutôt qu'un écouteur de défilement : rien n'est calculé à chaque
 * image pendant le défilement.
 */
export function useScrolledPast(sentinel: RefObject<Element | null>): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPast(!entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [sentinel]);

  return past;
}
