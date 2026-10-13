import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { SupabaseConfig } from "./config";
import { secureCookieOptions, type PendingCookie } from "./cookies";

export type SessionRefresh = {
  signedIn: boolean;
  /** Recopie sur la réponse les cookies renouvelés et les en-têtes anti-cache associés. */
  applyTo: (response: NextResponse) => void;
};

/**
 * Rafraîchit la session Supabase pour le proxy : le jeton expiré est renouvelé, les nouveaux
 * cookies sont écrits sur la requête (pour le rendu qui suit) et sur la réponse (pour le navigateur).
 */
export async function refreshSession(request: NextRequest, config: SupabaseConfig): Promise<SessionRefresh> {
  const pending: PendingCookie[] = [];
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookieOptions: secureCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          pending.push({ name, value, options: secureCookieOptions(options) });
        }
        Object.assign(pendingHeaders, headers);
      },
    },
  });

  let signedIn = false;
  try {
    // Signature du jeton seulement (rapide, sans appel à l'API Auth) : sert aux redirections du
    // proxy. Le rendu de /carte et /espace et les Server Actions revérifient la session auprès de
    // l'API Auth (checkActiveUser), qui voit les sessions révoquées.
    const { data, error } = await supabase.auth.getClaims();
    signedIn = !error && Boolean(data?.claims.sub);
  } catch {
    // Service injoignable ou configuration factice : on continue sans session.
  }

  return {
    signedIn,
    applyTo(response) {
      for (const { name, value, options } of pending) response.cookies.set(name, value, options);
      for (const [key, value] of Object.entries(pendingHeaders)) response.headers.set(key, value);
    },
  };
}
