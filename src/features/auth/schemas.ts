import { z } from "@/lib/zod";
import {
  EMAIL_INVALID,
  PASSWORD_INPUT_TOO_LONG,
  PASSWORD_MISMATCH,
  PASSWORD_REQUIRED,
  PASSWORD_TOO_LONG,
  PASSWORD_TOO_SHORT,
} from "./messages";

// Schémas partagés par les formulaires (client) et les Server Actions (serveur).

export const PASSWORD_MIN = 12;
/** bcrypt, utilisé par Supabase Auth, ignore tout ce qui dépasse 72 octets. */
export const PASSWORD_MAX_BYTES = 72;

const byteLength = (value: string) => new TextEncoder().encode(value).length;

const email = z
  .string()
  .trim()
  .max(254, { error: EMAIL_INVALID })
  .pipe(z.email({ error: EMAIL_INVALID }));

const newPassword = z
  .string()
  .min(PASSWORD_MIN, { error: PASSWORD_TOO_SHORT })
  .refine((value) => byteLength(value) <= PASSWORD_MAX_BYTES, { error: PASSWORD_TOO_LONG });

const passwordPair = z.object({ password: newPassword, confirm: z.string() });
const samePasswords = (values: { password: string; confirm: string }) => values.password === values.confirm;
const mismatch = { error: PASSWORD_MISMATCH, path: ["confirm"] };

/** Connexion : on ne rappelle pas la politique de mot de passe (le message d'échec reste générique). */
export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: PASSWORD_REQUIRED }).max(1024, { error: PASSWORD_INPUT_TOO_LONG }),
});

export const signUpSchema = passwordPair.extend({ email }).refine(samePasswords, mismatch);

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = passwordPair.refine(samePasswords, mismatch);

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ResetRequestValues = z.infer<typeof resetRequestSchema>;
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
