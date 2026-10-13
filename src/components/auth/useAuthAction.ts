"use client";

import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { INITIAL_AUTH_STATE, type AuthFormState } from "@/features/auth/formState";

type AuthAction = (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;

/**
 * Relie un formulaire react-hook-form à une Server Action : validation zod dans le navigateur,
 * puis envoi à l'action (qui revalide). Les erreurs du serveur s'affichent sous les champs.
 * `formAction` sert d'attribut `action` pour que le formulaire marche aussi sans JavaScript.
 * `extra` : champs fixes ajoutés à l'envoi (ceux des `<input type="hidden">` du formulaire).
 */
export function useAuthAction<T extends FieldValues>(
  form: UseFormReturn<T>,
  action: AuthAction,
  extra: Record<string, string> = {},
) {
  const [state, formAction, pending] = useActionState(action, INITIAL_AUTH_STATE);
  const { setError, reset, handleSubmit } = form;

  useEffect(() => {
    for (const [field, message] of Object.entries(state.fieldErrors)) {
      // Les noms de champs renvoyés par le serveur sont ceux du formulaire (email, password, confirm).
      if (message) setError(field as Path<T>, { type: "server", message }, { shouldFocus: true });
    }
    if (state.status === "success") reset();
  }, [state, setError, reset]);

  const submit = handleSubmit((values) => {
    const data = new FormData();
    for (const [name, value] of Object.entries({ ...extra, ...values })) data.append(name, String(value));
    startTransition(() => formAction(data));
  });

  // Les champs restent actifs pendant l'envoi (le focus ne se perd pas) : on ignore un second envoi.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (pending) event.preventDefault();
    else void submit(event);
  };

  return { state, formAction, onSubmit, pending };
}
