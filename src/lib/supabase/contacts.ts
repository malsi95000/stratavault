import "server-only";

// Accès aux contacts (supabase/migrations/20261018120000_contacts.sql) avec le jeton de la session du
// compte connecté. Les tables ne sont pas accessibles par l'API : tout passe par les fonctions de la
// base, qui vérifient auth.uid(), appliquent les limites anti-abus et ne renvoient jamais
// l'identifiant de compte d'un autre membre. Les réponses attendues (« not-found », « already-sent »…)
// sont des statuts ; seuls les vrais refus (limite atteinte, session…) sont des erreurs.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BLOCK_RESULTS,
  SEND_RESULTS,
  type BlockKind,
  type BlockResult,
  type BlockedMember,
  type Contact,
  type ContactOverview,
  type ContactRequest,
  type SendResult,
} from "@/features/contacts/types";
import type { Database } from "./database";

type Db = SupabaseClient<Database>;

/** Échec classé pour l'interface ; jamais le message brut de la base. */
export type ContactErrorKind = "no-profile" | "rate-limited" | "invalid" | "unauthorized" | "unavailable";

export class ContactDataError extends Error {
  constructor(readonly kind: ContactErrorKind) {
    super(`contacts: ${kind}`);
  }
}

type DbError = { code?: string; message?: string };

const RAISED_ERRORS = new Map<string, ContactErrorKind>([
  ["contacts_no_profile", "no-profile"],
  ["contacts_rate_limited", "rate-limited"],
  ["contacts_invalid", "invalid"],
]);

/** Classe une erreur de PostgREST (codes PostgreSQL et nom de l'erreur levée par la base). */
export function classifyContactError(error: DbError): ContactErrorKind {
  if (error.code === "P0001") return RAISED_ERRORS.get(error.message ?? "") ?? "unavailable";
  if (error.code === "42501" || error.code?.startsWith("PGRST3")) return "unauthorized";
  return "unavailable";
}

function fail(error: DbError): never {
  const kind = classifyContactError(error);
  // Seul le code est journalisé : jamais un identifiant ni une référence.
  if (kind === "unavailable") console.error(`[contacts] Requête refusée (code ${error.code ?? "inconnu"}).`);
  throw new ContactDataError(kind);
}

/** Statut renvoyé par une fonction de la base, s'il fait partie des réponses prévues ; sinon erreur. */
function expectStatus<T extends string>(data: unknown, allowed: readonly T[]): T {
  if (typeof data === "string" && (allowed as readonly string[]).includes(data)) return data as T;
  return fail({});
}

/** Envoie une demande de contact au membre d'identifiant exact `handle` (déjà normalisé). */
export async function sendContactRequest(db: Db, handle: string): Promise<SendResult> {
  const { data, error } = await db.rpc("send_contact_request", { p_handle: handle });
  if (error) fail(error);
  return expectStatus(data, SEND_RESULTS);
}

/** Accepte la demande reçue `requestId`. */
export async function acceptContactRequest(db: Db, requestId: string): Promise<"accepted" | "not-found" | "contacts-full"> {
  const { data, error } = await db.rpc("accept_contact_request", { p_request: requestId });
  if (error) fail(error);
  return expectStatus(data, ["accepted", "not-found", "contacts-full"] as const);
}

/** Refuse la demande reçue `requestId`. */
export async function refuseContactRequest(db: Db, requestId: string): Promise<"refused" | "not-found"> {
  const { data, error } = await db.rpc("refuse_contact_request", { p_request: requestId });
  if (error) fail(error);
  return expectStatus(data, ["refused", "not-found"] as const);
}

/** Annule la demande envoyée `requestId`. */
export async function cancelContactRequest(db: Db, requestId: string): Promise<"cancelled" | "not-found"> {
  const { data, error } = await db.rpc("cancel_contact_request", { p_request: requestId });
  if (error) fail(error);
  return expectStatus(data, ["cancelled", "not-found"] as const);
}

/** Retire le contact `contactId` (pour les deux membres). */
export async function removeContact(db: Db, contactId: string): Promise<"removed" | "not-found"> {
  const { data, error } = await db.rpc("remove_contact", { p_contact: contactId });
  if (error) fail(error);
  return expectStatus(data, ["removed", "not-found"] as const);
}

/** Bloque le membre désigné par son identifiant exact, une demande ou un contact. */
export async function blockMember(db: Db, kind: BlockKind, value: string): Promise<BlockResult> {
  const { data, error } = await db.rpc("block_member", { p_kind: kind, p_value: value });
  if (error) fail(error);
  return expectStatus(data, BLOCK_RESULTS);
}

/** Lève le blocage `blockId`. */
export async function unblockMember(db: Db, blockId: string): Promise<"unblocked" | "not-found"> {
  const { data, error } = await db.rpc("unblock_member", { p_block: blockId });
  if (error) fail(error);
  return expectStatus(data, ["unblocked", "not-found"] as const);
}

/**
 * Lecture des listes : `missingAsEmpty` (export des données) traite une base d'avant les contacts
 * (fonction absente, code PGRST202) comme une liste vide ; toute autre erreur est levée.
 */
type ListOptions = { missingAsEmpty?: boolean };

const isMissing = (error: DbError, options: ListOptions) => options.missingAsEmpty === true && error.code === "PGRST202";

/** Contacts du compte connecté, par identifiant. */
export async function listContacts(db: Db, options: ListOptions = {}): Promise<Contact[]> {
  const { data, error } = await db.rpc("my_contacts");
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarId: row.avatar_id,
    createdAt: row.created_at,
  }));
}

/** Demandes en cours du compte connecté, reçues et envoyées, des plus récentes aux plus anciennes. */
export async function listContactRequests(db: Db, options: ListOptions = {}): Promise<ContactRequest[]> {
  const { data, error } = await db.rpc("my_contact_requests");
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    direction: row.direction === "incoming" ? "incoming" : "outgoing",
    handle: row.handle,
    displayName: row.display_name,
    avatarId: row.avatar_id,
    createdAt: row.created_at,
  }));
}

/** Comptes bloqués par le compte connecté, des plus récents aux plus anciens. */
export async function listBlockedMembers(db: Db, options: ListOptions = {}): Promise<BlockedMember[]> {
  const { data, error } = await db.rpc("my_blocked_members");
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    handle: row.handle,
    createdAt: row.created_at,
  }));
}

/** Toutes les relations du compte connecté (page « Contacts », profil d'un membre, export). */
export async function getContactOverview(db: Db, options: ListOptions = {}): Promise<ContactOverview> {
  const [contacts, requests, blocked] = await Promise.all([
    listContacts(db, options),
    listContactRequests(db, options),
    listBlockedMembers(db, options),
  ]);
  return {
    contacts,
    incoming: requests.filter((request) => request.direction === "incoming"),
    outgoing: requests.filter((request) => request.direction === "outgoing"),
    blocked,
  };
}
