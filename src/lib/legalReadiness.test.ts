import { describe, expect, it, vi } from "vitest";
import { TERMS_CHANGE, isValidDay } from "@/features/legal/termsChange";
import { COLLECTIVE_LEGAL_REVIEW_DONE, CONTACT_IS_PLACEHOLDER, CONTACT_PROVIDER, HOST, PUBLISHER } from "./legal";
import { LEGAL_OVERRIDE_ACCEPTED, assertLegalReadyForProduction, legalBlockers } from "./legalReadiness";

const ready = {
  contactIsPlaceholder: false,
  contactProvider: { name: "Fournisseur", location: "France" },
  hostDpaApplies: true,
  hostModelTrainingDisabled: true,
  publisherIdentifiedToHost: true,
  collectiveReviewDone: true,
  termsInForceOn: "2026-11-20",
};
const placeholder = { ...ready, contactIsPlaceholder: true, contactProvider: null };

describe("contrôle des informations légales avant la production", () => {
  it("signale l'adresse provisoire et le fournisseur manquant", () => {
    expect(legalBlockers(placeholder)).toHaveLength(2);
    expect(legalBlockers({ ...ready, contactProvider: null })).toHaveLength(1);
    expect(legalBlockers(ready)).toEqual([]);
  });

  it("exige un contrat de sous-traitance avec Vercel et la désactivation de l'entraînement d'IA", () => {
    expect(legalBlockers({ ...ready, hostDpaApplies: false })).toEqual([expect.stringMatching(/art\. 28/)]);
    expect(legalBlockers({ ...ready, hostModelTrainingDisabled: false })).toEqual([expect.stringMatching(/Model Training/)]);
  });

  it("exige que l'éditeur ait communiqué son identité à l'hébergeur (LCEN art. 1-1, II)", () => {
    expect(legalBlockers({ ...ready, publisherIdentifiedToHost: false })).toEqual([expect.stringMatching(/art\. 1-1, II/)]);
    expect(() => assertLegalReadyForProduction({ VERCEL_ENV: "production" }, { ...ready, publisherIdentifiedToHost: false })).toThrow(
      /PUBLISHER_IDENTIFIED_TO_HOST/,
    );
  });

  it("exige l'examen juridique de la carte collective ; l'acceptation explicite le couvre, en le rappelant", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pending = { ...ready, collectiveReviewDone: false };
    expect(legalBlockers(pending)).toEqual([expect.stringMatching(/COLLECTIVE_LEGAL_REVIEW_DONE/)]);
    // Le rappel couvre tous les points de l'examen, y compris le point 25.
    expect(legalBlockers(pending)[0]).toMatch(/points 22 à 25/);
    expect(legalBlockers(pending)[0]).toMatch(/réseau social en ligne et moins de 15 ans \(point 25\)/);
    expect(() => assertLegalReadyForProduction({ VERCEL_ENV: "production" }, pending)).toThrow(/carte collective/i);
    expect(() =>
      assertLegalReadyForProduction({ VERCEL_ENV: "production", LEGAL_LAUNCH_OVERRIDE: LEGAL_OVERRIDE_ACCEPTED }, pending),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/COLLECTIVE_LEGAL_REVIEW_DONE/));
    warn.mockRestore();
  });

  it("exige la date d'entrée en vigueur des textes changés, lisible", () => {
    for (const termsInForceOn of [null, "bientôt", "2026-02-30"]) {
      expect(legalBlockers({ ...ready, termsInForceOn }), String(termsInForceOn)).toEqual([
        expect.stringMatching(/TERMS_CHANGE\.inForceOn/),
      ]);
    }
  });

  it("bloque seulement un déploiement de production", () => {
    expect(() => assertLegalReadyForProduction({ VERCEL_ENV: "production" }, placeholder)).toThrow(/CONTACT_IS_PLACEHOLDER/);
    expect(() => assertLegalReadyForProduction({ VERCEL_ENV: "preview" }, placeholder)).not.toThrow();
    expect(() => assertLegalReadyForProduction({}, placeholder)).not.toThrow();
    expect(() => assertLegalReadyForProduction({ VERCEL_ENV: "production" }, ready)).not.toThrow();
    expect(() => assertLegalReadyForProduction({ VERCEL_ENV: "production" }, { ...ready, hostDpaApplies: false })).toThrow(/DPA/);
  });

  it("laisse passer la production seulement sur acceptation explicite, en rappelant chaque point", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { VERCEL_ENV: "production", LEGAL_LAUNCH_OVERRIDE: LEGAL_OVERRIDE_ACCEPTED };
    const incomplete = { ...ready, contactProvider: null, hostDpaApplies: false };
    expect(() => assertLegalReadyForProduction(env, incomplete)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/CONTACT_PROVIDER/));
    // Toute autre valeur ne contourne rien.
    expect(() => assertLegalReadyForProduction({ ...env, LEGAL_LAUNCH_OVERRIDE: "1" }, incomplete)).toThrow(/CONTACT_PROVIDER/);
    warn.mockRestore();
  });

  it("l'acceptation explicite couvre aussi l'adresse de contact provisoire (décision de l'éditeur), en la rappelant", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { VERCEL_ENV: "production", LEGAL_LAUNCH_OVERRIDE: LEGAL_OVERRIDE_ACCEPTED };
    expect(() => assertLegalReadyForProduction(env, placeholder)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/CONTACT_IS_PLACEHOLDER/));
    warn.mockRestore();
  });

  it("contrôle les valeurs actuelles de legal.ts", () => {
    const incomplete =
      CONTACT_IS_PLACEHOLDER ||
      CONTACT_PROVIDER === null ||
      !HOST.dpaApplies ||
      !HOST.modelTrainingDisabled ||
      !PUBLISHER.identifiedToHost ||
      !COLLECTIVE_LEGAL_REVIEW_DONE ||
      TERMS_CHANGE.inForceOn === null ||
      !isValidDay(TERMS_CHANGE.inForceOn);
    expect(legalBlockers().length > 0).toBe(incomplete);
  });
});
