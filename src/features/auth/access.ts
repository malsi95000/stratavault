import { AFTER_SIGN_IN, LOGIN_PAGE, NEW_PASSWORD_PAGE, loginPageFor } from "./redirects";

// Règles d'accès appliquées par le proxy (vérification « optimiste » avant le rendu).
// Les Server Actions et les pages revérifient toujours l'utilisateur côté serveur.

export type AccessContext = {
  pathname: string;
  /** Supabase est configuré (sinon : mode démo pour tout le monde). */
  accountsEnabled: boolean;
  signedIn: boolean;
  /** L'utilisateur a choisi « Accès temporaire (démo) ». */
  demo: boolean;
  /** Méthode HTTP (GET par défaut). */
  method?: string;
};

export type AccessDecision = { type: "next" } | { type: "redirect"; to: string };

const PROTECTED = ["/espace", "/carte", "/compte", "/profil", "/contacts"];
/**
 * Pages réservées aux comptes connectés : le mode démo n'y donne pas accès (carte collective). La
 * connexion ramène ensuite à la page de base (loginPageFor).
 */
const ACCOUNT_ONLY = ["/carte-collective"];
const GUEST_ONLY = ["/connexion", "/inscription"];

const matches = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);
const inList = (pathname: string, list: string[]) => list.some((base) => matches(pathname, base));

export function decideAccess({ pathname, accountsEnabled, signedIn, demo, method = "GET" }: AccessContext): AccessDecision {
  if (!accountsEnabled) return { type: "next" };
  // Seules les navigations sont redirigées. Une Server Action (POST) répond elle-même « non connecté » :
  // une redirection serait suivie par fetch et ferait passer une session expirée pour une panne réseau.
  if (method !== "GET" && method !== "HEAD") return { type: "next" };
  if (signedIn && inList(pathname, GUEST_ONLY)) return { type: "redirect", to: AFTER_SIGN_IN };
  if (!signedIn && !demo && inList(pathname, PROTECTED)) return { type: "redirect", to: LOGIN_PAGE };
  const accountOnly = ACCOUNT_ONLY.find((base) => matches(pathname, base));
  if (!signedIn && accountOnly) return { type: "redirect", to: loginPageFor(accountOnly) };
  // Le nouveau mot de passe exige la session ouverte par le lien de réinitialisation.
  if (!signedIn && matches(pathname, NEW_PASSWORD_PAGE)) return { type: "redirect", to: "/mot-de-passe-oublie" };
  return { type: "next" };
}
