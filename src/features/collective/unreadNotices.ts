import "server-only";

// Avis de modération non lus du compte connecté, pour la section « Carte collective » de l'espace :
// l'auteur d'un élément masqué ou supprimé en est averti sans avoir à rouvrir la carte collective.
import { getCollectiveState } from "@/lib/supabase/collective";
import { createClient } from "@/lib/supabase/server";

/**
 * Nombre d'avis non lus (collective_map_state, lecture comptée dans la base). 0 si la lecture échoue
 * ou si la base précède la carte collective : l'espace reste utilisable, et la carte collective
 * affiche de toute façon ses avis.
 */
export async function readUnreadCollectiveNotices(): Promise<number> {
  const db = await createClient();
  if (!db) return 0;
  try {
    return (await getCollectiveState(db)).unreadNotices;
  } catch {
    return 0;
  }
}
