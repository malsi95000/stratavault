"use client";

import { useState, useTransition, type FormEvent } from "react";
import AuthField from "@/components/auth/AuthField";
import { Button } from "@/components/ui/button";
import { HANDLE_MAX } from "@/features/profiles/handle";
import { sendContactRequest } from "../actions";
import { INITIAL_CONTACT_STATE, contactError, type ContactActionState } from "../actionState";
import { HANDLE_REQUIRED } from "../messages";
import { memberHandleSchema } from "../schemas";
import ContactMessage from "./ContactMessage";

/**
 * « Ajouter un contact » : demande envoyée au membre d'identifiant EXACT (jamais par adresse
 * e-mail, ni par début de nom). La réponse est la même pour un identifiant inconnu ou un profil
 * masqué.
 */
export default function SendRequestForm({ userId }: { userId: string }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<ContactActionState>(INITIAL_CONTACT_STATE);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const handle = memberHandleSchema.safeParse(value);
    if (!handle.success) {
      setState(contactError(HANDLE_REQUIRED));
      return;
    }
    const data = new FormData();
    data.append("account", userId);
    data.append("handle", handle.data);
    startTransition(async () => {
      const result = await sendContactRequest(INITIAL_CONTACT_STATE, data);
      setState(result);
      if (result.status === "success") setValue("");
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <AuthField
        id="ajouter-contact"
        label="Identifiant exact du membre"
        placeholder="@identifiant"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        maxLength={HANDLE_MAX + 1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={state.status === "error" ? state.message : undefined}
      />
      <div>
        <Button type="submit" variant="panel" size="panel" disabled={pending}>
          {pending ? "Envoi…" : "Envoyer la demande"}
        </Button>
      </div>
      {state.status === "success" && <ContactMessage state={state} />}
    </form>
  );
}
