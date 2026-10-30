// Limites des contacts, appliquées par la base (supabase/migrations/20261018120000_contacts.sql) et
// rappelées dans les textes de l'interface. Mêmes valeurs que la base, vérifiées par contacts.sql.test.ts.

/** Demandes de contact par jour et par compte (essais comptés, qu'ils aboutissent ou non). */
export const CONTACT_REQUESTS_PER_DAY = 30;
/** Demandes envoyées en attente, au plus, par compte. */
export const MAX_OUTGOING_REQUESTS = 50;
/** Demandes reçues en attente, au plus, par compte (au-delà, la demande est refusée). */
export const MAX_INCOMING_REQUESTS = 200;
/** Contacts, au plus, par compte. */
export const MAX_CONTACTS = 1000;
/** Blocages par jour et par compte. */
export const BLOCKS_PER_DAY = 50;
/** Comptes bloqués, au plus, par compte. */
export const MAX_BLOCKS = 1000;
/** Autres opérations par jour (accepter, refuser, annuler, retirer, débloquer). */
export const CONTACT_CHANGES_PER_DAY = 300;
