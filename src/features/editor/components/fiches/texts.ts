// Textes des fiches repris de la bêta (render, lignes 656-708, et confirmations, ligne 726).
import { FLUX_LABELS } from "@/features/map-doc/types";
import type { FicheKind, FluxColor } from "@/features/map-doc/types";

/** Confirmation avant suppression depuis une fiche. */
export const DELETE_CONFIRM: Record<FicheKind, string> = {
  o: "Supprimer ce point, ses notes et les liens qui s’y rattachent ?",
  l: "Supprimer ce lien et ses notes ?",
  z: "Supprimer cette zone, ses notes et les liens qui s’y rattachent ?",
  p: "Supprimer cette balise, ses notes et les liens qui s’y rattachent ?",
  t: "Supprimer ce texte, ses notes et les liens qui s’y rattachent ?",
};

/** Titre par défaut d'une fiche de flux (la bêta affichait l'identifiant de la couleur, ex. « bleu-fonce »). */
export const fluxDefaultTitle = (color: FluxColor) => `Flux ${FLUX_LABELS[color].toLowerCase()}`;
