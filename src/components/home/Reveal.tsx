"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { initialReveal } from "./revealState";

type Props = {
  children: ReactNode;
  id?: string;
  className?: string;
  /** Retard de l'apparition (ms), pour une cascade. */
  delay?: number;
};

/**
 * Bloc qui apparaît en montant quand il entre dans l'écran (ACC-05). Visible sans JavaScript et dès
 * le rendu serveur : il n'est caché qu'après le montage, et seulement s'il est encore sous l'écran.
 * L'état passe par l'attribut `data-reveal` (aucun nouveau rendu React) ; l'animation n'utilise que
 * `opacity` et `translate`, calculés par le compositeur. Un bloc qui reçoit le focus, ou imprimé,
 * est toujours visible.
 */
export default function Reveal({ children, id, className, delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (initialReveal(element.getBoundingClientRect().top, window.innerHeight, reducedMotion) === "shown") return;
    element.dataset.reveal = "hidden";
    const show = () => {
      element.dataset.reveal = "shown";
      observer.disconnect();
      element.removeEventListener("focusin", show);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) show();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    // Atteint au clavier (Tab) avant d'être apparu : dévoilé tout de suite (voir focus-within plus bas).
    element.addEventListener("focusin", show);
    return show;
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "transition-[opacity,translate] duration-700 ease-out motion-reduce:transition-none",
        "data-[reveal=hidden]:translate-y-4 data-[reveal=hidden]:opacity-0",
        // Jamais d'anneau de focus sur un bloc invisible (WCAG 2.4.7), ni de bloc vide à l'impression.
        "focus-within:translate-none! focus-within:opacity-100! focus-within:transition-none",
        "print:translate-none! print:opacity-100!",
        className,
      )}
    >
      {children}
    </div>
  );
}
