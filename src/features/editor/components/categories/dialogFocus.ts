// Focus dans la fenêtre « Catégories de la carte » : fonctions sans React, appliquées par
// CategoriesDialog, CategoryRow et NewCategoryForm. La fenêtre reste ouverte quand une ligne ou le
// formulaire disparaît : le focus ne doit jamais retomber sur <body>.
import { returnFocusTarget } from "@/components/dialogs/useCloseAutoFocus";
import { MAX_CATEGORIES } from "@/features/map-doc/limits";

/** Zone de la fenêtre (son contenu) dont l'élément `data-focus-fallback` (le titre) reprend le focus. */
const SCOPE = "[data-focus-scope]";

/**
 * Échap ferme la fenêtre : le champ en cours de saisie est d'abord quitté, ce qui enregistre le nom
 * (onBlur de CategoryRow). Sans cela, quand les animations sont réduites, Radix démonte la fenêtre avant
 * que le champ ne reçoive la touche, et la saisie est perdue.
 */
export function leaveFieldOnEscape(active: Element | null): void {
  if (typeof HTMLElement !== "undefined" && active instanceof HTMLElement) active.blur();
}

/**
 * Après l'ajout d'une catégorie : le champ du nom (vidé, le bouton « Ajouter » se désactive) ; au
 * plafond, le formulaire est remplacé par un message : le titre de la fenêtre.
 */
export const focusAfterAdd = (countAfter: number): "name" | "fallback" =>
  countAfter >= MAX_CATEGORIES ? "fallback" : "name";

/** Élément de repli (le titre) de la fenêtre qui contient `el`. */
export function dialogFallback(el: Element | null): HTMLElement | null {
  return returnFocusTarget({ trigger: null, scope: el?.closest(SCOPE) ?? null });
}
