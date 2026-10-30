import "server-only";

// Compteurs anti-abus tenus par la base (public.rate_limits, 20261017120000_rate_limits.sql) : le
// compte connecté ne relit que les siens, par la fonction my_rate_limits (aucun accès à la table).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";

export type OwnRateLimit = { action: string; windowStart: string; hits: number };

export class RateLimitsReadError extends Error {
  constructor() {
    super("rate_limits: lecture impossible");
  }
}

/** Compteurs du compte connecté ; base d'avant les compteurs (fonction absente, PGRST202) : aucun. */
export async function listOwnRateLimits(db: SupabaseClient<Database>): Promise<OwnRateLimit[]> {
  const { data, error } = await db.rpc("my_rate_limits");
  if (error) {
    if (error.code === "PGRST202") return [];
    // Seul le code est journalisé.
    console.error(`[rate_limits] Lecture refusée (code ${error.code ?? "inconnu"}).`);
    throw new RateLimitsReadError();
  }
  return (data ?? []).map((row) => ({ action: row.action, windowStart: row.window_start, hits: row.hits }));
}
