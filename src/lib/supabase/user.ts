import "server-only";

import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { cache } from "react";
import { createClient, type ServerSupabaseClient } from "./server";

export type CurrentUser = { id: string; email: string | null };

/**
 * Résultat de la vérification de session :
 * - signed-in : utilisateur vérifié ;
 * - signed-out : pas de session valide (ou Supabase non configuré) ;
 * - unavailable : vérification impossible (Supabase injoignable, panne passagère).
 */
export type UserCheck =
  | { status: "signed-in"; user: CurrentUser }
  | { status: "signed-out" }
  | { status: "unavailable" };

/**
 * Vérifie la session côté serveur : `getClaims()` valide la signature du jeton (jamais
 * `getSession()`, qui lit le cookie sans vérification). Elle ne voit pas une session révoquée par
 * « Se déconnecter » (le jeton reste signé jusqu'à son expiration) : réservée à l'affichage (adresse
 * du compte, liens) et aux pages de compte. Toute décision d'accès aux données passe par
 * checkActiveUser.
 */
export const checkCurrentUser = cache(async (): Promise<UserCheck> => {
  const supabase = await createClient();
  if (!supabase) return { status: "signed-out" };
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) return { status: isAuthRetryableFetchError(error) ? "unavailable" : "signed-out" };
    if (!data) return { status: "signed-out" };
    const { sub, email } = data.claims;
    return { status: "signed-in", user: { id: sub, email: typeof email === "string" ? email : null } };
  } catch {
    // Exception hors erreur Auth (réseau, clés de signature injoignables) : rien ne dit que la session est finie.
    return { status: "unavailable" };
  }
});

/** Erreur passagère de l'API Auth (réseau, surcharge, limite de débit) : rien ne dit que la session est finie. */
const isTransient = (error: unknown) =>
  isAuthRetryableFetchError(error) || (isAuthApiError(error) && (error.status === 429 || error.status >= 500));

/** Fiche du compte renvoyée par l'API Auth (getUser), réduite à ce que l'application affiche ou exporte. */
export type AccountDetails = CurrentUser & {
  createdAt: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
};

export type AccountCheck =
  | { status: "signed-in"; account: AccountDetails }
  | { status: "signed-out" }
  | { status: "unavailable" };

/**
 * Vérifie la session de `supabase` auprès de l'API Auth (`getUser()`, un aller-retour réseau) et
 * renvoie la fiche du compte. `getClaims()` ne vérifie que la signature du jeton : une session
 * révoquée par « Se déconnecter » resterait acceptée jusqu'à l'expiration du jeton (une heure par
 * défaut). L'API Auth, elle, répond `session_not_found` dès la révocation : une copie du cookie de
 * session ne sert plus à rien.
 */
export async function verifyAccount(supabase: ServerSupabaseClient): Promise<AccountCheck> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return { status: isTransient(error) ? "unavailable" : "signed-out" };
    const user = data.user;
    if (!user) return { status: "signed-out" };
    return {
      status: "signed-in",
      account: {
        id: user.id,
        email: user.email ?? null,
        createdAt: user.created_at ?? null,
        emailConfirmedAt: user.email_confirmed_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
      },
    };
  } catch {
    // Exception hors erreur Auth (réseau) : rien ne dit que la session est finie.
    return { status: "unavailable" };
  }
}

/** Comme verifyAccount, réduit à l'identifiant et à l'adresse e-mail. */
export async function verifyUser(supabase: ServerSupabaseClient): Promise<UserCheck> {
  const check = await verifyAccount(supabase);
  if (check.status !== "signed-in") return check;
  return { status: "signed-in", user: { id: check.account.id, email: check.account.email } };
}

/** Fiche du compte vérifiée auprès de l'API Auth, une fois par requête (page « Mon compte »). */
export const checkActiveAccount = cache(async (): Promise<AccountCheck> => {
  const supabase = await createClient();
  return supabase ? verifyAccount(supabase) : { status: "signed-out" };
});

/**
 * Session vérifiée auprès de l'API Auth (verifyUser), une fois par requête : rendu de /carte et
 * /espace et toutes les Server Actions des cartes.
 */
export const checkActiveUser = cache(async (): Promise<UserCheck> => {
  const supabase = await createClient();
  return supabase ? verifyUser(supabase) : { status: "signed-out" };
});

/** Utilisateur du jeton (signature vérifiée, affichage seulement) ; `null` sans session valide ou si la vérification est impossible. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const check = await checkCurrentUser();
  return check.status === "signed-in" ? check.user : null;
});
