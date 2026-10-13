// Réglages et textes du statut de la sauvegarde automatique (mode démo par défaut).

export const SAVE_DELAY_MS = 250;
export const SAVE_OK = "Enregistré dans ce navigateur";
export const SAVE_FAILED = "Enregistrement impossible : utilisez Exporter";
export const UNTITLED_MAP = "Carte sans titre";
/** Brouillon ou carte active illisible au chargement : rien n'a été écrasé. */
export const LOAD_UNREADABLE = "Carte précédente illisible : elle a été conservée sans modification";
/** Lecture de la base impossible au chargement : rien n'est écrit tant que l'utilisateur n'a pas agi. */
export const LOAD_FAILED = "Lecture impossible : enregistrement automatique suspendu, utilisez Exporter";

/** Textes du statut d'enregistrement (ils dépendent du mode : démo ou compte). */
export type PersistenceMessages = {
  /** Brouillon et carte active enregistrés. */
  saved: string;
  /** Brouillon enregistré, sans carte active. */
  draftSaved: string;
  /** Écriture locale impossible. */
  failed: string;
  /** Lecture impossible au chargement. */
  loadFailed: string;
};

export const DEMO_MESSAGES: PersistenceMessages = {
  saved: SAVE_OK,
  draftSaved: SAVE_OK,
  failed: SAVE_FAILED,
  loadFailed: LOAD_FAILED,
};

/** Carte active supprimée de la banque distante (autre appareil) : le document reste dans l'éditeur. */
export const MAP_GONE = "Carte supprimée de la banque : elle reste ici, enregistrez-la à nouveau pour la garder";

/**
 * La carte active a été modifiée dans la banque distante depuis un autre appareil (ou onglet) : elle
 * n'est pas écrasée. La version de ce navigateur est détachée de la banque et reste dans l'éditeur.
 */
export const MAP_CONFLICT =
  "Carte modifiée sur un autre appareil ou dans un autre onglet : elle n’a pas été écrasée. Votre version reste ici, enregistrez-la sous un autre nom pour la garder";

/** Banque distante (mode compte). */
export type RemoteOptions = {
  /** Statut affiché après un échec d'écriture dans la banque, et s'il faut réessayer automatiquement. */
  describeError: (error: unknown) => { status: string; retry: boolean };
  /** Délai avant un nouvel essai automatique (ms). */
  retryDelay: number;
  /** Statut quand la banque est injoignable au chargement (la copie locale est affichée). */
  loadOffline: string;
  /** Statut quand « Enregistrer dans la banque » n'a pas pu créer la carte (serveur injoignable, sans nouvel essai). */
  bankOffline: string;
};

export type PersistenceOptions = {
  /** Délai de la sauvegarde automatique après la dernière modification (ms). */
  delay?: number;
  messages?: PersistenceMessages;
  remote?: RemoteOptions;
};
