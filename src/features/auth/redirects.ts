// Redirections après authentification : uniquement vers des pages de l'application.

export const AFTER_SIGN_IN = "/espace";
export const LOGIN_PAGE = "/connexion";
export const NEW_PASSWORD_PAGE = "/nouveau-mot-de-passe";
/** Lien d'e-mail invalide ou expiré : page ouverte aux visiteurs connectés ou non. */
export const LINK_ERROR_PAGE = "/auth/confirm?erreur=lien";
/** Trop d'essais de liens d'e-mail depuis cette IP : même page, autre message. */
export const LINK_RATE_LIMITED_PAGE = "/auth/confirm?erreur=trop";
/** Après un lien reçu par e-mail : affiche le compte ouvert avant d'entrer (paramètre `next`). */
export const ACCOUNT_OPENED_PAGE = "/auth/compte";
/** Déconnexion dont la session n'a pas pu être révoquée chez Supabase (cookies effacés quand même). */
export const SIGNED_OUT_NOT_REVOKED_PAGE = "/connexion?erreur=session";

const ALLOWED_PATHS = new Set(["/", "/espace", "/carte", NEW_PASSWORD_PAGE]);

/**
 * Renvoie `value` s'il désigne une page autorisée de l'application, sinon `fallback`.
 * Refuse les URL absolues, `//hôte`, les barres obliques inverses et tout chemin hors liste.
 */
export function safeNextPath(value: string | null | undefined, fallback: string = AFTER_SIGN_IN): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  let url: URL;
  try {
    url = new URL(value, "http://stratavault.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://stratavault.invalid") return fallback;
  return ALLOWED_PATHS.has(url.pathname) ? url.pathname : fallback;
}
