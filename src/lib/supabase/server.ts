import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { readSupabaseConfig } from "./config";
import { secureCookieOptions } from "./cookies";
import type { Database } from "./database";
import { isRefreshLimited, withoutSessionTokens } from "./refreshGuard";

type ClientOptions = {
  /**
   * Voir la session même si le proxy a atteint la limite de rafraîchissement de cette IP
   * (REFRESH_LIMITED_HEADER). Réservé à la déconnexion, qui doit pouvoir révoquer la session ; elle
   * applique son propre quota avant de le demander.
   */
  evenIfRefreshLimited?: boolean;
};

/**
 * Client Supabase pour les Server Components, Server Actions et Route Handlers.
 * Un nouveau client par requête ; `null` si Supabase n'est pas configuré (mode démo).
 * Si le proxy a atteint la limite de rafraîchissement de cette IP, la requête est traitée comme non
 * connectée : les cookies de session sont ignorés (aucun appel /token à Supabase).
 */
export async function createClient({ evenIfRefreshLimited = false }: ClientOptions = {}) {
  const config = readSupabaseConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  const hideSession = !evenIfRefreshLimited && isRefreshLimited(await headers());

  return createServerClient<Database>(config.url, config.publishableKey, {
    cookieOptions: secureCookieOptions(),
    cookies: {
      getAll() {
        const all = cookieStore.getAll();
        return hideSession ? withoutSessionTokens(all) : all;
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, secureCookieOptions(options));
          }
        } catch {
          // Appel depuis un Server Component : écriture impossible, le proxy rafraîchit la session.
        }
      },
    },
  });
}

export type ServerSupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;
