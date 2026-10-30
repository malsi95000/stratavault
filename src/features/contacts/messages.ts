// Textes des contacts (page « Contacts », boutons du profil d'un membre).
import {
  BLOCKS_PER_DAY,
  CONTACT_CHANGES_PER_DAY,
  CONTACT_REQUESTS_PER_DAY,
  MAX_BLOCKS,
  MAX_CONTACTS,
  MAX_OUTGOING_REQUESTS,
} from "./limits";
import type { BlockResult, SendResult } from "./types";

export const CONTACTS_PAGE_TITLE = "Contacts";

export const SEND_MESSAGES: Record<SendResult, string> = {
  sent: "Demande envoyée. Elle reste en attente jusqu’à sa réponse.",
  // Même texte que la recherche d'un profil : rien ne dit si l'identifiant existe (ni s'il s'agit
  // d'un membre que vous avez bloqué, ou qui vous a bloqué).
  "not-found": "Aucun profil visible ne correspond à cet identifiant exact.",
  self: "C’est votre propre identifiant.",
  "already-contacts": "Vous êtes déjà en contact avec ce membre.",
  "already-sent": "Vous avez déjà envoyé une demande à ce membre : elle est en attente.",
  "incoming-pending": "Ce membre vous a déjà envoyé une demande : acceptez-la dans « Demandes reçues ».",
  "outgoing-full": `Vous avez déjà ${MAX_OUTGOING_REQUESTS} demandes en attente : annulez-en avant d’en envoyer d’autres.`,
  "contacts-full": `Vous avez atteint la limite de ${MAX_CONTACTS} contacts : retirez-en avant d’en ajouter.`,
  unavailable: "Ce membre ne peut pas recevoir de demande pour le moment.",
};

export const BLOCK_MESSAGES: Record<BlockResult, string> = {
  blocked: "Membre bloqué : vous ne voyez plus vos profils l’un l’autre et il ne peut plus vous envoyer de demande.",
  "already-blocked": "Ce membre est déjà bloqué.",
  "not-found": "Ce membre est introuvable : rechargez la page.",
  self: "Vous ne pouvez pas vous bloquer vous-même.",
  "blocks-full": `Vous avez atteint la limite de ${MAX_BLOCKS} comptes bloqués.`,
};

export const REQUEST_ACCEPTED = "Demande acceptée : vous êtes maintenant en contact.";
export const REQUEST_REFUSED = "Demande refusée.";
export const REQUEST_CANCELLED = "Demande annulée.";
export const CONTACT_REMOVED = "Contact retiré.";
export const MEMBER_UNBLOCKED = "Membre débloqué.";
export const CONTACTS_FULL = SEND_MESSAGES["contacts-full"];
/** Demande, contact ou blocage qui n'existe plus (traité dans un autre onglet…). */
export const RELATION_GONE = "Cette demande, ce contact ou ce blocage n’existe plus : rechargez la page.";

export const HANDLE_REQUIRED = "Saisissez l’identifiant exact du membre (3 à 30 caractères).";
export const NO_PROFILE = "Créez d’abord votre profil : vos contacts vous reconnaissent à votre identifiant.";
// Le même message pour les trois limites de la base : il ne dit pas laquelle est atteinte.
export const CONTACT_RATE_LIMITED = `Trop d’opérations sur les contacts aujourd’hui (au plus ${CONTACT_REQUESTS_PER_DAY} demandes, ${BLOCKS_PER_DAY} blocages et ${CONTACT_CHANGES_PER_DAY} autres opérations par jour). Réessayez demain.`;
export const CONTACT_UNAVAILABLE = "L’opération n’a pas pu aboutir. Réessayez plus tard.";
export const CONTACT_SESSION_ENDED = "Votre session a pris fin : reconnectez-vous, puis recommencez.";
export const CONTACT_SESSION_CHANGED = "Un autre compte est maintenant ouvert dans ce navigateur : rechargez la page.";

/** Confirmations demandées avant une action. */
export const CONFIRM_REMOVE = (handle: string) =>
  `Retirer @${handle} de vos contacts ? Il ne sera pas prévenu, mais ne vous verra plus dans ses contacts.`;
export const CONFIRM_BLOCK = (handle: string | null) =>
  `Bloquer ${handle ? `@${handle}` : "ce membre"} ? Le contact et les demandes entre vous sont supprimés ; vous ne verrez plus vos profils l’un l’autre et il ne pourra plus vous envoyer de demande. Il n’en est pas prévenu. Vous pourrez le débloquer depuis la page « Contacts ».`;
export const CONFIRM_REFUSE = (handle: string | null) =>
  `Refuser la demande ${handle ? `de @${handle}` : "de ce membre"} ? Il ne sera pas prévenu.`;

/** Profil « contacts » : personne d'autre ne le trouve, donc personne ne peut lui envoyer de demande. */
export const CONTACTS_ONLY_SEND_HINT =
  "Votre profil est réservé à vos contacts : les autres membres ne le trouvent pas et ne peuvent donc pas vous envoyer de demande. C’est à vous de l’envoyer.";

/** Ligne d'un membre dont le profil ne vous est plus visible. */
export const HIDDEN_MEMBER = "Membre (profil masqué)";
/** Précision sur l'identifiant d'un compte bloqué (jamais mis à jour). */
export const BLOCKED_HANDLE_NOTE = "identifiant au moment du blocage";
