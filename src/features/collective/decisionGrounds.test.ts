// Règle en cause d'une décision de modération : liste des « Motifs de retrait » des conditions
// d'utilisation (vérifiée sur la page par legalPages.test.ts), motif complet toujours dans la borne de la base.
import { describe, expect, it } from "vitest";
import {
  BREACH_GROUNDS,
  DECISION_GROUNDS,
  MAX_DECISION_FACTS,
  MAX_LEGAL_BASIS,
  decisionReason,
  groundSentence,
  groundsFor,
  needsLegalBasis,
} from "./decisionGrounds";
import { textProblem } from "./itemData";
import { MAX_REASON_TEXT, MIN_DECISION_REASON } from "./limits";
import { moderationSchema } from "./schemas";

describe("règle en cause d'une décision", () => {
  it("un manquement pour masquer ou supprimer ; aucun pour rétablir ou classer", () => {
    expect(groundsFor("hide")).toEqual(BREACH_GROUNDS);
    expect(groundsFor("delete")).toEqual(BREACH_GROUNDS);
    expect(groundsFor("restore")).toEqual(["no-breach"]);
    expect(groundsFor("dismiss")).toEqual(["no-breach"]);
  });

  it("le motif commence par la règle et tient dans la borne de la base, quelle que soit la règle", () => {
    expect(MAX_DECISION_FACTS).toBeGreaterThanOrEqual(280);
    for (const ground of DECISION_GROUNDS) {
      const reason = decisionReason(ground, "é".repeat(MAX_DECISION_FACTS), "é".repeat(MAX_LEGAL_BASIS));
      expect(reason.startsWith(groundSentence(ground))).toBe(true);
      expect(textProblem(reason, MAX_REASON_TEXT, true), ground).toBeNull();
    }
    expect(decisionReason("spam", "Liens publicitaires répétés.")).toBe(
      "Règle en cause : publicité ou spam (conditions d’utilisation, « Motifs de retrait »). Liens publicitaires répétés.",
    );
  });

  it("contenu illicite : le motif cite le texte de loi en cause (DSA art. 17.3.d), seulement pour lui", () => {
    expect(BREACH_GROUNDS.filter(needsLegalBasis)).toEqual(["illegal"]);
    expect(decisionReason("illegal", "Publie l’adresse d’une personne pour l’exposer.", "Code pénal, art. 223-1-1.")).toBe(
      "Règle en cause : contenu illicite (conditions d’utilisation, « Motifs de retrait »). Fondement légal : Code pénal, art. 223-1-1. Publie l’adresse d’une personne pour l’exposer.",
    );
    expect(decisionReason("spam", "Pub", "ignoré")).toBe(decisionReason("spam", "Pub"));
  });

  it("le serveur refuse une règle absente, inconnue ou sans rapport avec la décision, et des faits trop longs", () => {
    const valid = { item: "p1", action: "hide", ground: "spam", legalBasis: "", reason: "Pub", suspend: "" };
    const illegal = { ...valid, ground: "illegal", legalBasis: "Code pénal, art. 223-1-1" };
    expect(moderationSchema.safeParse(valid).success).toBe(true);
    expect(moderationSchema.safeParse({ ...valid, action: "restore", ground: "no-breach" }).success).toBe(true);
    expect(moderationSchema.safeParse(illegal).success).toBe(true);
    for (const bad of [
      { ...illegal, legalBasis: "" },
      { ...illegal, legalBasis: "  ... " },
      { ...illegal, legalBasis: "x".repeat(MAX_LEGAL_BASIS + 1) },
      { ...illegal, legalBasis: "Code pénal\narticle 1" },
      { ...valid, legalBasis: "Code pénal, art. 1" },
      { ...valid, ground: "" },
      { ...valid, ground: "inconnu" },
      { ...valid, ground: "no-breach" },
      { ...valid, action: "dismiss", ground: "spam" },
      { ...valid, reason: "x".repeat(MIN_DECISION_REASON - 1) },
      { ...valid, reason: "x".repeat(MAX_DECISION_FACTS + 1) },
    ]) {
      expect(moderationSchema.safeParse(bad).success, JSON.stringify(bad).slice(0, 80)).toBe(false);
    }
  });
});
