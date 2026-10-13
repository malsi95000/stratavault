// Garde du rafraîchissement de session dans le proxy.
//
// Pourquoi : getClaims() (src/lib/supabase/session.ts) accepte tout cookie de session qui contient
// access_token, refresh_token et expires_at. Si expires_at est passé, auth-js appelle
// POST /token?grant_type=refresh_token, depuis l'IP du serveur. Un visiteur qui envoie en boucle un
// faux cookie « expiré » ferait donc un appel /token par requête et épuiserait la limite /token de
// Supabase, commune à tous les visiteurs (plus de connexion ni de rafraîchissement pour personne).
// Le proxy repère ces cookies avant l'appel et compte chaque rafraîchissement par IP du visiteur.
import { combineChunks, stringFromBase64URL } from "@supabase/ssr";

/**
 * Marge avant l'expiration à partir de laquelle auth-js rafraîchit la session (EXPIRY_MARGIN_MS,
 * 90 s), arrondie au-dessus : mieux vaut compter un rafraîchissement de trop que d'en oublier un.
 */
export const REFRESH_MARGIN_MS = 120_000;

/** Cookie (ou morceau `.0`, `.1`…) qui porte la session : `sb-<projet>-auth-token`. */
const SESSION_TOKEN_COOKIE = /^(sb-.+-auth-token)(?:\.\d+)?$/;

const BASE64_PREFIX = "base64-";

type Cookie = { name: string; value: string };

/** Cookies qui portent la session (pas le vérificateur PKCE `…-auth-token-code-verifier`). */
export const isSessionTokenCookie = (name: string) => SESSION_TOKEN_COOKIE.test(name);

async function storedSession(key: string, values: Map<string, string>): Promise<unknown> {
  let text = await combineChunks(key, (name) => values.get(name));
  if (!text) return null;
  if (text.startsWith(BASE64_PREFIX)) {
    try {
      text = stringFromBase64URL(text.slice(BASE64_PREFIX.length));
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Vrai si l'un des cookies de session conduira auth-js à appeler /token (session à rafraîchir).
 * Mêmes règles qu'auth-js (`_isValidSession`, puis `expires_at` dans la marge) : une valeur illisible
 * ou incomplète est jetée par auth-js sans appel réseau, elle ne compte pas.
 */
export async function sessionNeedsRefresh(cookies: readonly Cookie[], now = Date.now()): Promise<boolean> {
  const values = new Map(cookies.map(({ name, value }) => [name, value]));
  const keys = new Set<string>();
  for (const { name } of cookies) {
    const match = SESSION_TOKEN_COOKIE.exec(name);
    if (match) keys.add(match[1]);
  }
  for (const key of keys) {
    const session = await storedSession(key, values);
    if (typeof session !== "object" || session === null) continue;
    if (!("access_token" in session && "refresh_token" in session && "expires_at" in session)) continue;
    if (!session.expires_at) continue;
    if (Number(session.expires_at) * 1000 - now < REFRESH_MARGIN_MS) return true;
  }
  return false;
}

/**
 * En-tête posé par le proxy sur la requête transmise au rendu et aux Server Actions quand la limite
 * de rafraîchissement de l'IP est atteinte : le client Supabase du serveur ignore alors les cookies
 * de session (aucun appel /token), sauf pour révoquer la session à la déconnexion. Les cookies
 * restent dans la requête : « Se déconnecter » peut ainsi les effacer et fermer la session.
 * Le proxy retire toujours celui qu'enverrait le navigateur (il ne peut que masquer sa propre session).
 */
export const REFRESH_LIMITED_HEADER = "x-stratavault-refresh-limited";

export const isRefreshLimited = (headers: Pick<Headers, "get">) => headers.get(REFRESH_LIMITED_HEADER) === "1";

/** Cookies sans ceux qui portent la session (requête traitée comme non connectée). */
export const withoutSessionTokens = <T extends Cookie>(cookies: readonly T[]): T[] =>
  cookies.filter(({ name }) => !isSessionTokenCookie(name));
