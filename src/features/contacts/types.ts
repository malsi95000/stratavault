// Formes des contacts telles que l'application les manipule (voir src/lib/supabase/contacts.ts).
// Les autres membres n'y sont désignés que par leur identifiant public et par des références opaques
// (uuid tirés par la base) : jamais par leur identifiant de compte.

/** Contact du compte connecté. */
export type Contact = {
  /** Référence du contact (pour le retirer ou bloquer ce membre). */
  id: string;
  handle: string;
  displayName: string;
  avatarId: string | null;
  createdAt: string;
};

/** Demande de contact en cours, reçue ou envoyée. */
export type ContactRequest = {
  /** Référence de la demande (pour l'accepter, la refuser, l'annuler ou bloquer ce membre). */
  id: string;
  direction: "incoming" | "outgoing";
  /**
   * Identifiant, nom et avatar : null si le profil de l'autre membre ne vous est plus visible
   * (demande envoyée à un profil masqué depuis ; ses changements d'identifiant ne vous sont pas montrés).
   */
  handle: string | null;
  displayName: string | null;
  avatarId: string | null;
  createdAt: string;
};

/** Compte bloqué par le compte connecté. */
export type BlockedMember = {
  /** Référence du blocage (pour le lever). */
  id: string;
  /**
   * Identifiant du membre au moment du blocage, jamais mis à jour (pas de suivi de ses changements) ;
   * null si son profil ne vous était pas visible (blocage depuis une demande envoyée à un profil
   * masqué depuis). Rien de son profil actuel : il vous est invisible tant que le blocage dure.
   */
  handle: string | null;
  createdAt: string;
};

/** Toutes les relations du compte connecté. */
export type ContactOverview = {
  contacts: Contact[];
  incoming: ContactRequest[];
  outgoing: ContactRequest[];
  blocked: BlockedMember[];
};

/** Réponses de la base à une demande de contact (send_contact_request). */
export const SEND_RESULTS = [
  "sent",
  "not-found",
  "self",
  "already-contacts",
  "already-sent",
  "incoming-pending",
  "outgoing-full",
  "contacts-full",
  "unavailable",
] as const;
export type SendResult = (typeof SEND_RESULTS)[number];

/** Réponses de la base au blocage d'un membre (block_member). */
export const BLOCK_RESULTS = ["blocked", "already-blocked", "not-found", "self", "blocks-full"] as const;
export type BlockResult = (typeof BLOCK_RESULTS)[number];

/** Manières de désigner le membre à bloquer. */
export const BLOCK_KINDS = ["handle", "request", "contact"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
