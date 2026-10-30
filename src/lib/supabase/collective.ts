import "server-only";

// Accès à la carte collective (supabase/migrations/20261020120000_collective_map.sql) avec le jeton de
// la session du compte connecté. Les tables ne sont pas accessibles par l'API : tout passe par les
// fonctions de la base, qui vérifient auth.uid(), appliquent les limites anti-abus et ne renvoient
// jamais l'identifiant de compte d'un autre membre. Les réponses attendues (« not-found »,
// « already-reported »…) sont des statuts ; seuls les vrais refus (limite atteinte, session, profil
// manquant, page réservée aux modérateurs) sont des erreurs. Tout contenu relu dans la base est
// revalidé (parseItemContent) avant de partir vers le navigateur.
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseItemContent, contentJson } from "@/features/collective/itemData";
import {
  BLOCK_AUTHOR_RESULTS,
  CREATE_RESULTS,
  DELETE_RESULTS,
  MODERATE_RESULTS,
  QUEUE_STATUSES,
  REPORT_REASONS,
  REPORT_RESULTS,
  UPDATE_RESULTS,
  isDecisionAction,
  isItemKind,
  type BlockAuthorResult,
  type CollectiveItem,
  type CollectiveNotice,
  type CollectiveState,
  type CreateResult,
  type Decision,
  type DeleteResult,
  type HiddenItem,
  type ItemContent,
  type ModerateResult,
  type ModerationAction,
  type QueueItem,
  type QueueStatus,
  type ReportReason,
  type ReportResult,
  type RevisionStep,
  type UpdateResult,
} from "@/features/collective/types";
import type { Database } from "./database";

type Db = SupabaseClient<Database>;

/**
 * Échec classé pour l'interface ; jamais le message brut de la base :
 * - no-profile : il faut un profil pour ajouter ou modifier un élément ;
 * - forbidden : réservé aux modérateurs ;
 * - invalid : entrée refusée par la base.
 */
export type CollectiveErrorKind = "no-profile" | "rate-limited" | "invalid" | "forbidden" | "unauthorized" | "unavailable";

export class CollectiveDataError extends Error {
  constructor(readonly kind: CollectiveErrorKind) {
    super(`collective: ${kind}`);
  }
}

type DbError = { code?: string; message?: string };

const RAISED_ERRORS = new Map<string, CollectiveErrorKind>([
  ["collective_no_profile", "no-profile"],
  ["collective_rate_limited", "rate-limited"],
  ["collective_invalid", "invalid"],
]);

/** Classe une erreur de PostgREST (codes PostgreSQL et nom de l'erreur levée par la base). */
export function classifyCollectiveError(error: DbError): CollectiveErrorKind {
  if (error.code === "P0001") return RAISED_ERRORS.get(error.message ?? "") ?? "unavailable";
  if (error.code === "42501") return error.message === "collective_forbidden" ? "forbidden" : "unauthorized";
  if (error.code?.startsWith("PGRST3")) return "unauthorized";
  if (error.code === "22P02" || error.code === "23514") return "invalid";
  return "unavailable";
}

function fail(error: DbError): never {
  const kind = classifyCollectiveError(error);
  // Seul le code est journalisé : jamais un contenu, un motif ni un identifiant.
  if (kind === "unavailable") console.error(`[collective] Requête refusée (code ${error.code ?? "inconnu"}).`);
  throw new CollectiveDataError(kind);
}

/** Statut renvoyé par une fonction de la base, s'il fait partie des réponses prévues ; sinon erreur. */
function expectStatus<T extends string>(data: unknown, allowed: readonly T[]): T {
  if (typeof data === "string" && (allowed as readonly string[]).includes(data)) return data as T;
  return fail({});
}

/** Versions avant et après une écriture (bigint, reçu en nombre ou en texte) ; null si absentes ou incohérentes. */
function revisionStep(row: { revision_from?: number | string | null; revision_to?: number | string | null } | undefined): RevisionStep | null {
  if (row?.revision_from == null || row.revision_to == null) return null;
  const from = Number(row.revision_from);
  const to = Number(row.revision_to);
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && to >= from ? { from, to } : null;
}

const toIso = (timestamp: string) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString();
};

