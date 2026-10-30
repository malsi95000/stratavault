import "server-only";

// Cartes du compte connecté qui ont des membres (page « Mon espace stratégique ») : leur bouton
// « Continuer » ouvre l'éditeur coopératif, et non l'éditeur habituel, pour que le propriétaire
// respecte le verrou d'édition comme ses membres (lecture seule et « X modifie cette carte »).
import { listMapShareRows } from "@/lib/supabase/sharing";
import { createClient } from "@/lib/supabase/server";

/**
 * Identifiants des cartes du compte qui ont au moins un membre. Liste vide si la lecture échoue : la
 * banque reste utilisable, et la base protège de toute façon les membres (verrou, version).
 */
export async function readOwnSharedMapIds(): Promise<string[]> {
  const db = await createClient();
  if (!db) return [];
  try {
    const rows = await listMapShareRows(db, null);
    return [...new Set(rows.filter((row) => row.kind === "member").map((row) => row.mapId))];
  } catch {
    return [];
  }
}
