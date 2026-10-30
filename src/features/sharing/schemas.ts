// Entrées des Server Actions du partage, revalidées côté serveur (la base les borne aussi).
import { z } from "@/lib/zod";
import { MAX_LINK_HOURS, MAX_LINK_USES } from "./limits";
import { MEMBER_ROLES } from "./types";

/** Borne avant toute conversion (aucune saisie valide n'en approche). */
const INPUT_MAX = 100;

/** Identifiant opaque (carte, membre, invitation, lien, contact) : un uuid en minuscules. */
export const sharingRefSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

export const memberRoleSchema = z.enum(MEMBER_ROLES);

/** Durées proposées pour un lien (heures) : un jour, une semaine, trente jours. */
export const LINK_DURATIONS = [24, 168, MAX_LINK_HOURS] as const;
/** Nombres d'usages proposés pour un lien. */
export const LINK_USES = [1, 5, 10, 25, MAX_LINK_USES] as const;

/** Nombre choisi dans une liste fermée (champ de formulaire, en texte). */
const oneOf = (values: readonly number[]) =>
  z
    .string()
    .max(INPUT_MAX)
    .regex(/^[0-9]{1,4}$/)
    .transform(Number)
    .refine((n) => values.includes(n));

/** Options d'un nouveau lien : rôle, nombre d'usages et durée parmi les valeurs proposées. */
export const linkOptionsSchema = z.object({
  role: memberRoleSchema,
  maxUses: oneOf(LINK_USES),
  hours: oneOf(LINK_DURATIONS),
});

/** Jeton d'un lien d'invitation : 64 caractères hexadécimaux en minuscules. */
export const linkTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const invitationAnswerSchema = z.enum(["accept", "refuse"]);
