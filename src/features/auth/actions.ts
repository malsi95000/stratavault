"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, demoCookieOptions, isSessionCookie } from "@/lib/supabase/cookies";
import { isRefreshLimited } from "@/lib/supabase/refreshGuard";
import { createClient } from "@/lib/supabase/server";
import { verifyUser } from "@/lib/supabase/user";
import { classifyAuthError, logAuthFailure, type AuthFailure } from "./authErrors";
import { errorState, invalidState, readFields, successState, type AuthFormState } from "./formState";
import {
  EMAIL_NOT_CONFIRMED,
  INVALID_CREDENTIALS,
  NOT_CONFIGURED,
  RATE_LIMITED,
  RECOVERY_EXPIRED,
  RESET_SENT,
  SAME_PASSWORD,
  SIGN_UP_SENT,
  UNAVAILABLE,
  UPDATE_FAILED,
  WEAK_PASSWORD,
} from "./messages";
import { parseEmailLink } from "./emailLink";
import { resolveOrigin } from "./origin";
import { checkAttempt, clientIp, trustedProxyHops, type AttemptVerdict, type AuthAttempt } from "./rateLimit";
import { isRecentAuthentication } from "./recentAuth";
import {
  ACCOUNT_OPENED_PAGE,
  AFTER_SIGN_IN,
  LINK_ERROR_PAGE,
  LINK_RATE_LIMITED_PAGE,
  LOGIN_PAGE,
  NEW_PASSWORD_PAGE,
  SIGNED_OUT_NOT_REVOKED_PAGE,
} from "./redirects";
import { newPasswordSchema, resetRequestSchema, signInSchema, signUpSchema } from "./schemas";

// Server Actions des comptes. Chaque action revalide ses entrées avec zod, ne renvoie que des
// messages génériques (aucune erreur brute, aucune indication sur l'existence d'un compte)
// et ne redirige que vers des chemins internes fixes. Les tentatives sont limitées par IP du
// visiteur et par couple (IP, adresse e-mail) (rateLimit.ts) avant tout appel à Supabase.

const notConfigured = () => errorState(NOT_CONFIGURED);

/** Seuls ces cas ont un message propre à la connexion ; tous les autres : INVALID_CREDENTIALS. */
const SIGN_IN_MESSAGES: Partial<Record<AuthFailure, string>> = {
  rate_limited: RATE_LIMITED,
  unavailable: UNAVAILABLE,
  email_not_confirmed: EMAIL_NOT_CONFIRMED,
};

async function appOrigin(): Promise<string | null> {
  const h = await headers();
  return resolveOrigin({
    siteUrl: process.env.SITE_URL,
    origin: h.get("origin"),
    host: h.get("x-forwarded-host") ?? h.get("host"),
    proto: h.get("x-forwarded-proto"),
  });
}

/** Lien de confirmation envoyé par e-mail : route /auth/confirm, puis page interne `next`. */
async function confirmUrl(next: string): Promise<string | undefined> {
  const origin = await appOrigin();
  return origin ? `${origin}/auth/confirm?next=${encodeURIComponent(next)}` : undefined;
}

/** Compte la tentative de ce visiteur (et pour cette adresse) dans les limites de débit. */
async function rateLimit(attempt: AuthAttempt, email?: string): Promise<AttemptVerdict> {
  return checkAttempt(attempt, clientIp(await headers(), trustedProxyHops()), email);
}

async function clearDemo() {
  (await cookies()).delete(DEMO_COOKIE);
}

async function clearSessionCookies() {
  const store = await cookies();
  for (const { name } of store.getAll()) if (isSessionCookie(name)) store.delete(name);
}

export async function signIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(readFields(formData, ["email", "password"]));
  if (!parsed.success) return invalidState(parsed.error);
  const supabase = await createClient();
  if (!supabase) return notConfigured();
  if ((await rateLimit("signIn", parsed.data.email)) !== "allowed") return errorState(RATE_LIMITED);

  try {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      const kind = classifyAuthError(error);
      if (kind === "unavailable") logAuthFailure("signIn", error);
      return errorState(SIGN_IN_MESSAGES[kind] ?? INVALID_CREDENTIALS);
    }
  } catch (error) {
    logAuthFailure("signIn", error);
    return errorState(UNAVAILABLE);
  }

  await clearDemo();
  redirect(AFTER_SIGN_IN);
}

