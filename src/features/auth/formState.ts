import { z } from "@/lib/zod";
import { CHECK_FIELDS } from "./messages";

// État renvoyé par les Server Actions de compte aux formulaires (via useActionState).
// Il ne contient que des messages prévus pour l'affichage, jamais d'erreur brute.

export type AuthField = "email" | "password" | "confirm";

export type AuthFormState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors: Partial<Record<AuthField, string>>;
};

export const INITIAL_AUTH_STATE: AuthFormState = { status: "idle", message: "", fieldErrors: {} };

export const errorState = (message: string, fieldErrors: AuthFormState["fieldErrors"] = {}): AuthFormState => ({
  status: "error",
  message,
  fieldErrors,
});

export const successState = (message: string): AuthFormState => ({ status: "success", message, fieldErrors: {} });

const FIELDS: readonly AuthField[] = ["email", "password", "confirm"];

/** Lit les champs texte d'un FormData (un champ absent ou un fichier devient une chaîne vide). */
export function readFields(formData: FormData, names: readonly AuthField[]): Partial<Record<AuthField, string>> {
  const values: Partial<Record<AuthField, string>> = {};
  for (const name of names) {
    const value = formData.get(name);
    values[name] = typeof value === "string" ? value : "";
  }
  return values;
}

/** Première erreur de chaque champ, pour l'afficher sous le champ concerné. */
export function invalidState(error: z.ZodError): AuthFormState {
  const fieldErrors: AuthFormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const field = FIELDS.find((name) => name === issue.path[0]);
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return errorState(CHECK_FIELDS, fieldErrors);
}
