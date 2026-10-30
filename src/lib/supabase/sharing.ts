import "server-only";

// Accès au partage des cartes (supabase/migrations/20261019120000_map_sharing.sql) avec le jeton de la
// session du compte connecté. Les tables ne sont pas accessibles par l'API : tout passe par les
// fonctions de la base, qui vérifient auth.uid(), appliquent les limites anti-abus et ne renvoient
// jamais l'identifiant de compte d'un autre membre. Les réponses attendues (« not-found »,
// « already-member »…) sont des statuts ; seuls les vrais refus (limite atteinte, session…) sont des
// erreurs. Le contenu d'une carte partagée s'écrit par update_map_data, comme celui de ses propres
// cartes (contrôle de version), et seulement avec le verrou d'édition pour un éditeur.
import type { SupabaseClient } from "@supabase/supabase-js";
import { portableDoc } from "@/features/map-doc/schemaV2";
import type { MapDoc } from "@/features/map-doc/types";
import {
  INVITE_RESULTS,
  JOIN_RESULTS,
  isMapRole,
  isMemberRole,
  type InviteResult,
  type JoinResult,
  type LinkPreview,
  type LockResult,
  type MapInvitation,
  type MapRole,
  type MapShareRow,
  type MapShares,
  type MemberRole,
  type SharedMap,
  type SharedMapContent,
  type SharedMapState,
} from "@/features/sharing/types";
import type { Database } from "./database";
import { statsText } from "./maps";

type Db = SupabaseClient<Database>;

/**
 * Échec classé pour l'interface ; jamais le message brut de la base :
 * - locked : un autre membre tient le verrou d'édition (ou le compte n'a plus le droit d'écrire) ;
 * - conflict : la carte a changé depuis la version attendue ;
 * - too-large / invalid : contenu refusé ; quota : espace du compte du propriétaire plein ;
 * - links-full : 10 liens actifs ; no-profile : profil requis.
 */
export type SharingErrorKind =
  | "no-profile"
  | "rate-limited"
  | "invalid"
  | "not-found"
  | "links-full"
  | "locked"
  | "conflict"
  | "too-large"
  | "quota"
  | "unauthorized"
  | "unavailable";

export class SharingDataError extends Error {
  constructor(readonly kind: SharingErrorKind) {
    super(`sharing: ${kind}`);
  }
}

type DbError = { code?: string; message?: string };

const RAISED_ERRORS = new Map<string, SharingErrorKind>([
  ["sharing_no_profile", "no-profile"],
  ["sharing_rate_limited", "rate-limited"],
  ["sharing_invalid", "invalid"],
  ["maps_locked", "locked"],
  ["maps_conflict", "conflict"],
  ["maps_too_large", "too-large"],
  ["maps_invalid", "invalid"],
  // Écriture d'un éditeur : elle compte dans l'espace du compte du propriétaire (500 cartes, 50 Mo).
  ["maps_quota_exceeded", "quota"],
]);

/** Classe une erreur de PostgREST (codes PostgreSQL et nom de l'erreur levée par la base). */
export function classifySharingError(error: DbError): SharingErrorKind {
  if (error.code === "P0001") return RAISED_ERRORS.get(error.message ?? "") ?? "unavailable";
  // Contrainte de la table des cartes (taille du contenu, forme).
  if (error.code === "23514") return error.message?.includes("maps_data_size") ? "too-large" : "invalid";
  if (error.code === "22P02") return "invalid";
  if (error.code === "42501" || error.code?.startsWith("PGRST3")) return "unauthorized";
  return "unavailable";
}

function fail(error: DbError): never {
  const kind = classifySharingError(error);
  // Seul le code est journalisé : jamais un jeton, une référence ni le contenu d'une carte.
  if (kind === "unavailable") console.error(`[sharing] Requête refusée (code ${error.code ?? "inconnu"}).`);
  throw new SharingDataError(kind);
}

/** Statut renvoyé par une fonction de la base, s'il fait partie des réponses prévues ; sinon erreur. */
function expectStatus<T extends string>(data: unknown, allowed: readonly T[]): T {
  if (typeof data === "string" && (allowed as readonly string[]).includes(data)) return data as T;
  return fail({});
}

