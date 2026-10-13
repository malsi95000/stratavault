import { PASSWORD_INPUT_TOO_LONG, PASSWORD_REQUIRED } from "@/features/auth/messages";
import { z } from "@/lib/zod";
import { CONFIRMATION_REQUIRED, DELETE_CONFIRMATION_WORD } from "./messages";

// Suppression du compte : mot de passe actuel + mot de confirmation. Partagé par le formulaire
// (navigateur) et la Server Action (serveur), qui revalide.

export const deleteAccountSchema = z.object({
  // Comme la connexion : on ne rappelle pas la politique de mot de passe, seulement une borne de sécurité.
  password: z.string().min(1, { error: PASSWORD_REQUIRED }).max(1024, { error: PASSWORD_INPUT_TOO_LONG }),
  // « confirm » : nom de champ commun aux formulaires de compte (formState.ts).
  confirm: z
    .string()
    .trim()
    .refine((value) => value === DELETE_CONFIRMATION_WORD, { error: CONFIRMATION_REQUIRED }),
});

export type DeleteAccountValues = z.infer<typeof deleteAccountSchema>;
