// Limites du partage des cartes, appliquées par la base (supabase/migrations/20261019120000_map_sharing.sql)
// et rappelées dans les textes de l'interface. Mêmes valeurs que la base, vérifiées par sharing.sql.test.ts.

/** Membres et invitations en attente, au plus, par carte (le propriétaire n'est pas compté). */
export const MAX_MAP_SEATS = 50;
/** Liens d'invitation actifs, au plus, par carte. */
export const MAX_ACTIVE_LINKS = 10;
/** Usages d'un lien d'invitation, au plus. */
export const MAX_LINK_USES = 50;
/** Durée de validité d'un lien, au plus (heures : 30 jours). */
export const MAX_LINK_HOURS = 720;
/** Durée de validité d'une invitation d'un contact (jours). */
export const INVITATION_DAYS = 30;
/** Cartes partagées avec un compte, au plus. */
export const MAX_SHARED_MAPS = 200;
/** Invitations reçues en attente, au plus, par compte. */
export const MAX_PENDING_INVITATIONS = 100;
/** Partages par jour et par compte (invitations de contacts et liens créés). */
export const SHARES_PER_DAY = 100;
/** Essais de lien par jour et par compte (aperçu ou acceptation, comptés qu'ils aboutissent ou non). */
export const LINK_ATTEMPTS_PER_DAY = 60;
/** Autres opérations par jour (rôle, retrait, départ, réponse, annulation, révocation). */
export const SHARE_CHANGES_PER_DAY = 300;
/** Prises, renouvellements et libérations du verrou d'édition, par heure. */
export const LOCK_CALLS_PER_HOUR = 600;
/** Lectures complètes de cartes partagées, par heure. */
export const SHARED_READS_PER_HOUR = 600;
/** Lectures de l'état d'une carte partagée (version et verrou : rafraîchissement périodique), par heure. */
export const SHARED_STATES_PER_HOUR = 1_200;

/** Durée du bail du verrou d'édition (millisecondes) : deux minutes. */
export const LOCK_LEASE_MS = 2 * 60_000;
/** Renouvellement du bail tant que l'éditeur est actif. */
export const LOCK_RENEW_MS = 40_000;
/** Sans activité pendant ce délai, l'éditeur rend la main (le bail n'est plus renouvelé). */
export const EDITOR_IDLE_MS = 5 * 60_000;
/** Rafraîchissement périodique des lecteurs (et de l'état du verrou). */
export const REFRESH_MS = 15_000;
/** Délai avant l'envoi des modifications de l'éditeur. */
export const SHARED_SAVE_DELAY_MS = 1_000;