const memberRole = (value: unknown): MemberRole => (isMemberRole(value) ? value : fail({}));
const mapRole = (value: unknown): MapRole => (isMapRole(value) ? value : fail({}));

const toIso = (timestamp: string) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString();
};

// ---------------------------------------------------------------------------------------------
// Partager (propriétaire).
// ---------------------------------------------------------------------------------------------

/** Invite le contact `contactId` (référence de my_contacts) à rejoindre la carte `mapId`. */
export async function inviteContact(db: Db, mapId: string, contactId: string, role: MemberRole): Promise<InviteResult> {
  const { data, error } = await db.rpc("invite_contact_to_map", { p_map: mapId, p_contact: contactId, p_role: role });
  if (error) fail(error);
  return expectStatus(data, INVITE_RESULTS);
}

/** Annule l'invitation `invitationId` d'une carte du compte. */
export async function cancelInvitation(db: Db, invitationId: string): Promise<"cancelled" | "not-found"> {
  const { data, error } = await db.rpc("cancel_map_invitation", { p_invitation: invitationId });
  if (error) fail(error);
  return expectStatus(data, ["cancelled", "not-found"] as const);
}

/**
 * Crée un lien d'invitation et renvoie son jeton (64 caractères hexadécimaux, montré une seule fois).
 * Carte introuvable ou 10 liens actifs : erreurs « not-found » et « links-full » (la base répond par
 * un statut, pour que l'essai reste compté dans sa limite).
 */
export async function createLink(
  db: Db,
  mapId: string,
  options: { role: MemberRole; maxUses: number; hours: number },
): Promise<string> {
  const { data, error } = await db.rpc("create_map_link", {
    p_map: mapId,
    p_role: options.role,
    p_max_uses: options.maxUses,
    p_hours: options.hours,
  });
  if (error) fail(error);
  const row = data?.[0];
  if (row?.status === "not-found" || row?.status === "links-full") throw new SharingDataError(row.status);
  const token = row?.status === "created" ? row.token : null;
  return typeof token === "string" && /^[0-9a-f]{64}$/.test(token) ? token : fail({});
}

/** Révoque le lien `linkId` d'une carte du compte. */
export async function revokeLink(db: Db, linkId: string): Promise<"revoked" | "not-found"> {
  const { data, error } = await db.rpc("revoke_map_link", { p_link: linkId });
  if (error) fail(error);
  return expectStatus(data, ["revoked", "not-found"] as const);
}

/** Change le rôle du membre `memberId` d'une carte du compte. */
export async function setMemberRole(db: Db, memberId: string, role: MemberRole): Promise<"updated" | "not-found"> {
  const { data, error } = await db.rpc("set_map_member_role", { p_member: memberId, p_role: role });
  if (error) fail(error);
  return expectStatus(data, ["updated", "not-found"] as const);
}

/** Retire le membre `memberId` d'une carte du compte. */
export async function removeMember(db: Db, memberId: string): Promise<"removed" | "not-found"> {
  const { data, error } = await db.rpc("remove_map_member", { p_member: memberId });
  if (error) fail(error);
  return expectStatus(data, ["removed", "not-found"] as const);
}

/**
 * Partages des cartes du compte : `mapId` pour une seule carte, sinon toutes (export des données).
 * `missingAsEmpty` (export) : une base d'avant le partage (fonction absente, PGRST202) n'en a aucun.
 */
