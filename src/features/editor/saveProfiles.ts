// Réglages de la sauvegarde selon le mode : démo locale (comme la bêta) ou compte (banque distante).
import { MAX_ACCOUNT_SIZE_LABEL, MAX_MAPS_PER_ACCOUNT, MAX_MAP_SIZE_LABEL } from "@/features/maps/limits";
import { RemoteBankError } from "@/features/storage";
import type { StorageMode } from "@/features/storage";
import { DEMO_MESSAGES, MAP_CONFLICT, SAVE_DELAY_MS, SAVE_FAILED } from "./saveStatus";
import type { PersistenceOptions } from "./saveStatus";

/** Mode compte : chaque envoi part au serveur, on attend une pause plus longue dans la saisie. */
export const ACCOUNT_SAVE_DELAY_MS = 1000;
/** Nouvel essai automatique après une erreur réseau. */
export const ACCOUNT_RETRY_DELAY_MS = 10_000;

export const ACCOUNT_SAVED = "Enregistré";
export const ACCOUNT_DRAFT_SAVED = "Brouillon enregistré dans ce navigateur";
export const ACCOUNT_LOAD_FAILED =
  "Chargement impossible : enregistrement automatique suspendu, rechargez la page ou utilisez Exporter";

export const REMOTE_OFFLINE = "Serveur injoignable : modifications gardées dans ce navigateur, nouvel essai automatique";
/** Banque injoignable au chargement : la copie de ce navigateur est affichée. */
export const REMOTE_LOAD_OFFLINE =
  "Serveur injoignable : copie de ce navigateur affichée, vos modifications y sont gardées";
/** « Enregistrer dans la banque » : la carte n'a pas été créée, et ne le sera pas sans nouvelle demande. */
export const REMOTE_BANK_OFFLINE =
  "Serveur injoignable : carte non enregistrée dans la banque, réessayez (elle reste dans ce navigateur)";
export const REMOTE_SIGNED_OUT = "Session expirée : reconnectez-vous, vos modifications sont gardées dans ce navigateur";
export const REMOTE_TOO_LARGE = `Carte trop volumineuse pour votre compte (${MAX_MAP_SIZE_LABEL} maximum) : utilisez Exporter`;
export const REMOTE_REFUSED = "Carte refusée par le serveur : utilisez Exporter";
export const REMOTE_QUOTA = `Espace du compte plein (${MAX_MAPS_PER_ACCOUNT} cartes ou ${MAX_ACCOUNT_SIZE_LABEL} au total) : supprimez des cartes, ou utilisez Exporter`;

/** Statut d'un échec d'écriture dans la banque distante ; seules les erreurs passagères sont réessayées. */
export function describeRemoteError(error: unknown): { status: string; retry: boolean } {
  const reason = error instanceof RemoteBankError ? error.reason : "network";
  switch (reason) {
    case "unauthorized":
      return { status: REMOTE_SIGNED_OUT, retry: false };
    case "too-large":
      return { status: REMOTE_TOO_LARGE, retry: false };
    case "invalid":
      return { status: REMOTE_REFUSED, retry: false };
    case "quota":
      return { status: REMOTE_QUOTA, retry: false };
    case "conflict":
      return { status: MAP_CONFLICT, retry: false };
    default:
      return { status: REMOTE_OFFLINE, retry: true };
  }
}

/**
 * Texte du statut avant toute écriture. En mode compte, sans carte active, seul le brouillon local
 * est enregistré automatiquement (tant que la carte n'est pas dans la banque).
 */
export function idleStatus(mode: StorageMode, hasActiveMap: boolean): string {
  return mode.kind === "account" && hasActiveMap
    ? "Enregistrement automatique dans votre compte"
    : "Enregistrement automatique dans ce navigateur";
}

export function persistenceOptionsFor(mode: StorageMode): PersistenceOptions {
  if (mode.kind === "demo") return { delay: SAVE_DELAY_MS, messages: DEMO_MESSAGES };
  return {
    delay: ACCOUNT_SAVE_DELAY_MS,
    messages: {
      saved: ACCOUNT_SAVED,
      draftSaved: ACCOUNT_DRAFT_SAVED,
      failed: SAVE_FAILED,
      loadFailed: ACCOUNT_LOAD_FAILED,
    },
    remote: {
      describeError: describeRemoteError,
      retryDelay: ACCOUNT_RETRY_DELAY_MS,
      loadOffline: REMOTE_LOAD_OFFLINE,
      bankOffline: REMOTE_BANK_OFFLINE,
    },
  };
}
