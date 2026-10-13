"use server";

// Server Action de la page « Mon compte » : suppression du compte (RGPD, article 17).
//
// Protection CSRF : une Server Action ne s'appelle qu'en POST, et Next.js refuse la requête si son
// en-tête Origin ne correspond pas à l'hôte de la page (Host ou X-Forwarded-Host) ; les cookies de
// session sont en outre SameSite=Lax (jamais envoyés par un autre site pour un POST). Voir
// node_modules/next/dist/docs/01-app/02-guides/data-security.md, « Allowed origins ».
//
// Comme les autres actions de compte : entrées revalidées avec zod, messages génériques, aucune
// erreur brute renvoyée, jamais de mot de passe journalisé, tentatives limitées (rateLimit.ts).
import { cookies, headers } from "next/headers";
import { classifyAuthError, logAuthFailure } from "@/features/auth/authErrors";
import { errorState, invalidState, readFields, successState, type AuthFormState } from "@/features/auth/formState";
import { NOT_CONFIGURED, RATE_LIMITED, UNAVAILABLE } from "@/features/auth/messages";
import { checkAccountAttempt, checkAttempt, clientIp, trustedProxyHops } from "@/features/auth/rateLimit";
import { AccountDataError, deleteOwnAccount } from "@/lib/supabase/account";
import { DEMO_COOKIE, isSessionCookie } from "@/lib/supabase/cookies";
import { withPasswordSession, type PasswordCheck } from "@/lib/supabase/passwordCheck";
import { createClient } from "@/lib/supabase/server";
import { verifyUser } from "@/lib/supabase/user";
import {
  ACCOUNT_DELETED,
  DELETE_FAILED,
  NO_EMAIL,
  SESSION_CHANGED,
  SESSION_ENDED,
  WRONG_PASSWORD,
} from "./messages";
import { deleteAccountSchema } from "./schemas";

/** Efface de ce navigateur les cookies de session et celui du mode démo (réponse de l'action). */
async function clearAuthCookies() {
  const store = await cookies();
  for (const { name } of store.getAll()) if (isSessionCookie(name) || name === DEMO_COOKIE) store.delete(name);
}

/** Issue de l'appel à la fonction de la base, une fois le mot de passe vérifié. */
type DeleteOutcome =
  | { status: "deleted" }
  | { status: "other-account" }
  | { status: "failed"; code: string | undefined };

/**
 * « Supprimer mon compte » : session vérifiée auprès de l'API Auth (getUser), compte attendu par la
 * page (champ `account`), mot « SUPPRIMER », puis mot de passe : il ouvre une session temporaire avec
 * laquelle la fonction de la base delete_my_account est appelée (cartes, identités et sessions
 * supprimées en cascade). Enfin, cookies de session effacés. Le navigateur efface ensuite sa copie
 * locale du compte (DeleteAccountDialog).
 */
export async function deleteMyAccount(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = deleteAccountSchema.safeParse(readFields(formData, ["password", "confirm"]));
  if (!parsed.success) return invalidState(parsed.error);
  const supabase = await createClient();
  if (!supabase) return errorState(NOT_CONFIGURED);
  // Avant tout appel à Supabase : limite par IP du visiteur.
  if (checkAttempt("deleteAccount", clientIp(await headers(), trustedProxyHops())) !== "allowed") {
    return errorState(RATE_LIMITED);
  }

  const check = await verifyUser(supabase);
  if (check.status === "unavailable") return errorState(UNAVAILABLE);
  if (check.status === "signed-out") return errorState(SESSION_ENDED);
  const { user } = check;
  // Le cookie de session peut appartenir à un autre compte que celui affiché par la page
  // (déconnexion puis connexion dans un autre onglet) : on ne supprime jamais un autre compte.
  if (formData.get("account") !== user.id) return errorState(SESSION_CHANGED);
  // Limite par compte, commune à toutes les IP : un tiers muni d'une copie du cookie ne peut pas
  // essayer des mots de passe sans fin en changeant d'IP.
  if (!checkAccountAttempt("deleteAccount", user.id)) return errorState(RATE_LIMITED);
  if (!user.email) return errorState(NO_EMAIL);

  // Le mot de passe ouvre une session temporaire (client sans cookies : la session de ce navigateur
  // n'est pas modifiée), et c'est avec le jeton de CETTE session que la fonction de la base est
  // appelée : delete_my_account exige un jeton d'une session ouverte par mot de passe il y a moins de
  // 5 minutes, si bien qu'une copie du cookie de session ne permet pas de l'appeler directement.
  let outcome: PasswordCheck<DeleteOutcome> | null;
  try {
    outcome = await withPasswordSession(user.email, parsed.data.password, async ({ client, userId }) => {
      if (userId !== user.id) return { status: "other-account" };
      try {
        await deleteOwnAccount(client);
        return { status: "deleted" };
      } catch (error) {
        return { status: "failed", code: error instanceof AccountDataError ? error.code : undefined };
      }
    });
  } catch (error) {
    logAuthFailure("deleteMyAccount", error);
    return errorState(UNAVAILABLE);
  }
  if (!outcome) return errorState(NOT_CONFIGURED);
  if (!outcome.ok) {
    const kind = classifyAuthError(outcome.error);
    if (kind === "rate_limited") return errorState(RATE_LIMITED);
    if (kind === "unavailable") {
      logAuthFailure("deleteMyAccount", outcome.error);
      return errorState(UNAVAILABLE);
    }
    return errorState(WRONG_PASSWORD, { password: WRONG_PASSWORD });
  }
  const result = outcome.value;
  // Mot de passe d'un autre compte que celui de la session : rien n'est supprimé.
  if (result.status === "other-account") return errorState(WRONG_PASSWORD, { password: WRONG_PASSWORD });
  if (result.status === "failed") {
    // Seul le code est journalisé. La fonction s'exécute dans une transaction : rien n'a été supprimé.
    const { code } = result;
    console.error(`[account] Suppression refusée (code ${code ?? "inconnu"}).`);
    return errorState(code === "42501" || code?.startsWith("PGRST3") ? SESSION_ENDED : DELETE_FAILED);
  }

  // Les sessions du compte ont été supprimées avec lui : il ne reste qu'à effacer les cookies.
  await clearAuthCookies();
  return successState(ACCOUNT_DELETED);
}
