// Règle en cause d'une décision de modération (exposé des motifs, DSA art. 17, paragraphe 3, e) : le
// modérateur la choisit dans les « Motifs de retrait » des conditions d'utilisation
// (/conditions#signalement, qui affiche cette même liste), puis décrit les faits retenus. Pour un
// contenu illicite, il cite aussi le texte de loi en cause (fondement légal, DSA art. 17, paragraphe 3,
// d) : les faits retenus expliquent alors en quoi le contenu y contrevient. Le motif transmis à
// l'auteur et inscrit au journal commence toujours par cette règle.
import { MAX_REASON_TEXT } from "./limits";
import type { ModerationAction } from "./types";

/** Manquements qui justifient de masquer ou de supprimer un élément (ordre des conditions d'utilisation). */
export const BREACH_GROUNDS = [
  "illegal",
  "hate",
  "harassment",
  "personal-data",
  "misinformation",
  "spam",
  "impersonation",
  "third-party-rights",
  "other-terms",
] as const;

/** Règles possibles d'une décision : un manquement, ou aucun (rétablir, classer). */
export const DECISION_GROUNDS = [...BREACH_GROUNDS, "no-breach"] as const;
export type DecisionGround = (typeof DECISION_GROUNDS)[number];

export const GROUND_LABELS: Record<DecisionGround, string> = {
  illegal: "contenu illicite",
  hate: "haine, violence ou discrimination",
  harassment: "harcèlement ou attaque d’une personne",
  "personal-data": "données personnelles ou vie privée d’autrui",
  misinformation: "information manifestement fausse présentée comme vraie",
  spam: "publicité ou spam",
  impersonation: "usurpation de l’identité d’une personne ou de l’équipe du service",
  "third-party-rights": "atteinte aux droits d’un tiers (droit d’auteur, droit à l’image…)",
  "other-terms": "autre manquement aux conditions d’utilisation",
  "no-breach": "aucun manquement retenu",
};

/** Règles proposées pour une décision : un manquement pour masquer ou supprimer ; aucun pour rétablir ou classer. */
export const groundsFor = (action: ModerationAction): readonly DecisionGround[] =>
  action === "hide" || action === "delete" ? BREACH_GROUNDS : ["no-breach"];

/** Début du motif : la règle en cause, avec son renvoi aux conditions d'utilisation. */
export const groundSentence = (ground: DecisionGround) =>
  ground === "no-breach"
    ? "Aucun manquement aux conditions d’utilisation retenu."
    : `Règle en cause : ${GROUND_LABELS[ground]} (conditions d’utilisation, « Motifs de retrait »).`;

/** Fondement légal d'une décision sur un contenu illicite (texte et article) : bornes en caractères. */
export const MIN_LEGAL_BASIS = 5;
export const MAX_LEGAL_BASIS = 100;

/** Règle qui exige le texte de loi en cause : le contenu illicite (DSA, art. 17, paragraphe 3, d). */
export const needsLegalBasis = (ground: DecisionGround | "") => ground === "illegal";

/** Texte de loi saisi, sans espaces ni points finaux (le motif ajoute le sien). */
export const legalBasisText = (basis: string) => basis.replace(/[\s.]+$/u, "");

const legalBasisSentence = (basis: string) => `Fondement légal : ${legalBasisText(basis)}.`;

/** Début du motif : la règle en cause et, pour un contenu illicite, le texte de loi en cause. */
const reasonHead = (ground: DecisionGround, legalBasis: string) =>
  needsLegalBasis(ground) ? `${groundSentence(ground)} ${legalBasisSentence(legalBasis)}` : groundSentence(ground);

const LONGEST_HEAD = Math.max(...DECISION_GROUNDS.map((ground) => [...reasonHead(ground, "x".repeat(MAX_LEGAL_BASIS))].length));

/** Faits retenus : au plus ce nombre de caractères, pour que le motif complet tienne dans la borne de la base. */
export const MAX_DECISION_FACTS = MAX_REASON_TEXT - LONGEST_HEAD - 1;

/**
 * Motif complet d'une décision : la règle en cause, le texte de loi en cause pour un contenu illicite
 * (`legalBasis`, ignoré sinon), puis les faits retenus.
 */
export const decisionReason = (ground: DecisionGround, facts: string, legalBasis = "") => `${reasonHead(ground, legalBasis)} ${facts}`;
