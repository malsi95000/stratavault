"use client";

import { useActionState } from "react";
import FormMessage from "@/components/auth/FormMessage";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/features/auth/actions";
import { INITIAL_AUTH_STATE } from "@/features/auth/formState";
import { passwordChangeRequested } from "../messages";

/**
 * « Changer mon mot de passe » : flux existant du mot de passe oublié, pour l'adresse du compte.
 * Un lien est envoyé par e-mail ; il ouvre la page du nouveau mot de passe (authentification
 * récente exigée par updatePassword). Fonctionne aussi sans JavaScript.
 */
export default function PasswordChange({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, INITIAL_AUTH_STATE);

  return (
    <>
      <form action={formAction} aria-busy={pending}>
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="panel" size="panel" disabled={pending}>
          {pending ? "Envoi…" : "Recevoir un lien de changement par e-mail"}
        </Button>
      </form>
      {/* Succès : message propre à cette page (adresse affichée), au lieu de celui du mot de passe oublié. */}
      <FormMessage
        state={state.status === "success" ? { ...state, message: passwordChangeRequested(email) } : state}
      />
    </>
  );
}