export async function listMapShareRows(db: Db, mapId: string | null, options: { missingAsEmpty?: boolean } = {}): Promise<MapShareRow[]> {
  const { data, error } = await db.rpc("my_map_shares", { p_map: mapId });
  if (error) {
    if (options.missingAsEmpty && error.code === "PGRST202") return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({
    mapId: row.map_id,
    kind: row.kind === "member" || row.kind === "invitation" || row.kind === "link" ? row.kind : fail({}),
    handle: row.handle,
    displayName: row.display_name,
    role: memberRole(row.role),
    uses: row.uses,
    maxUses: row.max_uses,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

/** Membres, invitations en attente et liens actifs de la carte `mapId` du compte. */
export async function getMapShares(db: Db, mapId: string): Promise<MapShares> {
  const { data, error } = await db.rpc("my_map_shares", { p_map: mapId });
  if (error) fail(error);
  const shares: MapShares = { members: [], invitations: [], links: [] };
  for (const row of data ?? []) {
    const role = memberRole(row.role);
    if (row.kind === "member" && row.handle && row.display_name) {
      shares.members.push({ id: row.id, handle: row.handle, displayName: row.display_name, role, since: row.created_at });
    } else if (row.kind === "invitation" && row.handle && row.display_name && row.expires_at) {
      shares.invitations.push({
        id: row.id,
        handle: row.handle,
        displayName: row.display_name,
        role,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      });
    } else if (row.kind === "link" && row.uses !== null && row.max_uses !== null && row.expires_at) {
      shares.links.push({ id: row.id, role, uses: row.uses, maxUses: row.max_uses, createdAt: row.created_at, expiresAt: row.expires_at });
    }
  }
  return shares;
}

/** Nom d'une carte du compte connecté (page « Partager ») ; null si elle n'existe pas ou n'est pas à lui. */
export async function getOwnMapName(db: Db, userId: string, mapId: string): Promise<string | null> {
  const { data, error } = await db.from("maps").select("name").eq("id", mapId).eq("user_id", userId).maybeSingle();
  if (error) fail(error);
  return data?.name ?? null;
}

// ---------------------------------------------------------------------------------------------
// Rejoindre, quitter (membre).
// ---------------------------------------------------------------------------------------------

type JoinRow = { status: string; map_id: string | null };

function joinOutcome(data: JoinRow[] | null): { status: JoinResult; mapId: string | null } {
  const row = data?.[0];
  if (!row) return fail({});
  return { status: expectStatus(row.status, JOIN_RESULTS), mapId: row.map_id };
}

/** Accepte (`accept`) ou refuse l'invitation reçue `invitationId`. */
export async function answerInvitation(db: Db, invitationId: string, accept: boolean) {
  const { data, error } = await db.rpc("answer_map_invitation", { p_invitation: invitationId, p_accept: accept });
  if (error) fail(error);
  return joinOutcome(data);
}

/** Aperçu du lien de jeton `token` ; null pour un lien inutilisable (inconnu, échu, épuisé, révoqué…). */
export async function previewLink(db: Db, token: string): Promise<LinkPreview | null> {
  const { data, error } = await db.rpc("preview_map_link", { p_token: token });
  if (error) fail(error);
  const row = data?.[0];
  if (!row) return null;
  return {
    mapName: row.map_name,
    role: memberRole(row.role),
    ownerHandle: row.owner_handle,
    ownerName: row.owner_display_name,
    expiresAt: row.expires_at,
    myRole: row.my_role === null ? null : mapRole(row.my_role),
  };
}

/** Rejoint la carte du lien de jeton `token`. */
export async function acceptLink(db: Db, token: string) {
  const { data, error } = await db.rpc("accept_map_link", { p_token: token });
  if (error) fail(error);
  return joinOutcome(data);
}

/** Quitte la carte partagée `mapId`. */
export async function leaveMap(db: Db, mapId: string): Promise<"left" | "not-found"> {
  const { data, error } = await db.rpc("leave_shared_map", { p_map: mapId });
  if (error) fail(error);
  return expectStatus(data, ["left", "not-found"] as const);
}

type ListOptions = { missingAsEmpty?: boolean };
const isMissing = (error: DbError, options: ListOptions) => options.missingAsEmpty === true && error.code === "PGRST202";

/** Cartes partagées avec le compte connecté, des plus récemment modifiées aux plus anciennes. */
export async function listSharedWithMe(db: Db, options: ListOptions = {}): Promise<SharedMap[]> {
  const { data, error } = await db.rpc("maps_shared_with_me");
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    role: memberRole(row.role),
    updated: toIso(row.updated_at),
    stats: statsText(row.stats),
    ownerHandle: row.owner_handle,
    ownerName: row.owner_display_name,
    joinedAt: row.joined_at,
  }));
}

/** Invitations à des cartes reçues par le compte connecté. */
export async function listMapInvitations(db: Db, options: ListOptions = {}): Promise<MapInvitation[]> {
  const { data, error } = await db.rpc("my_map_invitations");
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    mapName: row.map_name,
    role: memberRole(row.role),
    ownerHandle: row.owner_handle,
    ownerName: row.owner_display_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

/** Verrous d'édition tenus par le compte connecté (export des données). */
export async function listOwnLocks(db: Db, options: ListOptions = {}) {
  const { data, error } = await db.rpc("my_map_locks");
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({ mapId: row.map_id, acquiredAt: row.acquired_at, expiresAt: row.expires_at }));
}

/** Liens d'invitation déjà utilisés par le compte connecté (export des données) : carte, date. */
export async function listOwnLinkUses(db: Db, options: ListOptions = {}) {
  const { data, error } = await db.rpc("my_map_link_uses");
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({ mapId: row.map_id, usedAt: row.used_at }));
}