export async function signUp(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(readFields(formData, ["email", "password", "confirm"]));
  if (!parsed.success) return invalidState(parsed.error);
  const supabase = await createClient();
  if (!supabase) return notConfigured();
  if ((await rateLimit("signUp")) !== "allowed") return errorState(RATE_LIMITED);

  try {
    const { email, password } = parsed.data;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: await confirmUrl(AFTER_SIGN_IN) },
    });
    if (error) {
      const kind = classifyAuthError(error);
      if (kind === "weak_password") return errorState(WEAK_PASSWORD, { password: WEAK_PASSWORD });
      if (kind === "rate_limited") return errorState(RATE_LIMITED);
      if (kind === "unavailable") {
        logAuthFailure("signUp", error);
        return errorState(UNAVAILABLE);
      }
      // Adresse déjà inscrite, envoi d'e-mail limité… : même réponse qu'en cas de succès.
    }
  } catch (error) {
    logAuthFailure("signUp", error);
    return errorState(UNAVAILABLE);
  }

  return successState(SIGN_UP_SENT);
}

export async function requestPasswordReset(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetRequestSchema.safeParse(readFields(formData, ["email"]));
  if (!parsed.success) return invalidState(parsed.error);
  const supabase = await createClient();
  if (!supabase) return notConfigured();
  const verdict = await rateLimit("reset", parsed.data.email);
  if (verdict === "limited") return errorState(RATE_LIMITED);
  // Plafond de l'adresse atteint : même réponse qu'un envoi, mais rien n'est envoyé.
  if (verdict === "silenced") return successState(RESET_SENT);

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: await confirmUrl(NEW_PASSWORD_PAGE),
    });
    if (error) {
      const kind = classifyAuthError(error);
      if (kind === "rate_limited") return errorState(RATE_LIMITED);
      if (kind === "unavailable") {
        logAuthFailure("requestPasswordReset", error);
        return errorState(UNAVAILABLE);
      }
    }
  } catch (error) {
    logAuthFailure("requestPasswordReset", error);
    return errorState(UNAVAILABLE);
  }

  return successState(RESET_SENT);
}

export async function updatePassword(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse(readFields(formData, ["password", "confirm"]));
  if (!parsed.success) return invalidState(parsed.error);
  const supabase = await createClient();
  if (!supabase) return notConfigured();
  if ((await rateLimit("updatePassword")) !== "allowed") return errorState(RATE_LIMITED);

  try {
    // Session vérifiée auprès de l'API Auth (une session révoquée par « Se déconnecter » est
    // refusée, même avec une copie du cookie), et authentification récente exigée : celle ouverte
    // par le lien de réinitialisation passe ; une session ancienne (appareil resté ouvert) non.
    const check = await verifyUser(supabase);
    if (check.status === "unavailable") return errorState(UNAVAILABLE);
    if (check.status === "signed-out") return errorState(RECOVERY_EXPIRED);
    const { data } = await supabase.auth.getClaims();
    if (!data || data.claims.sub !== check.user.id || !isRecentAuthentication(data.claims.amr)) {
      return errorState(RECOVERY_EXPIRED);
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      const kind = classifyAuthError(error);
      if (kind === "weak_password") return errorState(WEAK_PASSWORD, { password: WEAK_PASSWORD });
      if (kind === "same_password") return errorState(SAME_PASSWORD, { password: SAME_PASSWORD });
      if (kind === "session_missing") return errorState(RECOVERY_EXPIRED);
      if (kind === "rate_limited") return errorState(RATE_LIMITED);
      logAuthFailure("updatePassword", error);
      return errorState(kind === "unavailable" ? UNAVAILABLE : UPDATE_FAILED);
    }
  } catch (error) {
    logAuthFailure("updatePassword", error);
    return errorState(UNAVAILABLE);
  }

  redirect(AFTER_SIGN_IN);
}

/**
 * Lien reçu par e-mail, validé seulement quand l'utilisateur clique « Continuer » sur /auth/confirm
 * (POST). Un simple GET ne consomme pas le jeton : les antivirus de messagerie qui ouvrent les liens
 * ne le « grillent » pas, et un GET piégé (image, redirection) n'ouvre aucune session.
 * Limite : le clic ouvre la session du compte auquel le lien appartient. Un tiers qui transmet le lien
 * reçu pour SON compte peut donc y connecter la victime (connexion forcée). Atténuation : la page
 * prévient de n'utiliser que ses propres liens ; une fois le jeton consommé, une page affiche
 * l'adresse du compte ouvert avant d'aller plus loin, avec « Ce n'est pas mon compte — se
 * déconnecter » ; /espace et l'éditeur affichent aussi cette adresse.
 */
