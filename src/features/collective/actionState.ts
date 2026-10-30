// État renvoyé par les Server Actions de la carte collective aux formulaires (signalement,
// modération, avis) : uniquement des messages prévus pour l'affichage, jamais d'erreur brute.

export type CollectiveActionState = { status: "idle" | "error" | "success"; message: string };

export const INITIAL_COLLECTIVE_STATE: CollectiveActionState = { status: "idle", message: "" };

export const collectiveError = (message: string): CollectiveActionState => ({ status: "error", message });
export const collectiveSuccess = (message: string): CollectiveActionState => ({ status: "success", message });
