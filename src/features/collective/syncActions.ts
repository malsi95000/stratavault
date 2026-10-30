"use server";

// Server Actions de la session de la carte collective : état (version, rôle, avis), lecture de la
// carte, ajout, modification et suppression des éléments du compte, avis de modération.
//
// Comme celles de l'éditeur coopératif (src/features/sharing/coopActions.ts) : limite par IP, session
// vérifiée auprès de l'API Auth (getUser, jamais getSession), compte attendu par la page (refus si un
// autre compte a été ouvert dans un autre onglet), entrées revalidées (parseItemContent, mêmes règles
// que la base), erreurs génériques. La base vérifie en plus que le compte n'écrit que ses propres
// éléments, et tient ses limites anti-abus et ses bornes de stockage.
import { headers } from "next/headers";
import { checkAttempt, clientIp, trustedProxyHops } from "@/features/auth/rateLimit";
import * as data from "@/lib/supabase/collective";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import { checkActiveUser } from "@/lib/supabase/user";
import { parseItemContent } from "./itemData";
import { itemIdSchema } from "./schemas";
import type { CollectiveItem, CollectiveNotice, CollectiveState, CreateResult, DeleteResult, HiddenItem, UpdateResult } from "./types";

/**
 * Erreurs renvoyées au navigateur, sans détail technique : « invalid » (contenu refusé),
 * « no-profile » (il faut un profil pour contribuer), « rate-limited », « unauthorized » (session),
 * « unavailable » (base injoignable ou erreur inattendue).
 */
export type CollectiveError = "unauthorized" | "invalid" | "no-profile" | "rate-limited" | "unavailable";

export type CollectiveResult<T> = { ok: true; value: T } | { ok: false; error: CollectiveError };

const failure = (error: CollectiveError): CollectiveResult<never> => ({ ok: false, error });

class InputError extends Error {}

type Attempt = "collectiveRead" | "collectiveWrite";

/** Exécute une requête pour l'utilisateur connecté, s'il est bien le compte attendu par la page. */
async function asUser<T>(
  attempt: Attempt,
  expectedUserId: unknown,
  run: (db: ServerSupabaseClient) => Promise<T>,
): Promise<CollectiveResult<T>> {
  if (checkAttempt(attempt, clientIp(await headers(), trustedProxyHops())) !== "allowed") return failure("rate-limited");
  const check = await checkActiveUser();
  if (check.status === "unavailable") return failure("unavailable");
  const user = check.status === "signed-in" ? check.user : null;
  if (!user || typeof expectedUserId !== "string" || user.id !== expectedUserId) return failure("unauthorized");
  const db = await createClient();
  if (!db) return failure("unauthorized");
  try {
    return { ok: true, value: await run(db) };
  } catch (error) {
    if (error instanceof InputError) return failure("invalid");
    if (error instanceof data.CollectiveDataError) {
      switch (error.kind) {
        case "invalid":
        case "no-profile":
        case "rate-limited":
        case "unauthorized":
          return failure(error.kind);
        default:
          return failure("unavailable");
      }
    }
    console.error("[collective] Erreur inattendue (session de la carte).");
    return failure("unavailable");
  }
}

function readContent(kind: unknown, id: unknown, content: unknown) {
  const parsed = parseItemContent(kind, id, content);
  if (!parsed.ok) throw new InputError();
  return parsed.content;
}

function readId(id: unknown): string {
  const parsed = itemIdSchema.safeParse(id);
  if (!parsed.success) throw new InputError();
  return parsed.data;
}

/** Version de la carte, rôle et avis du compte. */
export async function getCollectiveState(userId: string): Promise<CollectiveResult<CollectiveState>> {
  return asUser("collectiveRead", userId, (db) => data.getCollectiveState(db));
}

/** Éléments visibles de la carte. */
export async function loadCollectiveMap(userId: string): Promise<CollectiveResult<CollectiveItem[]>> {
  return asUser("collectiveRead", userId, (db) => data.loadCollectiveItems(db));
}

/** Ajoute un élément du compte (contenu revalidé). */
export async function createCollectiveItem(
  userId: string,
  kind: string,
  id: string,
  content: unknown,
): Promise<CollectiveResult<CreateResult>> {
  return asUser("collectiveWrite", userId, (db) => data.createItem(db, readContent(kind, id, content)));
}

/** Modifie un élément du compte (contenu revalidé). */
export async function updateCollectiveItem(
  userId: string,
  kind: string,
  id: string,
  content: unknown,
): Promise<CollectiveResult<UpdateResult>> {
  return asUser("collectiveWrite", userId, (db) => data.updateItem(db, readContent(kind, id, content)));
}

/** Supprime un élément du compte (et ses liens rattachés). */
export async function deleteCollectiveItem(userId: string, id: string): Promise<CollectiveResult<DeleteResult>> {
  return asUser("collectiveWrite", userId, (db) => data.deleteItem(db, readId(id)));
}

/** Avis de modération du compte. */
export async function listCollectiveNotices(userId: string): Promise<CollectiveResult<CollectiveNotice[]>> {
  return asUser("collectiveRead", userId, (db) => data.listNotices(db));
}

/** Éléments masqués du compte (à supprimer s'il le souhaite), même sans avis à leur sujet. */
export async function listHiddenCollectiveItems(userId: string): Promise<CollectiveResult<HiddenItem[]>> {
  return asUser("collectiveRead", userId, (db) => data.listHiddenItems(db));
}

/** Marque comme lus les avis de modération du compte. */
export async function markCollectiveNoticesRead(userId: string): Promise<CollectiveResult<number>> {
  return asUser("collectiveWrite", userId, (db) => data.markNoticesRead(db));
}