/** Lecture des listes : `missingAsEmpty` (export, espace) traite une base d'avant la carte collective comme vide. */
type ListOptions = { missingAsEmpty?: boolean };
const isMissing = (error: DbError, options: ListOptions) => options.missingAsEmpty === true && error.code === "PGRST202";

// ---------------------------------------------------------------------------------------------
// Carte.
// ---------------------------------------------------------------------------------------------

/** Version de la carte, rôle et avis du compte connecté. */
export async function getCollectiveState(db: Db): Promise<CollectiveState> {
  const { data, error } = await db.rpc("collective_map_state");
  if (error) fail(error);
  const row = data?.[0];
  if (!row) return fail({});
  return {
    revision: Number(row.revision),
    isModerator: row.is_moderator === true,
    hasProfile: row.has_profile === true,
    unreadNotices: Number(row.unread_notices) || 0,
    myItems: Number(row.my_items) || 0,
    suspendedUntil: row.suspended_until ? toIso(row.suspended_until) : null,
  };
}

/** Éléments visibles de la carte (un contenu qui ne passe plus la validation est omis). */
export async function loadCollectiveItems(db: Db): Promise<CollectiveItem[]> {
  const { data, error } = await db.rpc("collective_map");
  if (error) fail(error);
  const items: CollectiveItem[] = [];
  for (const row of data ?? []) {
    const parsed = parseItemContent(row.kind, row.id, row.data);
    if (!parsed.ok) continue;
    items.push({
      ...parsed.content,
      authorName: row.author_name ?? null,
      authorHandle: row.author_handle ?? null,
      mine: row.mine === true,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    });
  }
  return items;
}

/** Ajoute un élément du compte connecté (contenu déjà validé et canonique). */
export async function createItem(db: Db, content: ItemContent): Promise<CreateResult> {
  const { data, error } = await db.rpc("create_collective_item", {
    p_id: content.id,
    p_kind: content.kind,
    p_data: contentJson(content),
  });
  if (error) fail(error);
  const row = data?.[0];
  const status = expectStatus(row?.status, CREATE_RESULTS);
  return {
    status,
    authorName: row?.author_name ?? null,
    createdAt: row?.created_at ? toIso(row.created_at) : null,
    step: revisionStep(row),
  };
}

/** Remplace le contenu d'un élément du compte connecté. */
export async function updateItem(db: Db, content: ItemContent): Promise<UpdateResult> {
  const { data, error } = await db.rpc("update_collective_item", { p_id: content.id, p_data: contentJson(content) });
  if (error) fail(error);
  const row = data?.[0];
  return { status: expectStatus(row?.status, UPDATE_RESULTS), step: revisionStep(row) };
}

/** Supprime un élément du compte connecté (avec ses liens rattachés). */
export async function deleteItem(db: Db, id: string): Promise<DeleteResult> {
  const { data, error } = await db.rpc("delete_collective_item", { p_id: id });
  if (error) fail(error);
  const row = data?.[0];
  return { status: expectStatus(row?.status, DELETE_RESULTS), step: revisionStep(row) };
}

/**
 * Signale l'élément d'un autre membre. `goodFaith` : déclaration de bonne foi, exigée par la base (avec
 * une explication) pour un contenu illicite.
 */
export async function reportItem(db: Db, id: string, reason: ReportReason, details: string, goodFaith: boolean): Promise<ReportResult> {
  const { data, error } = await db.rpc("report_collective_item", { p_id: id, p_reason: reason, p_details: details, p_good_faith: goodFaith });
  if (error) fail(error);
  return expectStatus(data, REPORT_RESULTS);
}

/**
 * Bloque l'auteur de l'élément visible `id` (même blocage que depuis les contacts) : l'auteur est
 * retrouvé dans la base, son identifiant de compte n'en sort pas.
 */
export async function blockAuthor(db: Db, id: string): Promise<BlockAuthorResult> {
  const { data, error } = await db.rpc("block_collective_author", { p_id: id });
  if (error) fail(error);
  return expectStatus(data, BLOCK_AUTHOR_RESULTS);
}

// ---------------------------------------------------------------------------------------------
// Avis de modération du compte connecté.
// ---------------------------------------------------------------------------------------------

