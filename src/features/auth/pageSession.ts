// Mode d'une page qui affiche des cartes (/carte, /espace), d'après la vérification de session faite
// côté serveur. La démo locale n'est jamais un repli : un compte dont la session ne peut pas être
// vérifiée (Supabase injoignable) ne doit pas écrire dans la base de démo partagée de ce navigateur.
import type { Account } from "@/features/storage";
import type { UserCheck } from "@/lib/supabase/user";

export type PageSession =
  | { kind: "account"; account: Account }
  | { kind: "demo" }
  /** Comptes actifs, ni session ni choix de la démo (session expirée, déconnexion en cours). */
  | { kind: "signed-out" }
  /** Session impossible à vérifier pour le moment : ni compte ni démo. */
  | { kind: "unavailable" };

export function pageSession(
  check: UserCheck,
  { accountsEnabled, demo }: { accountsEnabled: boolean; demo: boolean },
): PageSession {
  switch (check.status) {
    case "signed-in":
      return { kind: "account", account: { userId: check.user.id, email: check.user.email } };
    case "unavailable":
      return { kind: "unavailable" };
    case "signed-out":
      return !accountsEnabled || demo ? { kind: "demo" } : { kind: "signed-out" };
  }
}
