import type { CookieOptions } from "@supabase/ssr";

/** Cookie posé par « Accès temporaire (démo) » : il ne contient aucune donnée personnelle. */
export const DEMO_COOKIE = "sv-demo";

const DEMO_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Durée de vie maximale des cookies de session (en secondes) : 30 jours, au lieu des 400 jours que
 * @supabase/ssr impose. Le cookie est réécrit à chaque renouvellement de la session : il n'expire
 * donc qu'après 30 jours sans utilisation du compte dans ce navigateur (durée limitée à la finalité,
 * lignes directrices de la CNIL sur les traceurs exemptés).
 */
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Options imposées à tous les cookies de session Supabase, quelles que soient celles proposées
 * par la bibliothèque : inaccessibles au JavaScript du navigateur, HTTPS en production,
 * jamais envoyés par un autre site pour une requête POST, et 30 jours au plus.
 */
export function secureCookieOptions(options: CookieOptions = {}, production = isProduction()): CookieOptions {
  const capped = options.maxAge === undefined ? {} : { maxAge: Math.min(options.maxAge, SESSION_COOKIE_MAX_AGE) };
  return { ...options, ...capped, httpOnly: true, secure: production, sameSite: "lax", path: "/" };
}

export function demoCookieOptions(production = isProduction()): CookieOptions {
  return secureCookieOptions({ maxAge: DEMO_MAX_AGE }, production);
}

export type PendingCookie = { name: string; value: string; options: CookieOptions };

/** Cookies de session Supabase (`sb-<projet>-auth-token`, ses morceaux `.0`, `.1`… et le vérificateur PKCE). */
export function isSessionCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}
