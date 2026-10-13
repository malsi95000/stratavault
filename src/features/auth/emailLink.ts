import type { EmailOtpType } from "@supabase/supabase-js";
import { AFTER_SIGN_IN, NEW_PASSWORD_PAGE, safeNextPath } from "./redirects";

// Lien reçu par e-mail (confirmation d'inscription, réinitialisation du mot de passe).
// Deux formats, comme dans la documentation Supabase SSR :
// - `token_hash` + `type` (modèles d'e-mail recommandés, fonctionnent dans n'importe quel navigateur) ;
// - `code` (flux PKCE par défaut, à ouvrir dans le navigateur qui a fait la demande).

export type EmailLink =
  | { kind: "otp"; tokenHash: string; type: EmailOtpType; next: string }
  | { kind: "code"; code: string; next: string };

const OTP_TYPES = new Set<string>(["signup", "email", "recovery", "invite", "email_change"]);
const isOtpType = (value: string): value is EmailOtpType => OTP_TYPES.has(value);

/** Jetons Supabase : courts, sans caractère spécial. Tout le reste est refusé. */
const TOKEN = /^[A-Za-z0-9_-]{1,512}$/;

type Raw = (name: string) => unknown;

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Lit un lien depuis l'adresse ou le formulaire de confirmation ; `null` s'il est incomplet ou invalide. */
export function parseEmailLink(get: Raw): EmailLink | null {
  const tokenHash = text(get("token_hash"));
  const type = text(get("type"));
  const code = text(get("code"));
  const next = safeNextPath(text(get("next")), type === "recovery" ? NEW_PASSWORD_PAGE : AFTER_SIGN_IN);
  if (TOKEN.test(tokenHash) && isOtpType(type)) return { kind: "otp", tokenHash, type, next };
  if (TOKEN.test(code)) return { kind: "code", code, next };
  return null;
}

/** Le lien sert-il à choisir un nouveau mot de passe ? (texte de la page de confirmation) */
export const isRecoveryLink = (link: EmailLink) =>
  link.kind === "otp" ? link.type === "recovery" : link.next === NEW_PASSWORD_PAGE;
