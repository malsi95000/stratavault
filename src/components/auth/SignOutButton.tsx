"use client";

import { useRef, useTransition } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { dialogs } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { endSession, signOut } from "@/features/auth/actions";
import { confirmSignOut } from "@/features/bank/bankActions";
import { activateStorage, finishSignOut, prepareSignOut } from "@/features/editor/storageSession";

export const SIGN_OUT_UNSENT =
  "Des modifications n’ont pas encore pu être enregistrées dans votre compte. Se déconnecter quand même ? Elles seront perdues.";
const SIGN_OUT_FAILED =
  "Déconnexion impossible : vérifiez votre connexion, puis réessayez. Rien n’a été effacé de ce navigateur.";

/**
 * « Se déconnecter » (Server Action, POST). Avec JavaScript : la carte hors banque est proposée à
 * l'enregistrement, les modifications en attente sont envoyées, la session est fermée côté serveur,
 * et seulement ensuite la copie locale du compte est effacée de ce navigateur.
 */
export default function SignOutButton({ userId }: { userId: string }) {
  const [, startTransition] = useTransition();
  // Garde contre un double clic ; le bouton reste actif pour récupérer le focus à la fermeture du dialogue.
  const busy = useRef(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Le formulaire reste fonctionnel sans JavaScript ; ici, l'action est lancée après les vérifications.
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      let leaving = false;
      try {
        const ready = await prepareSignOut(userId, {
          beforeLeave: (persistence) => confirmSignOut({ persistence, dialogs, notify: (m) => toast.error(m) }),
          confirmLoss: () => dialogs.confirm(SIGN_OUT_UNSENT, { confirmLabel: "Se déconnecter", destructive: true }),
        });
        if (!ready) return;
        let next: string;
        try {
          // Page de connexion, avec un avertissement si la session n'a pas pu être révoquée sur le
          // serveur (ses cookies sont effacés de ce navigateur dans tous les cas).
          ({ next } = await endSession());
        } catch {
          // Serveur injoignable : toujours connecté, rien n'a été effacé ; le compte est rouvert tel quel.
          toast.error(SIGN_OUT_FAILED);
          activateStorage({ kind: "account", userId });
          return;
        }
        await finishSignOut(userId);
        leaving = true;
        // Rechargement complet : plus rien du compte ne reste en mémoire dans cet onglet.
        window.location.assign(next);
      } finally {
        if (!leaving) busy.current = false;
      }
    });
  }

  return (
    <form action={signOut} onSubmit={onSubmit}>
      <Button type="submit" variant="panel" size="panel">
        Se déconnecter
      </Button>
    </form>
  );
}
