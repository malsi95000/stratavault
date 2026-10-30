// Formes du partage des cartes telles que l'application les manipule (voir src/lib/supabase/sharing.ts).
// Les autres membres n'y sont désignés que par leur identifiant public, leur nom affiché et des
// références opaques (uuid tirés par la base) : jamais par leur identifiant de compte.

/** Rôles qu'un propriétaire peut donner (invitation, lien, changement de rôle). */
export const MEMBER_ROLES = ["editor", "reader"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Rôle du compte connecté sur une carte. */
export type MapRole = "owner" | MemberRole;

export const isMemberRole = (value: unknown): value is MemberRole => value === "editor" || value === "reader";
export const isMapRole = (value: unknown): value is MapRole => value === "owner" || isMemberRole(value);

/** Carte partagée avec le compte connecté (section « Partagées avec moi »). */
export type SharedMap = {
  id: string;
  name: string;
  role: MemberRole;
  updated: string;
  /** Statistiques (« 2 pays annotés · … ») ; null si la carte est illisible. */
  stats: string | null;
  ownerHandle: string | null;
  ownerName: string | null;
  joinedAt: string;
};

/** Invitation à une carte reçue par le compte connecté. */
export type MapInvitation = {
  /** Référence de l'invitation (pour l'accepter ou la refuser). */
  id: string;
  mapName: string;
  role: MemberRole;
  ownerHandle: string | null;
  ownerName: string | null;
  createdAt: string;
  expiresAt: string;
};

/** Membre d'une carte du compte connecté. */
export type MapMember = { id: string; handle: string; displayName: string; role: MemberRole; since: string };
/** Invitation en attente envoyée à un contact. */
export type SentInvitation = { id: string; handle: string; displayName: string; role: MemberRole; createdAt: string; expiresAt: string };
/** Lien d'invitation actif (jamais son jeton : il n'est montré qu'à sa création). */
export type MapLink = { id: string; role: MemberRole; uses: number; maxUses: number; createdAt: string; expiresAt: string };

/** Partages d'une carte du compte connecté. */
export type MapShares = { members: MapMember[]; invitations: SentInvitation[]; links: MapLink[] };

/** Partage d'une carte du compte connecté, tel que le renvoie la base (export des données). */
export type MapShareRow = {
  mapId: string;
  kind: "member" | "invitation" | "link";
  handle: string | null;
  displayName: string | null;
  role: MemberRole;
  uses: number | null;
  maxUses: number | null;
  createdAt: string;
  expiresAt: string | null;
};

/** Aperçu d'un lien d'invitation, avant de rejoindre la carte. */
export type LinkPreview = {
  mapName: string;
  role: MemberRole;
  ownerHandle: string | null;
  ownerName: string | null;
  expiresAt: string;
  /** Ce qu'est déjà le compte pour cette carte (null : rien). */
  myRole: MapRole | null;
};

/** Réponses de la base à l'invitation d'un contact (invite_contact_to_map). */
export const INVITE_RESULTS = ["invited", "not-found", "already-member", "already-invited", "map-full", "unavailable"] as const;
export type InviteResult = (typeof INVITE_RESULTS)[number];

/** Réponses de la base quand un compte rejoint une carte (invitation acceptée, lien). */
export const JOIN_RESULTS = ["joined", "already-member", "owner", "refused", "not-found", "map-full", "memberships-full"] as const;
export type JoinResult = (typeof JOIN_RESULTS)[number];

/** Carte d'un éditeur coopératif : contenu non validé (à passer par parseMapDoc). */
export type SharedMapContent = {
  id: string;
  name: string;
  role: MapRole;
  revision: number;
  updated: string;
  data: unknown;
  ownerHandle: string | null;
  ownerName: string | null;
};

/** Verrou d'édition vu par le compte connecté. */
export type LockView =
  | { kind: "mine"; expiresAt: string }
  /** Un autre membre modifie la carte ; `holderName` null si son nom ne peut pas être montré. */
  | { kind: "other"; holderName: string | null }
  | { kind: "free" };

/** État d'une carte pour le rafraîchissement périodique. */
export type SharedMapState = { name: string; role: MapRole; revision: number; updated: string; lock: LockView };

/** Réponse à une prise (ou un renouvellement) du verrou d'édition. */
export type LockResult =
  | { status: "acquired"; expiresAt: string }
  | { status: "held"; holderName: string | null }
  | { status: "read-only" }
  | { status: "not-found" };
