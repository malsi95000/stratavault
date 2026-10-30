// Formulaire de « Mon profil », partagé par le navigateur (react-hook-form) et la Server Action, qui
// revalide. Les valeurs sont normalisées comme la base les enregistre.
import { z } from "@/lib/zod";
import { isHandleFormatOk, isReservedHandle, normalizeHandle } from "./handle";
import {
  BIO_TOO_LONG,
  BIO_TOO_MANY_LINES,
  DISPLAY_NAME_REQUIRED,
  DISPLAY_NAME_RESERVED,
  DISPLAY_NAME_TOO_LONG,
  FORBIDDEN_CHARS,
  HANDLE_INVALID,
  HANDLE_RESERVED,
  VISIBILITY_INVALID,
} from "./messages";
import { bioProblem, displayNameProblem, normalizeBio, normalizeDisplayName, type TextProblem } from "./text";
import { PROFILE_VISIBILITIES } from "./types";

/** Borne de sécurité avant toute transformation (aucune saisie valide n'en approche). */
const INPUT_MAX = 4000;

const textMessages: Record<TextProblem, string> = {
  empty: DISPLAY_NAME_REQUIRED,
  "too-long": DISPLAY_NAME_TOO_LONG,
  "too-many-lines": BIO_TOO_MANY_LINES,
  "forbidden-chars": FORBIDDEN_CHARS,
  reserved: DISPLAY_NAME_RESERVED,
};

export const handleSchema = z
  .string()
  .max(INPUT_MAX, { error: HANDLE_INVALID })
  .transform(normalizeHandle)
  .refine(isHandleFormatOk, { error: HANDLE_INVALID })
  .refine((handle) => !isReservedHandle(handle), { error: HANDLE_RESERVED });

const displayNameSchema = z
  .string()
  .max(INPUT_MAX, { error: DISPLAY_NAME_TOO_LONG })
  .transform(normalizeDisplayName)
  .superRefine((name, ctx) => {
    const problem = displayNameProblem(name);
    if (problem) ctx.addIssue({ code: "custom", message: textMessages[problem] });
  });

const bioSchema = z
  .string()
  .max(INPUT_MAX, { error: BIO_TOO_LONG })
  .transform(normalizeBio)
  .superRefine((bio, ctx) => {
    const problem = bioProblem(bio);
    if (problem) ctx.addIssue({ code: "custom", message: problem === "too-long" ? BIO_TOO_LONG : textMessages[problem] });
  });

export const profileSchema = z.object({
  handle: handleSchema,
  displayName: displayNameSchema,
  bio: bioSchema,
  visibility: z.enum(PROFILE_VISIBILITIES, { error: VISIBILITY_INVALID }),
});

export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileValues = z.output<typeof profileSchema>;