// ---------------------------------------------------------------------------------------------
// Éditeur coopératif.
// ---------------------------------------------------------------------------------------------

/** Carte complète pour son propriétaire ou un membre ; null sinon. */
export async function openSharedMap(db: Db, mapId: string): Promise<SharedMapContent | null> {
  const { data, error } = await db.rpc("open_shared_map", { p_map: mapId });
  if (error) fail(error);
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    role: mapRole(row.role),
    revision: row.revision,
    updated: toIso(row.updated_at),
    data: row.data,
    ownerHandle: row.owner_handle,
    ownerName: row.owner_display_name,
  };
}

/** Version, rôle et verrou d'édition d'une carte ; null si le compte n'y a plus accès. */
export async function getSharedMapState(db: Db, mapId: string): Promise<SharedMapState | null> {
  const { data, error } = await db.rpc("shared_map_state", { p_map: mapId });
  if (error) fail(error);
  const row = data?.[0];
  if (!row) return null;
  const lock: SharedMapState["lock"] = row.lock_mine
    ? { kind: "mine", expiresAt: row.lock_expires_at ?? "" }
    : row.lock_held
      ? { kind: "other", holderName: row.lock_holder_name }
      : { kind: "free" };
  return { name: row.name, role: mapRole(row.role), revision: row.revision, updated: toIso(row.updated_at), lock };
}

/** Prend ou renouvelle le verrou d'édition de la carte `mapId`. */
export async function acquireLock(db: Db, mapId: string): Promise<LockResult> {
  const { data, error } = await db.rpc("acquire_map_lock", { p_map: mapId });
  if (error) fail(error);
  const row = data?.[0];
  switch (row?.status) {
    case "acquired":
      return row.expires_at ? { status: "acquired", expiresAt: row.expires_at } : fail({});
    case "held":
      return { status: "held", holderName: row.holder_name };
    case "read-only":
      return { status: "read-only" };
    case "not-found":
      return { status: "not-found" };
    default:
      return fail({});
  }
}

/** Libère le verrou d'édition de la carte `mapId` s'il est tenu par le compte. */
export async function releaseLock(db: Db, mapId: string): Promise<boolean> {
  const { data, error } = await db.rpc("release_map_lock", { p_map: mapId });
  if (error) fail(error);
  return data === true;
}

/**
 * Enregistre le contenu d'une carte partagée (fonction update_map_data) s'il en est encore à la
 * version `expectedRevision` ; renvoie la nouvelle version, ou null si le compte n'y a plus accès.
 * Erreurs « locked » (verrou d'un autre, ou plus le droit d'écrire) et « conflict » (version).
 */
export async function saveSharedMap(db: Db, mapId: string, doc: MapDoc, expectedRevision: number): Promise<{ revision: number; updated: string } | null> {
  const { data, error } = await db
    .rpc("update_map_data", { p_id: mapId, p_data: JSON.stringify(portableDoc(doc)), p_expected_revision: expectedRevision })
    .maybeSingle();
  if (error) fail(error);
  return data ? { revision: data.revision, updated: toIso(data.updated_at) } : null;
}
