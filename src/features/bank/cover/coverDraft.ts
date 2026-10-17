// Choix du logo d'une carte en cours d'édition (dialogue d'enregistrement, banque) : aucun, une icône
// et sa couleur, ou l'aperçu de la carte. Logique pure, testée sans navigateur.
import { COVER_ICONS } from "@/features/maps/cover";
import type { CoverIcon, MapCover } from "@/features/maps/cover";
import { DEFAULT_FLUX_COLOR } from "@/features/map-doc/palette";
import type { MapColor } from "@/features/map-doc/palette";

export type CoverMode = "none" | "icon" | "preview";
export type PreviewCover = Extract<MapCover, { kind: "preview" }>;

export type CoverDraft = {
  mode: CoverMode;
  icon: CoverIcon;
  color: MapColor;
  /** Aperçu déjà calculé (ou celui de la carte) ; null tant qu'il n'est pas prêt. */
  preview: PreviewCover | null;
};

export const COVER_MODES: readonly { mode: CoverMode; label: string }[] = [
  { mode: "none", label: "Aucun" },
  { mode: "icon", label: "Icône" },
  { mode: "preview", label: "Aperçu de la carte" },
];

/** Choix de départ : le logo actuel de la carte, sinon aucun (icône et couleur par défaut prêtes). */
export function draftFrom(cover: MapCover | null | undefined): CoverDraft {
  const draft: CoverDraft = { mode: "none", icon: COVER_ICONS[0], color: DEFAULT_FLUX_COLOR, preview: null };
  if (cover?.kind === "icon") return { ...draft, mode: "icon", icon: cover.icon, color: cover.color };
  if (cover?.kind === "preview") return { ...draft, mode: "preview", preview: cover };
  return draft;
}

/** Logo à enregistrer : null pour aucun ; undefined si l'aperçu choisi n'est pas encore prêt. */
export function coverOf(draft: CoverDraft): MapCover | null | undefined {
  if (draft.mode === "none") return null;
  if (draft.mode === "icon") return { kind: "icon", icon: draft.icon, color: draft.color };
  return draft.preview ?? undefined;
}

/** Vrai si deux logos sont identiques (rien à enregistrer). */
export function sameCover(a: MapCover | null | undefined, b: MapCover | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.kind === "icon" && b.kind === "icon") return a.icon === b.icon && a.color === b.color;
  if (a.kind === "preview" && b.kind === "preview") return a.svg === b.svg;
  return false;
}

/** Description d'un logo pour les lecteurs d'écran et les infobulles. */
export function coverDescription(cover: MapCover | null | undefined, iconLabel: (icon: CoverIcon) => string): string {
  if (!cover) return "Aucun logo";
  if (cover.kind === "preview") return "Aperçu de la carte";
  return `Logo : ${iconLabel(cover.icon).toLowerCase()}`;
}
