// Validation des entrées des Server Actions de la carte collective (formulaires de signalement et de
// modération, identifiants). Mêmes bornes que la base.
import { ID_PATTERN } from "@/features/map-doc/types";
import { z } from "@/lib/zod";
import {
  DECISION_GROUNDS,
  MAX_DECISION_FACTS,
  MAX_LEGAL_BASIS,
  MIN_LEGAL_BASIS,
  groundsFor,
  legalBasisText,
  needsLegalBasis,
} from "./decisionGrounds";
import { textProblem } from "./itemData";
import { MAX_REASON_TEXT, MIN_DECISION_REASON } from "./limits";
import { reportFormProblem } from "./reportForm";
import { MODERATION_ACTIONS, REPORT_REASONS, SUSPENDING_ACTIONS } from "./types";

/** Identifiant d'un élément (forme des identifiants d'éléments d'une carte). */
export const itemIdSchema = z.string().max(64).regex(ID_PATTERN);

/** Texte libre (précisions, motif) : retours à la ligne normalisés, espaces de bord retirés, règles de la base. */
const freeText = (min: number, max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .refine((value) => [...value].length >= min, "Texte trop court.")
    .refine((value) => textProblem(value, max, true) === null, "Texte trop long ou caractères refusés.");

/** Case à cocher : cochée (« on ») ou absente. */
const checkbox = z.union([z.literal("on"), z.literal("")]).transform((value) => value === "on");

/**
 * Signalement : motif de la liste ; pour un contenu illicite, explication et déclaration de bonne foi
 * (DSA, art. 16, paragraphe 2), comme le formulaire (reportForm.ts).
 */
export const reportSchema = z
  .object({
    item: itemIdSchema,
    reason: z.enum(REPORT_REASONS),
    details: freeText(0, MAX_REASON_TEXT),
    goodFaith: checkbox,
  })
  .refine((input) => reportFormProblem(input.reason, input.details, input.goodFaith) === null, "Signalement incomplet.");

/**
 * Décision : action, règle en cause (un manquement pour masquer ou supprimer, aucun pour rétablir ou
 * classer), texte de loi en cause (exigé pour un contenu illicite, refusé sinon : DSA art. 17,
 * paragraphe 3, d) et faits retenus, assez courts pour que le motif complet tienne dans la borne de la base.
 */
export const moderationSchema = z
  .object({
    item: itemIdSchema,
    action: z.enum(MODERATION_ACTIONS),
    ground: z.enum(DECISION_GROUNDS),
    legalBasis: freeText(0, MAX_LEGAL_BASIS).refine((value) => !/\n/.test(value), "Une seule ligne."),
    reason: freeText(MIN_DECISION_REASON, MAX_DECISION_FACTS),
    suspend: checkbox,
  })
  .refine((input) => !input.suspend || SUSPENDING_ACTIONS.includes(input.action), "Suspension : masquer ou supprimer seulement.")
  .refine((input) => groundsFor(input.action).includes(input.ground), "Règle en cause sans rapport avec la décision.")
  .refine(
    (input) => (needsLegalBasis(input.ground) ? [...legalBasisText(input.legalBasis)].length >= MIN_LEGAL_BASIS : input.legalBasis === ""),
    "Texte de loi exigé pour un contenu illicite, et seulement pour lui.",
  );
