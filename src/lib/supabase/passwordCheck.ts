import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./config";
import type { Database } from "./database";

/** Client de la session ouverte par le mot de passe, et compte auquel elle appartient. */
export type PasswordSession = { client: SupabaseClient<Database>; userId: string };

/** Résultat de `run`, ou erreur de Supabase Auth à la vérification du mot de passe (à classer par l'appelant). */
export type PasswordCheck<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Vérifie un mot de passe auprès de Supabase Auth SANS toucher à la session de ce navigateur : un
 * client temporaire, sans cookies ni stockage (session gardée en mémoire, jetée après l'appel),
 * ouvre une session avec l’adresse et le mot de passe. Si elle s’ouvre, `run` reçoit ce client :
 * ses requêtes portent le jeton de cette session toute neuve (mot de passe saisi à l'instant, ce
 * qu'exige par exemple la fonction delete_my_account de la base). La session temporaire est fermée
 * ensuite, au mieux (un échec de fermeture est ignoré : elle expire seule). Les cookies de la session
 * courante ne sont ni lus ni réécrits. `null` si Supabase n'est pas configuré.
 */
export async function withPasswordSession<T>(
  email: string,
  password: string,
  run: (session: PasswordSession) => Promise<T>,
): Promise<PasswordCheck<T> | null> {
  const config = readSupabaseConfig();
  if (!config) return null;
  const client = createClient<Database>(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, error };
  try {
    return { ok: true, value: await run({ client, userId: data.user.id }) };
  } finally {
    try {
      await client.auth.signOut({ scope: "local" });
    } catch {
      // Session temporaire non fermée : elle expire seule (et disparaît si le compte est supprimé).
    }
  }
}
