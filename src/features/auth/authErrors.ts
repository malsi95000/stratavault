import { isAuthError } from "@supabase/supabase-js";

// Classement des erreurs Supabase Auth en quelques catégories utiles à l'interface.
// Les détails (message brut, code) ne quittent jamais le serveur.

export type AuthFailure =
  | "rate_limited"
  | "unavailable"
  | "weak_password"
  | "same_password"
  | "session_missing"
  | "email_not_confirmed"
  | "other";

export function classifyAuthError(error: unknown): AuthFailure {
  if (!isAuthError(error)) return "unavailable";
  switch (error.code) {
    case "over_request_rate_limit":
      return "rate_limited";
    case "weak_password":
      return "weak_password";
    case "same_password":
      return "same_password";
    // Renvoyé seulement si le mot de passe est juste : ne permet pas l'énumération.
    case "email_not_confirmed":
      return "email_not_confirmed";
    case "session_not_found":
    case "session_expired":
    case "reauthentication_needed":
      return "session_missing";
    // over_email_send_rate_limit n'est pas « rate_limited » : il peut révéler qu'une adresse existe.
  }
  if (error.name === "AuthSessionMissingError") return "session_missing";
  if (error.status === undefined || error.status === 0 || error.status >= 500) return "unavailable";
  if (error.status === 429 && error.code !== "over_email_send_rate_limit") return "rate_limited";
  return "other";
}

/** Journalise sans donnée personnelle : seulement l'action, le type et le code de l'erreur. */
export function logAuthFailure(action: string, error: unknown): void {
  const detail = isAuthError(error) ? [error.name, error.code, error.status].filter((x) => x !== undefined) : ["exception"];
  console.error(`[auth] ${action} : ${detail.join(" ")}`);
}
