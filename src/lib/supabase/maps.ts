import "server-only";

// Accès à la table public.maps pour l'utilisateur vérifié par l'appelant. Chaque lecture filtre
// aussi sur user_id, en plus des politiques RLS de la base (défense en profondeur), et ne lit
// que les colonnes utiles. Le contenu des cartes s'écrit uniquement par les fonctions de la base
// create_map et update_map_data (RPC), qui le reçoivent en texte et bornent sa taille avant de le
// lire : la base refuse les INSERT et les UPDATE directs du contenu.
import { formatStats } from "@/features/map-doc/ops";
import { portableDoc } from "@/features/map-doc/schemaV2";
import type { MapDoc } from "@/features/map-doc/types";
import { parseMapCover } from "@/features/maps/cover";
import type { MapCover } from "@/features/maps/cover";
import { MAX_MAPS_PER_ACCOUNT } from "@/features/maps/limits";
import type { MapActionError, RemoteMap, RemoteMapInfo, RemoteMapSummary } from "@/features/maps/types";
import { z } from "@/lib/zod";
import type { MapWriteResult } from "./database";
import type { ServerSupabaseClient } from "./server";

/** Échec d'une requête, déjà classé pour le navigateur. */
export class MapDataError extends Error {
  constructor(readonly kind: MapActionError) {
    super(`maps: ${kind}`);
  }
}

type DbError = { code?: string; message?: string };

/** Erreurs levées par les déclencheurs et les fonctions d'écriture de la base (code P0001, message = clé). */
const RAISED_ERRORS = new Map<string, MapActionError>([
  ["maps_quota_exceeded", "quota"],
  ["maps_too_large", "too-large"],
  ["maps_invalid", "invalid"],
  ["maps_conflict", "conflict"],
]);

/** Classe une erreur de PostgREST (codes PostgreSQL) sans jamais la renvoyer telle quelle. */
export function classifyDbError(error: DbError): MapActionError {
  if (error.code === "P0001") return RAISED_ERRORS.get(error.message ?? "") ?? "unavailable";
  if (error.code === "23514") return error.message?.includes("maps_data_size") ? "too-large" : "invalid";
  // Identifiant déjà pris, valeur mal formée.
  if (error.code === "23505" || error.code === "22P02") return "invalid";
  // Droits refusés (RLS, rôle anonyme, fonction appelée sans utilisateur) ou jeton expiré.
  if (error.code === "42501" || error.code?.startsWith("PGRST3")) return "unauthorized";
  return "unavailable";
}

function fail(error: DbError): never {
  const kind = classifyDbError(error);
  // Seul le code est journalisé : jamais le contenu d'une carte.
  if (kind === "unavailable") console.error(`[maps] Requête refusée (code ${error.code ?? "inconnu"}).`);
  throw new MapDataError(kind);
}

type InfoRow = MapWriteResult;

const toIso = (timestamp: string) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString();
};

const toInfo = (row: InfoRow): RemoteMapInfo => ({
  id: row.id,
  name: row.name,
  updated: toIso(row.updated_at),
  revision: row.revision,
});

// Contenu envoyé en texte (JSON compact) : la base vérifie sa taille avant de le convertir en jsonb.
// Sans les clés v2 vides (portableDoc) : une carte qui n'utilise aucun ajout du format v2 est
// enregistrée exactement au format v1, accepté aussi par la base d'avant la bêta 2.1. La relecture
// (parseMapDoc) remet les clés v2.
const toText = (doc: MapDoc): string => JSON.stringify(portableDoc(doc));

const INFO_COLUMNS = "id, name, updated_at, revision";
const LIST_COLUMNS = "id, name, updated_at, revision, stats, cover";
const MAP_COLUMNS = "id, name, updated_at, revision, data";

const count = z.number().int().nonnegative();
/** Colonne `stats`, tenue par un déclencheur de la base (null : contenu qui n'a pas la forme d'une carte). */
const statsSchema = z.object({ notes: count, links: count, pings: count, zones: count, texts: count });

const statsText = (stats: unknown): string | null => {
  const parsed = statsSchema.safeParse(stats);
  return parsed.success ? formatStats(parsed.data) : null;
};

/**
 * Cartes de l'utilisateur, de la plus récemment modifiée à la plus ancienne, avec leurs statistiques.
 * Le contenu des cartes n'est jamais lu : les statistiques sont tenues à jour par la base.
 */
export async function listMaps(db: ServerSupabaseClient, userId: string): Promise<RemoteMapSummary[]> {
  const { data, error } = await db
    .from("maps")
    .select(LIST_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_MAPS_PER_ACCOUNT);
  if (error) fail(error);
  return data.map((row) => ({ ...toInfo(row), stats: statsText(row.stats), cover: parseMapCover(row.cover) }));
}

export async function getMap(db: ServerSupabaseClient, userId: string, id: string): Promise<RemoteMap | null> {
  const { data, error } = await db.from("maps").select(MAP_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) fail(error);
  return data ? { ...toInfo(data), data: data.data } : null;
}

/**
 * Crée une carte (fonction create_map). L'identifiant est toujours tiré par la base (jamais celui
 * d'une carte supprimée, qu'une copie périmée pourrait viser) ; user_id est fixé par la base (auth.uid()).
 */
export async function createMap(db: ServerSupabaseClient, map: { name: string; data: MapDoc }): Promise<RemoteMapInfo> {
  const { data, error } = await db.rpc("create_map", { p_name: map.name, p_data: toText(map.data) }).single();
  if (error) fail(error);
  return toInfo(data);
}

/**
 * Remplace le contenu d'une carte (fonction update_map_data) ; null si elle n'existe pas. La carte
 * n'est modifiée que si son contenu est encore à la version `expectedRevision` (contrôle optimiste,
 * dans la base) : une version plus récente, enregistrée depuis un autre appareil, n'est jamais
 * écrasée (MapDataError « conflict »). Il n'existe pas d'écriture sans version attendue.
 * `userId` n'est pas transmis : la base ne modifie que les cartes de auth.uid().
 */
export async function updateMap(
  db: ServerSupabaseClient,
  id: string,
  doc: MapDoc,
  expectedRevision: number,
): Promise<RemoteMapInfo | null> {
  const { data, error } = await db
    .rpc("update_map_data", { p_id: id, p_data: toText(doc), p_expected_revision: expectedRevision })
    .maybeSingle();
  if (error) fail(error);
  return data ? toInfo(data) : null;
}

/**
 * Remplace (ou retire, avec null) le logo ou l'aperçu d'une carte (fonction set_map_cover, qui borne
 * sa taille et sa forme) ; false si la carte n'existe pas. La date et la version du contenu ne
 * changent pas. `userId` n'est pas transmis : la base ne modifie que les cartes de auth.uid().
 */
export async function setMapCover(db: ServerSupabaseClient, id: string, cover: MapCover | null): Promise<boolean> {
  const { data, error } = await db.rpc("set_map_cover", { p_id: id, p_cover: cover && JSON.stringify(cover) });
  if (error) fail(error);
  return data === true;
}

export async function renameMap(
  db: ServerSupabaseClient,
  userId: string,
  id: string,
  name: string,
): Promise<RemoteMapInfo | null> {
  const { data, error } = await db
    .from("maps")
    .update({ name })
    .eq("id", id)
    .eq("user_id", userId)
    .select(INFO_COLUMNS)
    .maybeSingle();
  if (error) fail(error);
  return data ? toInfo(data) : null;
}

export async function deleteMap(db: ServerSupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from("maps").delete().eq("id", id).eq("user_id", userId);
  if (error) fail(error);
}
