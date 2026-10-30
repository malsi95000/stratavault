"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { INITIAL_PROFILE_STATE, type ProfileFormState } from "../formState";

type ProfileAction = (previous: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;

/**
 * Relie un formulaire react-hook-form à une Server Action des profils : validation zod dans le
 * navigateur, puis envoi des valeurs normalisées (l'action revalide). Les erreurs du serveur
 * s'affichent sous les champs. `extra` : champs fixes ajoutés à l'envoi (compte attendu, mode).
 */
export function useProfileAction<T extends FieldValues>(
  form: UseFormReturn<T>,
  action: ProfileAction,
  extra: Record<string, string>,
) {
  const [state, formAction, pending] = useActionState(action, INITIAL_PROFILE_STATE);
  const { setError, handleSubmit, reset } = form;
  // Dernières valeurs envoyées (normalisées par zod) : affichées telles qu'enregistrées après un succès.
  const [sent, setSent] = useState<T | null>(null);

  useEffect(() => {
    for (const [field, message] of Object.entries(state.fieldErrors)) {
      if (message) setError(field as Path<T>, { type: "server", message }, { shouldFocus: true });
    }
    if (state.status === "success" && sent) reset(sent);
    // `sent` est fixé avant l'envoi : seul un nouvel état du serveur déclenche ceci.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, setError, reset]);

  const submit = handleSubmit((values) => {
    setSent(values as T);
    const data = new FormData();
    for (const [name, value] of Object.entries({ ...extra, ...values })) data.append(name, String(value));
    startTransition(() => formAction(data));
  });

  // Un second envoi pendant le premier est ignoré.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (pending) event.preventDefault();
    else void submit(event);
  };

  return { state, onSubmit, pending };
}
