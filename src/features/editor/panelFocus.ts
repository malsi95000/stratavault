// Panneau des fiches : où va le focus quand la fiche affichée change, et touches du plein écran.
// Fonctions pures ; Panel.tsx et Editor.tsx les appliquent au DOM.
import type { Selection } from "@/features/map-doc/types";
import type { ShortcutAction } from "./tools";

/** Attribut de l'élément qui reçoit le focus par défaut d'une zone (le titre de la fiche). */
export const FOCUS_FALLBACK_ATTR = "data-focus-fallback";
/** Attribut d'une zone (le panneau) dont l'élément `FOCUS_FALLBACK_ATTR` reprend le focus perdu. */
export const FOCUS_SCOPE_ATTR = "data-focus-scope";
/** Attribut du bouton d'une fiche supplémentaire dans la liste « Fiches » (valeur : son identifiant). */
export const FICHE_BUTTON_ATTR = "data-fiche-button";

/** Clé de la fiche affichée : elle change quand on passe d'une fiche à une autre. */
export const ficheKey = (s: Selection) => `${s.k}:${s.id}:${s.fiche ?? ""}`;

/**
 * Élément à focaliser quand la fiche affichée change et que le focus est perdu (le bouton cliqué a
 * disparu avec l'ancienne fiche) : au retour d'une fiche supplémentaire vers la fiche principale du
 * même élément, le bouton de cette fiche dans la liste ; sinon, le titre de la nouvelle fiche.
 */
export function panelFocusTarget(prev: Selection | null, next: Selection): { ficheButton: string } | "heading" {
  const backToMain = prev?.fiche !== undefined && next.fiche === undefined && prev.k === next.k && prev.id === next.id;
  return backToMain ? { ficheButton: prev.fiche! } : "heading";
}

export type PanelFocusTarget = ReturnType<typeof panelFocusTarget>;

/**
 * Passage d'un rendu du panneau au suivant. `remember` : la fiche à mémoriser pour la comparaison
 * suivante (aucune quand le panneau est fermé : sa réouverture repart du titre). `focus` : null si la
 * fiche affichée n'a pas changé (élément recliqué, lien rouvert : le défilement est conservé) ; sinon,
 * la fiche repart en haut et ce qui reprend le focus s'il a été perdu.
 */
export function panelUpdate(
  prev: Selection | null,
  open: boolean,
  shown: Selection | null,
): { remember: Selection | null; focus: PanelFocusTarget | null } {
  if (!open || !shown) return { remember: null, focus: null };
  if (prev && ficheKey(prev) === ficheKey(shown)) return { remember: shown, focus: null };
  return { remember: shown, focus: panelFocusTarget(prev, shown) };
}

/** Échap dans le panneau en plein écran (même pendant la saisie) : le panneau revient à droite. */
export function collapsesOnEscape(e: { key: string; defaultPrevented: boolean }, expanded: boolean): boolean {
  return expanded && e.key === "Escape" && !e.defaultPrevented;
}

/**
 * Raccourci global quand la fiche est en plein écran : les outils sont masqués, leurs raccourcis
 * inactifs. Échap reste actif (`cancel` quitte alors le plein écran sans fermer la fiche).
 */
export function expandedShortcut(action: ShortcutAction, expanded: boolean): ShortcutAction {
  return expanded && action?.type === "tool" ? null : action;
}

/**
 * Raccourci global selon ce qui est affiché : en plein écran comme en vue frise, la barre d'outils est
 * masquée et la carte inerte, les raccourcis d'outils ne s'appliquent pas (une touche ne doit pas
 * changer en silence l'outil retrouvé sur la carte). Échap reste actif.
 */
export function editorShortcut(action: ShortcutAction, { expanded, frise }: { expanded: boolean; frise: boolean }): ShortcutAction {
  return expandedShortcut(action, expanded || frise);
}
