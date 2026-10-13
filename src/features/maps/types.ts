// Échanges entre le navigateur et les Server Actions des cartes (mode compte).

/**
 * Erreurs renvoyées au navigateur, sans détail technique :
 * - unauthorized : pas de session valide ;
 * - invalid : identifiant, nom ou carte refusés par la validation ;
 * - too-large : carte au-delà de la taille maximale ;
 * - quota : espace du compte plein (nombre de cartes ou volume total) ;
 * - conflict : le contenu a changé depuis la version attendue (autre appareil) : rien n'est écrasé ;
 * - unavailable : base de données injoignable ou erreur inattendue.
 */
export type MapActionError = "unauthorized" | "invalid" | "too-large" | "quota" | "conflict" | "unavailable";

export type MapActionResult<T> = { ok: true; value: T } | { ok: false; error: MapActionError };

/**
 * Carte de la banque sans son contenu. `updated` est une date ISO 8601 ; `revision` est le numéro de
 * version du contenu, incrémenté par la base à chaque modification du contenu.
 */
export type RemoteMapInfo = { id: string; name: string; updated: string; revision: number };

/** Élément de la liste : statistiques calculées sur le serveur (null : carte illisible). */
export type RemoteMapSummary = RemoteMapInfo & { stats: string | null };

/** Carte complète ; le contenu est à valider par parseMapDoc avant usage. */
export type RemoteMap = RemoteMapInfo & { data: unknown };
