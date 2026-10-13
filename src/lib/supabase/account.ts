import "server-only";

// Données du compte de l'utilisateur vérifié par l'appelant (page « Mon compte ») : lecture de ses
// cartes pour le téléchargement (liste, puis contenu carte par carte), et suppression du compte par
// la fonction de la base delete_my_account (supabase/migrations/20261009120000_delete_my_account.sql).
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_MAPS_PER_ACCOUNT } from "@/features/maps/limits";
import type { Database } from "./database";
import type { ServerSupabaseClient } from "./server";

/** Échec d'une requête ; seul le code PostgreSQL est gardé (jamais le message ni les données). */
export class AccountDataError extends Error {
  constructor(readonly code: string | undefined) {
    super(`account: ${code ?? "inconnu"}`);
  }
}

/** Carte telle qu'elle est listée pour l'export : tout sauf son contenu, lu ensuite carte par carte. */
export type ExportedMapSummary = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  revision: number;
};

const SUMMARY_COLUMNS = "id, name, created_at, updated_at, revision";

/**
 * Toutes les cartes de `userId`, de la plus ancienne à la plus récente, SANS leur contenu (une seule
 * requête légère). Filtre sur user_id en plus des politiques RLS (défense en profondeur).
 */
export async function listMapsForExport(db: ServerSupabaseClient, userId: string): Promise<ExportedMapSummary[]> {
  const { data, error } = await db
    .from("maps")
    .select(SUMMARY_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(MAX_MAPS_PER_ACCOUNT);
  if (error) throw new AccountDataError(error.code);
  return data;
}

/**
 * Contenu d'une carte de `userId`, en texte JSON tel que la base l'écrit (`data::text`) : il est
 * recopié tel quel dans le fichier, sans être décodé en objets (mémoire du serveur bornée par la
 * taille d'une carte). null si la carte n'existe plus (supprimée pendant l'export).
 */
export async function readMapDataText(db: ServerSupabaseClient, userId: string, mapId: string): Promise<string | null> {
  const { data, error } = await db
    .from("maps")
    .select("data::text")
    .eq("user_id", userId)
    .eq("id", mapId)
    .maybeSingle();
  if (error) throw new AccountDataError(error.code);
  return data ? (data.data as string) : null;
}

/**
 * Supprime le compte du jeton de `db` (auth.uid()) et, en cascade, ses cartes et ses sessions.
 * `db` doit porter le jeton d'une session ouverte par mot de passe à l'instant (withPasswordSession) :
 * la base refuse sinon (codes 42501 ou 28000).
 */
export async function deleteOwnAccount(db: SupabaseClient<Database>): Promise<boolean> {
  const { data, error } = await db.rpc("delete_my_account");
  if (error) throw new AccountDataError(error.code);
  return data === true;
}
