import "server-only";

import { checkActiveAccount } from "@/lib/supabase/user";
import { termsChangeVisible } from "./termsChange";

/**
 * Vrai si l'avis de changement des textes doit être montré au compte connecté (date de création lue
 * auprès de l'API Auth, même appel que la vérification de la session de la page).
 */
export async function termsChangeShownToAccount(now: Date = new Date()): Promise<boolean> {
  const check = await checkActiveAccount();
  return check.status === "signed-in" && termsChangeVisible(now, check.account.createdAt);
}
