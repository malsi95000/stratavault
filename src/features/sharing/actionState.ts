// État renvoyé par les Server Actions du partage aux formulaires et aux boutons : uniquement des
// messages prévus pour l'affichage, jamais d'erreur brute.
import type { LinkPreview } from "./types";

export type SharingActionState = {
  status: "idle" | "error" | "success";
  message: string;
  /** Lien d'invitation tout juste créé (montré une seule fois). */
  link?: string;
  /** Carte rejointe : le navigateur peut l'ouvrir. */
  mapId?: string;
  /** Aperçu d'un lien d'invitation, avant de rejoindre la carte. */
  preview?: LinkPreview;
};

export const INITIAL_SHARING_STATE: SharingActionState = { status: "idle", message: "" };

export const sharingError = (message: string): SharingActionState => ({ status: "error", message });
export const sharingSuccess = (message: string, extra: Pick<SharingActionState, "link" | "mapId" | "preview"> = {}): SharingActionState => ({
  status: "success",
  message,
  ...extra,
});
