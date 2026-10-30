// État renvoyé par les Server Actions des profils aux formulaires (useActionState) : uniquement des
// messages prévus pour l'affichage, jamais d'erreur brute.
import type { z } from "@/lib/zod";
import { CHECK_FIELDS } from "@/features/auth/messages";

export type ProfileField = "handle" | "displayName" | "bio" | "visibility" | "avatar";

export type ProfileFormState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors: Partial<Record<ProfileField, string>>;
};

export const INITIAL_PROFILE_STATE: ProfileFormState = { status: "idle", message: "", fieldErrors: {} };

export const profileError = (message: string, fieldErrors: ProfileFormState["fieldErrors"] = {}): ProfileFormState => ({
  status: "error",
  message,
  fieldErrors,
});

export const profileSuccess = (message: string): ProfileFormState => ({ status: "success", message, fieldErrors: {} });

const FIELDS: readonly ProfileField[] = ["handle", "displayName", "bio", "visibility", "avatar"];

/** Première erreur de chaque champ, pour l'afficher sous le champ concerné. */
export function invalidProfile(error: z.ZodError): ProfileFormState {
  const fieldErrors: ProfileFormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const field = FIELDS.find((name) => name === issue.path[0]);
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return profileError(CHECK_FIELDS, fieldErrors);
}

/** Champ texte d'un FormData (absent ou fichier : chaîne vide). */
export function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
