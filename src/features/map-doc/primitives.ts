// Outils communs aux opérations sur le document (ops.ts, fiches.ts, categories.ts, styles.ts).
import type { MapDoc } from "./types";

/** Identifiant court, même forme que la bêta (horodatage base 36 + aléa). */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Coupe un texte à `max` unités UTF-16, sans couper un caractère en deux. */
export function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const code = text.charCodeAt(max - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

/** Résultat d'un ajout : le nouveau document et l'identifiant de l'élément ajouté. */
export type Added = { doc: MapDoc; id: string };
