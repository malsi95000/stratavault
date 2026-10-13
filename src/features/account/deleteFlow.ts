// Suppression du compte vue du navigateur (DeleteAccountDialog) : appel de la Server Action, puis,
// si le compte a été supprimé, nettoyage local et départ vers l'accueil.
//
// Le nettoyage se fait dans la suite de l'appel, et non dans un effet du composant : la Server Action
// efface les cookies de session, ce qui fait re-rendre /compte dans la même réponse (page « sans
// session ») et démonte le dialogue ; un effet qui attendrait l'état « succès » ne s'exécuterait
// jamais (node_modules/next/dist/docs/01-app/02-guides/server-actions.md).
import { errorState, type AuthFormState } from "@/features/auth/formState";
import { UNAVAILABLE } from "@/features/auth/messages";
import { ACCOUNT_DELETED_PATH } from "./notices";

type DeletionSteps = {
  /** Appelle la Server Action deleteMyAccount. */
  submit: (data: FormData) => Promise<AuthFormState>;
  /** Efface la copie locale du compte et ferme ses autres onglets (forgetDeletedAccount). */
  forget: (userId: string) => Promise<void>;
  /** Quitte la page (rechargement complet). */
  leave: (path: string) => void;
};

/**
 * Envoie la demande de suppression du compte `userId`. En cas d'échec, renvoie l'état à afficher,
 * sans rien effacer de ce navigateur. Si le compte a été supprimé : copie locale effacée, autres onglets du compte
 * fermés, puis retour à l'accueil avec un message de confirmation (même si l'effacement local a
 * échoué : la base locale restante est alors effacée plus tard, au plus tard quand un compte s’ouvre
 * dans ce navigateur, voir purgeAccountCopies).
 */
export async function submitAccountDeletion(
  userId: string,
  data: FormData,
  { submit, forget, leave }: DeletionSteps,
): Promise<AuthFormState> {
  let result: AuthFormState;
  try {
    result = await submit(data);
  } catch {
    // Serveur injoignable ou réponse perdue.
    return errorState(UNAVAILABLE);
  }
  if (result.status !== "success") return result;
  try {
    await forget(userId);
  } catch {
    // Voir plus haut : la copie locale sera effacée plus tard.
  }
  leave(ACCOUNT_DELETED_PATH);
  return result;
}