/** Avis de modération du compte connecté, les plus récents d'abord. */
export async function listNotices(db: Db, options: ListOptions = {}): Promise<CollectiveNotice[]> {
  const { data, error } = await db.rpc("my_collective_notices");
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  const notices: CollectiveNotice[] = [];
  for (const row of data ?? []) {
    if (!isDecisionAction(row.action) || !isItemKind(row.item_kind) || (row.role !== "author" && row.role !== "reporter")) continue;
    notices.push({
      id: row.id,
      role: row.role,
      action: row.action,
      itemId: row.item_id,
      itemKind: row.item_kind,
      itemTitle: row.item_title,
      reason: row.reason,
      reports: row.role === "author" && typeof row.reports === "number" ? row.reports : null,
      suspendedUntil: row.suspended_until ? toIso(row.suspended_until) : null,
      itemHidden: row.item_hidden === true,
      createdAt: toIso(row.created_at),
      readAt: row.read_at ? toIso(row.read_at) : null,
    });
  }
  return notices;
}

/**
 * Éléments masqués du compte connecté, les plus récemment modifiés d'abord, qu'il existe ou non un
 * avis à leur sujet (titre borné à 200 caractères ; sorte inconnue ignorée).
 */
export async function listHiddenItems(db: Db): Promise<HiddenItem[]> {
  const { data, error } = await db.rpc("my_hidden_collective_items");
  if (error) fail(error);
  const items: HiddenItem[] = [];
  for (const row of data ?? []) {
    if (!isItemKind(row.kind) || typeof row.id !== "string") continue;
    items.push({ id: row.id, kind: row.kind, title: String(row.title ?? "").slice(0, 200), updatedAt: toIso(row.updated_at) });
  }
  return items;
}

/** Marque comme lus les avis du compte connecté. */
export async function markNoticesRead(db: Db): Promise<number> {
  const { data, error } = await db.rpc("mark_collective_notices_read");
  if (error) fail(error);
  return Number(data) || 0;
}

// ---------------------------------------------------------------------------------------------
// Modération (modérateurs seulement : sinon erreur « forbidden »).
// ---------------------------------------------------------------------------------------------

const isReason = (value: string): value is ReportReason => (REPORT_REASONS as readonly string[]).includes(value);

const isQueueStatus = (value: string): value is QueueStatus => (QUEUE_STATUSES as readonly string[]).includes(value);

/**
 * Page `page` (à partir de 0) de la file de modération : éléments signalés (y compris ceux que leur
 * auteur a retirés depuis ; contenus illicites d'abord, puis du plus ancien signalement au plus
 * récent), puis masqués ; jamais les éléments du modérateur lui-même. `total` : nombre d'éléments de
 * toute la file (0 pour une page au-delà de la dernière).
 */
export async function getModerationQueue(db: Db, page = 0): Promise<{ items: QueueItem[]; total: number }> {
  const { data, error } = await db.rpc("collective_moderation_queue", { p_page: page });
  if (error) fail(error);
  const queue: QueueItem[] = [];
  const total = Number(data?.[0]?.total) || 0;
  for (const row of data ?? []) {
    if (!isItemKind(row.kind) || !isQueueStatus(row.status)) continue;
    queue.push({
      id: row.id,
      kind: row.kind,
      data: row.data ?? null,
      status: row.status,
      authorHandle: row.author_handle ?? null,
      authorName: row.author_name ?? null,
      createdAt: row.created_at ? toIso(row.created_at) : null,
      updatedAt: row.updated_at ? toIso(row.updated_at) : null,
      openReports: Number(row.open_reports) || 0,
      reasons: (row.reasons ?? []).filter(isReason),
      details: (row.details ?? []).filter((d): d is string => typeof d === "string"),
      lastReportAt: row.last_report_at ? toIso(row.last_report_at) : null,
      reportedData: Array.isArray(row.reported_data) ? row.reported_data : [],
    });
  }
  return { items: queue, total };
}

/**
 * Décision de modération, motif enregistré au journal. `suspend` (masquer ou supprimer seulement) :
 * les contributions de l'auteur sont suspendues 30 jours.
 */