export async function confirmEmailLink(formData: FormData): Promise<void> {
  const link = parseEmailLink((name) => formData.get(name));
  const supabase = link ? await createClient() : null;
  // Chaque essai appelle Supabase depuis l'IP du serveur, dont les limites sont communes à tous les
  // visiteurs : un seul visiteur ne doit pas pouvoir les épuiser (rateLimit.ts).
  if (link && supabase && (await rateLimit("confirm")) !== "allowed") redirect(LINK_RATE_LIMITED_PAGE);
  let confirmed = false;
  if (link && supabase) {
    try {
      const { error } =
        link.kind === "otp"
          ? await supabase.auth.verifyOtp({ type: link.type, token_hash: link.tokenHash })
          : await supabase.auth.exchangeCodeForSession(link.code);
      confirmed = !error;
      if (error) logAuthFailure("confirm", error);
    } catch (error) {
      logAuthFailure("confirm", error);
    }
  }
  // Page d'erreur ouverte à tous : /connexion renverrait un utilisateur connecté vers /espace sans message.
  if (!link || !confirmed) redirect(LINK_ERROR_PAGE);
  // Session ouverte : le mode démo éventuel n'a plus lieu d'être (comme après signIn).
  await clearDemo();
  // Avant d'entrer : page qui affiche le compte ouvert, avec « Ce n'est pas mon compte » (connexion
  // forcée par un lien transmis par un tiers, voir plus haut).
  redirect(`${ACCOUNT_OPENED_PAGE}?next=${encodeURIComponent(link.next)}`);
}

/**
 * Résultat de la déconnexion. Les cookies de session sont toujours effacés de ce navigateur ;
 * `revoked` est faux si la session n'a pas pu être fermée chez Supabase (service injoignable, ou
 * trop de requêtes depuis cette IP) : elle reste alors valide pour qui en aurait une copie.
 */
export type SignOutResult = { revoked: boolean };

/** Ferme la session Supabase de ce navigateur et quitte le mode démo. */
async function closeSession(): Promise<SignOutResult> {
  // Limite de rafraîchissement de l'IP atteinte (proxy) : la session est masquée au reste de
  // l'application. La révoquer peut coûter un dernier rafraîchissement (/token), permis par un quota
  // séparé ; au-delà, les cookies sont effacés sans révocation, et c'est signalé.
  const limited = isRefreshLimited(await headers());
  const mayRevoke = !limited || (await rateLimit("signOut")) === "allowed";
  const supabase = await createClient({ evenIfRefreshLimited: mayRevoke });
  let revoked = true;
  if (supabase) {
    if (!mayRevoke) revoked = false;
    else {
      try {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) {
          revoked = false;
          logAuthFailure("signOut", error);
        }
      } catch (error) {
        revoked = false;
        logAuthFailure("signOut", error);
      }
    }
    // Dans tous les cas, plus aucun cookie de session ne reste dans ce navigateur.
    await clearSessionCookies();
  }
  await clearDemo();
  return { revoked };
}

/** Page de connexion après la déconnexion, avec un avertissement si la session n'a pas pu être révoquée. */
const afterSignOut = ({ revoked }: SignOutResult) => (revoked ? LOGIN_PAGE : SIGNED_OUT_NOT_REVOKED_PAGE);

/** « Se déconnecter » sans JavaScript (formulaire POST) : session fermée, puis page de connexion. */
export async function signOut(): Promise<void> {
  redirect(afterSignOut(await closeSession()));
}

/**
 * « Se déconnecter » avec JavaScript : ferme la session sans rediriger. Le navigateur n'efface sa
 * copie locale du compte qu'une fois cette action réussie, puis va lui-même à la page indiquée.
 */
export async function endSession(): Promise<{ next: string }> {
  return { next: afterSignOut(await closeSession()) };
}

/** « Accès temporaire (démo) » : mémorise ce choix (cookie sans donnée personnelle). */
export async function enterDemo(): Promise<void> {
  (await cookies()).set(DEMO_COOKIE, "1", demoCookieOptions());
  redirect(AFTER_SIGN_IN);
}
