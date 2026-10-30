"use server";

// Server Actions de l'éditeur coopératif (carte partagée ouverte par son propriétaire ou un membre) :
// lecture de la carte, état (version et verrou d'édition) pour le rafraîchissement périodique, prise,
// renouvellement et libération du verrou, enregistrement du contenu.
//
// Comme celles des cartes (src/features/maps/actions.ts) : session vérifiée auprès de l'API Auth
// (getUser, jamais getSession), compte attendu par la page (refus si un autre compte a été ouvert
// dans un autre onglet), entrées revalidées (zod, parseMapDoc et taille), erreurs génériques. La base
// vérifie en plus le rôle du compte sur la carte, le verrou d'édition et la version du contenu, et
// compte les prises de verrou et les lectures complètes (public.rate_limits).
import { mapIdSchema, mapRevisionSchema, parseMapData } from "@/features/maps/schemas";
import type { MapDoc } from "@/features/map-doc/types";
import * as data from "@/lib/supabase/sharing";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import { checkActiveUser } from "@/lib/supabase/user";
import type { LockResult, SharedMapContent, SharedMapState } from "./types";

/**
 * Erreurs renvoyées au navigateur, sans détail technique : « locked » (un autre membre tient le
 * verrou, ou le compte n'a plus le droit d'écrire), « conflict » (la carte a changé depuis la version
 * attendue), « too-large » / « invalid » (contenu refusé), « quota » (espace du compte du propriétaire plein), « rate-limited », « unauthorized »
 * (session), « unavailable » (base injoignable ou erreur inattendue).
 */
export type CoopError = "unauthorized" | "invalid" | "too-large" | "quota" | "locked" | "conflict" | "rate-limited" | "unavailable";

export type CoopResult<T> = { ok: true; value: T } | { ok: false; error: CoopError };

const failure = (error: CoopError): CoopResult<never> => ({ ok: false, error });

class InputError extends Error {
  constructor(readonly kind: CoopError) {
    super(kind);
  }
}

/** Exécute une requête pour l'utilisateur connecté, s'il est bien le compte attendu par la page. */
async function asUser<T>(expectedUserId: unknown, run: (db: ServerSupabaseClient) => Promise<T>): Promise<CoopResult<T>> {
  const check = await checkActiveUser();
  if (check.status === "unavailable") return failure("unavailable");
  const user = check.status === "signed-in" ? check.user : null;
  if (!user || typeof expectedUserId !== "string" || user.id !== expectedUserId) return failure("unauthorized");
  const db = await createClient();
  if (!db) return failure("unauthorized");
  try {
    return { ok: true, value: await run(db) };
  } catch (error) {
    if (error instanceof InputError) return failure(error.kind);
    if (error instanceof data.SharingDataError) {
      switch (error.kind) {
        case "locked":
        case "conflict":
        case "too-large":
        case "quota":
        case "invalid":
        case "rate-limited":
        case "unauthorized":
          return failure(error.kind);
        default:
          return failure("unavailable");
      }
    }
    console.error("[sharing] Erreur inattendue (éditeur coopératif).");
    return failure("unavailable");
  }
}

function readId(id: unknown): string {
  const parsed = mapIdSchema.safeParse(id);
  if (!parsed.success) throw new InputError("invalid");
  return parsed.data;
}

/** Carte complète ; null si elle n'existe pas ou si le compte n'y a pas accès. */
export async function openSharedMap(userId: string, mapId: string): Promise<CoopResult<SharedMapContent | null>> {
  return asUser(userId, (db) => data.openSharedMap(db, readId(mapId)));
}

/** Version, rôle et verrou d'édition ; null si le compte n'y a plus accès. */
export async function getSharedMapState(userId: string, mapId: string): Promise<CoopResult<SharedMapState | null>> {
  return asUser(userId, (db) => data.getSharedMapState(db, readId(mapId)));
}

/** Prend ou renouvelle le verrou d'édition (deux minutes). */
export async function acquireMapLock(userId: string, mapId: string): Promise<CoopResult<LockResult>> {
  return asUser(userId, (db) => data.acquireLock(db, readId(mapId)));
}

/** Libère le verrou d'édition s'il est tenu par le compte. */
export async function releaseMapLock(userId: string, mapId: string): Promise<CoopResult<boolean>> {
  return asUser(userId, (db) => data.releaseLock(db, readId(mapId)));
}

/**
 * Enregistre le contenu (carte validée et normalisée, dans la limite de taille) s'il en est encore à
 * la version `expectedRevision` ; null si le compte n'y a plus accès.
 */
export async function saveSharedMap(
  userId: string,
  mapId: string,
  doc: MapDoc,
  expectedRevision: number,
): Promise<CoopResult<{ revision: number; updated: string } | null>> {
  return asUser(userId, (db) => {
    const id = readId(mapId);
    const parsed = parseMapData(doc);
    if (!parsed.ok) throw new InputError(parsed.error);
    const revision = mapRevisionSchema.safeParse(expectedRevision);
    if (!revision.success) throw new InputError("conflict");
    return data.saveSharedMap(db, id, parsed.doc, revision.data);
  });
}
