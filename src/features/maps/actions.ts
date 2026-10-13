"use server";

// Server Actions des cartes (mode compte). Chacune vérifie l'utilisateur auprès de l'API Auth
// (getUser : une session révoquée par la déconnexion est refusée tout de suite ; jamais getSession),
// revalide ses entrées (zod, parseMapDoc), borne la taille des cartes, ne renvoie que les champs
// affichés et des erreurs génériques.
//
// Chaque action reçoit aussi l'identifiant du compte pour lequel la page a été ouverte : si le
// cookie de session appartient désormais à un autre compte (déconnexion puis connexion dans un
// autre onglet), elle est refusée au lieu d'écrire les cartes d'un compte dans un autre.
import type { MapDoc } from "@/features/map-doc/types";
import * as data from "@/lib/supabase/maps";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import { checkActiveUser } from "@/lib/supabase/user";
import { mapIdSchema, mapNameSchema, mapRevisionSchema, parseMapData } from "./schemas";
import type { MapActionError, MapActionResult, RemoteMap, RemoteMapInfo, RemoteMapSummary } from "./types";

const failure = (error: MapActionError): MapActionResult<never> => ({ ok: false, error });

/**
 * Exécute une requête pour l'utilisateur connecté, s'il est bien le compte attendu par la page ;
 * toute erreur devient un code générique.
 */
async function asUser<T>(
  expectedUserId: unknown,
  run: (db: ServerSupabaseClient, userId: string) => Promise<T>,
): Promise<MapActionResult<T>> {
  const check = await checkActiveUser();
  // Supabase injoignable : erreur passagère (nouvel essai), pas « session expirée ».
  if (check.status === "unavailable") return failure("unavailable");
  const user = check.status === "signed-in" ? check.user : null;
  if (!user || typeof expectedUserId !== "string" || user.id !== expectedUserId) return failure("unauthorized");
  const db = await createClient();
  if (!db) return failure("unauthorized");
  try {
    return { ok: true, value: await run(db, user.id) };
  } catch (error) {
    if (error instanceof data.MapDataError) return failure(error.kind);
    console.error("[maps] Erreur inattendue.");
    return failure("unavailable");
  }
}

const rejected = () => new data.MapDataError("invalid");

/** Identifiant de carte (uuid) revalidé ; sinon la requête est refusée. */
function readId(id: unknown): string {
  const parsed = mapIdSchema.safeParse(id);
  if (!parsed.success) throw rejected();
  return parsed.data;
}

function readName(name: unknown): string {
  const parsed = mapNameSchema.safeParse(name);
  if (!parsed.success) throw rejected();
  return parsed.data;
}

/**
 * Version attendue, obligatoire : absente ou invalide, la requête est traitée comme un conflit
 * (rien n'est écrasé), jamais comme une écriture sans contrôle de version.
 */
function readRevision(revision: unknown): number {
  const parsed = mapRevisionSchema.safeParse(revision);
  if (!parsed.success) throw new data.MapDataError("conflict");
  return parsed.data;
}

/** Carte validée et normalisée, dans la limite de taille. */
function readDoc(doc: unknown): MapDoc {
  const parsed = parseMapData(doc);
  if (!parsed.ok) throw new data.MapDataError(parsed.error);
  return parsed.doc;
}

export async function listMaps(userId: string): Promise<MapActionResult<RemoteMapSummary[]>> {
  return asUser(userId, (db, uid) => data.listMaps(db, uid));
}

/** Une carte de l'utilisateur ; null si elle n'existe pas (ou appartient à un autre compte). */
export async function getMap(userId: string, id: string): Promise<MapActionResult<RemoteMap | null>> {
  return asUser(userId, (db, uid) => data.getMap(db, uid, readId(id)));
}

/**
 * Crée une carte. L'identifiant est toujours choisi par la base : une carte supprimée ailleurs puis
 * enregistrée à nouveau reçoit un nouvel identifiant, qu'aucune copie périmée ne peut viser.
 */
export async function createMap(userId: string, name: string, doc: MapDoc): Promise<MapActionResult<RemoteMapInfo>> {
  return asUser(userId, (db) => data.createMap(db, { name: readName(name), data: readDoc(doc) }));
}

/**
 * Remplace le contenu d'une carte ; null si elle n'existe pas. Refuse (« conflict ») d'écraser un
 * contenu modifié depuis `expectedRevision` (autre appareil), ainsi que toute version absente ou invalide.
 */
export async function updateMap(
  userId: string,
  id: string,
  doc: MapDoc,
  expectedRevision: number,
): Promise<MapActionResult<RemoteMapInfo | null>> {
  return asUser(userId, (db) => {
    const mapId = readId(id);
    // Carte invalide ou trop grande d'abord (erreur définitive), puis version (conflit).
    const mapDoc = readDoc(doc);
    return data.updateMap(db, mapId, mapDoc, readRevision(expectedRevision));
  });
}

/** Renomme une carte ; null si elle n'existe pas. */
export async function renameMap(userId: string, id: string, name: string): Promise<MapActionResult<RemoteMapInfo | null>> {
  return asUser(userId, (db, uid) => data.renameMap(db, uid, readId(id), readName(name)));
}

export async function deleteMap(userId: string, id: string): Promise<MapActionResult<null>> {
  return asUser(userId, async (db, uid) => {
    await data.deleteMap(db, uid, readId(id));
    return null;
  });
}
