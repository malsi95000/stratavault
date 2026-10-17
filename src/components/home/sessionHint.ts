// Libellé de l'accès au compte dans le menu fixe de l'accueil (ACC-04), deviné à partir des seuls
// cookies : aucun appel à Supabase pour afficher la page la plus visitée.

import { DEMO_COOKIE, isSessionCookie } from "@/lib/supabase/cookies";

type Cookie = { name: string; value: string };

/**
 * Vrai si ce navigateur a probablement un espace ouvert : un cookie de session Supabase (hors
 * vérificateur PKCE, posé avant toute connexion) ou l'accès démo. Affichage seulement, sans valeur de
 * sécurité : /espace vérifie la session et affiche « Session terminée », avec un lien vers la
 * connexion, si le cookie n'est plus valable.
 */
export function mayHaveSpace(cookies: readonly Cookie[]): boolean {
  return cookies.some(
    ({ name, value }) =>
      value !== "" &&
      ((isSessionCookie(name) && !name.endsWith("-code-verifier")) || (name === DEMO_COOKIE && value === "1")),
  );
}
