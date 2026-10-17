// Textes des fiches repris de la bêta (render, lignes 656-708, et confirmations, ligne 726).
import { erasedFicheCount } from "@/features/map-doc/ops";
import { FLUX_LABELS } from "@/features/map-doc/types";
import type { EntityKind, FicheKind, FluxColor, MapDoc } from "@/features/map-doc/types";

/** Confirmation avant suppression depuis une fiche. */
export const DELETE_CONFIRM: Record<FicheKind, string> = {
  o: "Supprimer ce point, ses notes et les liens qui s’y rattachent ?",
  l: "Supprimer ce lien et ses notes ?",
  z: "Supprimer cette zone, ses notes et les liens qui s’y rattachent ?",
  p: "Supprimer cette balise, ses notes et les liens qui s’y rattachent ?",
  t: "Supprimer ce texte, ses notes et les liens qui s’y rattachent ?",
};

/**
 * Confirmation avant suppression (fiche ou gomme), complétée par le nombre de fiches supplémentaires
 * emportées : celles de l'élément et celles des liens supprimés avec lui.
 */
export function deleteConfirm(kind: FicheKind, lostFiches: number): string {
  if (lostFiches <= 0) return DELETE_CONFIRM[kind];
  const fiches =
    lostFiches === 1
      ? "1 fiche supplémentaire sera aussi supprimée."
      : `${lostFiches} fiches supplémentaires seront aussi supprimées.`;
  return `${DELETE_CONFIRM[kind]} ${fiches}`;
}

/**
 * Gomme : confirmation à demander avant d'effacer l'élément, seulement s'il emporte des fiches
 * supplémentaires (les siennes ou celles de ses liens) ; null sinon, la gomme efface aussitôt.
 */
export function gommeConfirm(doc: MapDoc, k: EntityKind, id: string): string | null {
  if (k === "c" || k === "flux") return null;
  const lost = erasedFicheCount(doc, k, id);
  return lost > 0 ? deleteConfirm(k, lost) : null;
}

/** Titre par défaut d'une fiche de flux (la bêta affichait l'identifiant de la couleur, ex. « bleu-fonce »). */
export const fluxDefaultTitle = (color: FluxColor) => `Flux ${FLUX_LABELS[color].toLowerCase()}`;

/** Confirmation avant de supprimer une fiche supplémentaire (bêta 2.1). */
export const DELETE_EXTRA_FICHE_CONFIRM = "Supprimer cette fiche, son titre et ses notes ?";