export async function moderateItem(
  db: Db,
  id: string,
  action: ModerationAction,
  reason: string,
  suspend: boolean,
): Promise<ModerateResult> {
  const { data, error } = await db.rpc("moderate_collective_item", {
    p_id: id,
    p_action: action,
    p_reason: reason,
    p_suspend: suspend,
  });
  if (error) fail(error);
  return expectStatus(data, MODERATE_RESULTS);
}

/** Journal des décisions (200 dernières). */
export async function getModerationLog(db: Db): Promise<Decision[]> {
  const { data, error } = await db.rpc("collective_moderation_log");
  if (error) fail(error);
  const log: Decision[] = [];
  for (const row of data ?? []) {
    if (!isDecisionAction(row.action) || !isItemKind(row.item_kind)) continue;
    log.push({
      id: row.id,
      action: row.action,
      itemId: row.item_id,
      itemKind: row.item_kind,
      itemTitle: row.item_title,
      reason: row.reason,
      reports: Number(row.reports) || 0,
      suspendedUntil: row.suspended_until ? toIso(row.suspended_until) : null,
      moderatorName: row.moderator_name ?? null,
      authorHandle: row.author_handle ?? null,
      authorName: row.author_name ?? null,
      createdAt: toIso(row.created_at),
    });
  }
  return log;
}

// ---------------------------------------------------------------------------------------------
// Droit d'accès (« Télécharger mes données »).
// ---------------------------------------------------------------------------------------------

/** Éléments du compte connecté (masqués compris), contenu tel que la base l'enregistre. */
export async function listOwnItems(db: Db, options: ListOptions = {}) {
  const { data, error } = await db.rpc("my_collective_items");
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    data: row.data,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Signalements faits par le compte connecté. */
export async function listOwnReports(db: Db, options: ListOptions = {}) {
  const { data, error } = await db.rpc("my_collective_reports");
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({
    itemId: row.item_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}

/** Décisions de modération lues par `fn` (le modérateur n'y est jamais nommé). */
async function listDecisions(db: Db, fn: "my_moderation_decisions" | "my_collective_decisions", options: ListOptions) {
  const { data, error } = await db.rpc(fn);
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    itemId: row.item_id,
    itemKind: row.item_kind,
    itemTitle: row.item_title,
    reason: row.reason,
    reports: row.reports,
    suspendedUntil: row.suspended_until ?? null,
    createdAt: row.created_at,
  }));
}

/** Décisions prises par le compte connecté comme modérateur (aucune pour un autre compte). */
export const listOwnDecisions = (db: Db, options: ListOptions = {}) => listDecisions(db, "my_moderation_decisions", options);

/**
 * Décisions de modération qui visent les éléments du compte connecté, même si leur avis a été effacé,
 * sauf celles qui révéleraient un signalement (classement, retrait par lui-même d'un élément signalé,
 * lien signalé supprimé avec son élément ; RGPD art. 15.4) : la base les écarte.
 */
export const listDecisionsAboutMe = (db: Db, options: ListOptions = {}) => listDecisions(db, "my_collective_decisions", options);

/** Désignation comme modérateur et suspension du compte connecté (null : aucune). */
export type OwnCollectiveAccount = {
  moderatorSince: string | null;
  suspension: { until: string; createdAt: string } | null;
};

/** Situation du compte connecté dans la carte collective ; base d'avant la carte collective : rien. */
export async function readOwnCollectiveAccount(db: Db, options: ListOptions = {}): Promise<OwnCollectiveAccount> {
  const none: OwnCollectiveAccount = { moderatorSince: null, suspension: null };
  const { data, error } = await db.rpc("my_collective_account");
  if (error) {
    if (isMissing(error, options)) return none;
    fail(error);
  }
  const row = data?.[0];
  if (!row) return none;
  return {
    moderatorSince: row.moderator_since ? toIso(row.moderator_since) : null,
    suspension: row.suspended_until && row.suspended_at ? { until: toIso(row.suspended_until), createdAt: toIso(row.suspended_at) } : null,
  };
}

/** Identifiants d'éléments utilisés par le compte connecté (« modéré » : ne peut plus resservir). */
export async function listOwnItemIds(db: Db, options: ListOptions = {}) {
  const { data, error } = await db.rpc("my_collective_item_ids");
  if (error) {
    if (isMissing(error, options)) return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({ itemId: row.item_id, moderated: row.moderated === true }));
}
