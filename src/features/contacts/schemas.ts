// Entrées des Server Actions des contacts, revalidées côté serveur (la base les borne aussi).
import { z } from "@/lib/zod";
import { isHandleFormatOk, normalizeHandle } from "@/features/profiles/handle";
import { HANDLE_REQUIRED, RELATION_GONE } from "./messages";

/** Borne avant toute transformation (aucune saisie valide n'en approche). */
const INPUT_MAX = 200;

/** Identifiant exact d'un membre (« @Alice » → « alice ») ; jamais un début d'identifiant. */
export const memberHandleSchema = z
  .string()
  .max(INPUT_MAX, { error: HANDLE_REQUIRED })
  .transform(normalizeHandle)
  .refine(isHandleFormatOk, { error: HANDLE_REQUIRED });

/** Référence opaque d'une demande, d'un contact ou d'un blocage (uuid en minuscules, tiré par la base). */
export const relationRefSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, { error: RELATION_GONE });

/** Membre à bloquer : par identifiant exact, ou par la référence d'une demande ou d'un contact. */
export const blockTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("handle"), value: memberHandleSchema }),
  z.object({ kind: z.enum(["request", "contact"]), value: relationRefSchema }),
]);

export const answerSchema = z.enum(["accept", "refuse"]);
