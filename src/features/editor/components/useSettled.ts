"use client";

import { useEffect, useState } from "react";

/**
 * Texte annoncé aux lecteurs d'écran une fois stable depuis `delay` millisecondes : une molette, ou une
 * saisie touche par touche, n'annonce que l'état où elle s'arrête.
 */
export function useSettled(text: string, delay: number): string {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), delay);
    return () => clearTimeout(timer);
  }, [text, delay]);
  return settled;
}
