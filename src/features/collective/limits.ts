// Limites de la carte collective, appliquées par la base
// (supabase/migrations/20261020120000_collective_map.sql) et rappelées dans l'interface. Mêmes
// valeurs que la base, vérifiées par collective.sql.test.ts.

/** Titre d'un élément (caractères). */
export const MAX_ITEM_TITLE = 200;
/** Notes d'un élément (caractères). */
export const MAX_ITEM_NOTE = 2_000;
/** Sommets d'un tracé (zone, trait de flux). */
export const MAX_ITEM_PATH_POINTS = 1_000;
/** Contenu d'un élément envoyé à la base (JSON compact, octets). */
export const MAX_ITEM_BYTES = 49_152;

/** Éléments d'un même auteur (visibles ou masqués). */
export const MAX_ITEMS_PER_AUTHOR = 200;
/** Contenu de tous les éléments d'un auteur (octets, tels que la base les compte). */
export const MAX_AUTHOR_BYTES = 524_288;
/** Sommets de tous les tracés d'un auteur. */
export const MAX_AUTHOR_PATH_POINTS = 20_000;
/** Contenu ajouté par un auteur en 24 heures (octets : éléments ajoutés ou modifiés depuis). */
export const MAX_DAILY_BYTES = 131_072;
/** Sommets ajoutés par un auteur en 24 heures (tracés des éléments ajoutés ou modifiés depuis). */
export const MAX_DAILY_PATH_POINTS = 5_000;
/** Éléments de toute la carte. */
export const MAX_MAP_ITEMS = 5_000;
/** Contenu de toute la carte (octets). */
export const MAX_MAP_BYTES = 6_291_456;
/** Sommets de toute la carte. */
export const MAX_MAP_PATH_POINTS = 200_000;
/** Copies des contenus signalés, pour toute la carte (octets ; une copie par élément et par contenu). */
export const MAX_REPORT_COPIES_BYTES = 8_388_608;

/** Éléments ajoutés par jour et par compte. */
export const CREATES_PER_DAY = 50;
/** Modifications ou suppressions par jour et par compte. */
export const CHANGES_PER_DAY = 2_000;
/** Signalements par jour et par compte. */
export const REPORTS_PER_DAY = 20;
/** Lectures complètes de la carte (ou de la file de modération, du journal) par heure. */
export const READS_PER_HOUR = 240;
/** Lectures de l'état de la carte (rafraîchissement périodique) par heure. */
export const STATES_PER_HOUR = 1_200;
/** Décisions de modération par jour et par modérateur. */
export const DECISIONS_PER_DAY = 500;
/** Éléments par page de la file de modération (collective_moderation_queue). */
export const MODERATION_PAGE_SIZE = 100;
/** Dernière page demandable de la file de modération (pages numérotées à partir de 0). */
export const MAX_MODERATION_PAGE = 1_000;

/** Précisions d'un signalement et motif d'une décision (caractères). */
export const MAX_REASON_TEXT = 500;
/** Motif d'une décision : au moins ce nombre de caractères. */
export const MIN_DECISION_REASON = 3;
/** Durée d'une suspension des contributions prononcée par un modérateur (jours). */
export const SUSPENSION_DAYS = 30;
/** Avis de modération gardés par compte. */
export const MAX_NOTICES = 100;

/** Délai avant l'envoi des modifications (après la dernière). */
export const SYNC_DELAY_MS = 2_000;
/** Nouvel essai après un échec passager de l'envoi. */
export const SYNC_RETRY_MS = 5_000;
/** Rafraîchissement périodique de la carte (version). */
export const REFRESH_MS = 30_000;
