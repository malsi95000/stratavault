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
 * Pages où la connexion ramène quand le proxy y a renvoyé un visiteur non connecté (paramètre `next`
 * de /connexion) : la carte collective (src/features/collective/paths.ts), réservée aux comptes
 * connectés, vers laquelle mène l'encart de l'accueil (COM-01). Toute autre valeur : AFTER_SIGN_IN.
 */
const SIGN_IN_RETURN_PATHS = new Set(["/carte-collective"]);

/** Chemin d'une page de l'application désignée par `value`, ou null (URL externe, chemin piégé). */
function internalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(value, "http://stratavault.invalid");
  } catch {
    return null;
  }
  return url.origin === "http://stratavault.invalid" ? url.pathname : null;
}

/**
 * Renvoie `value` s'il désigne une page autorisée de l'application, sinon `fallback`.
 * Refuse les URL absolues, `//hôte`, les barres obliques inverses et tout chemin hors liste.
 */
export function safeNextPath(value: string | null | undefined, fallback: string = AFTER_SIGN_IN): string {
  const path = internalPath(value);
  return path !== null && ALLOWED_PATHS.has(path) ? path : fallback;
}

/** Page où ramener après la connexion : `value` s'il est dans SIGN_IN_RETURN_PATHS, sinon AFTER_SIGN_IN. */
export function signInReturnPath(value: string | null | undefined): string {
  const path = internalPath(value);
  return path !== null && SIGN_IN_RETURN_PATHS.has(path) ? path : AFTER_SIGN_IN;
}

/** Page de connexion qui ramènera à `path` (une des SIGN_IN_RETURN_PATHS) une fois connecté. */
export const loginPageFor = (path: string) =>
  SIGN_IN_RETURN_PATHS.has(path) ? `${LOGIN_PAGE}?next=${encodeURIComponent(path)}` : LOGIN_PAGE;
