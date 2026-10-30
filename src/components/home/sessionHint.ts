// Libellés de l'accueil qui dépendent de la session (menu fixe ACC-04, encart de la carte collective),
// devinés à partir des seuls cookies : aucun appel à Supabase pour afficher la page la plus visitée.

import { DEMO_COOKIE, isSessionCookie } from "@/lib/supabase/cookies";

type Cookie = { name: string; value: string };

/**
 * Vrai si ce navigateur a probablement une session de compte : un cookie de session Supabase non vide
 * (hors vérificateur PKCE, posé avant toute connexion). Affichage seulement, sans valeur de sécurité.
 */
export function mayHaveAccountSession(cookies: readonly Cookie[]): boolean {
  return cookies.some(({ name, value }) => value !== "" && isSessionCookie(name) && !name.endsWith("-code-verifier"));
}

/**
 * Vrai si ce navigateur a probablement un espace ouvert : une session de compte ou l'accès démo.
 * Affichage seulement, sans valeur de sécurité : /espace vérifie la session et affiche « Session
 * terminée », avec un lien vers la connexion, si le cookie n'est plus valable.
 */
export function mayHaveSpace(cookies: readonly Cookie[]): boolean {
  return mayHaveAccountSession(cookies) || cookies.some(({ name, value }) => name === DEMO_COOKIE && value === "1");
}
