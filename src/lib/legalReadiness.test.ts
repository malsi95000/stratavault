import { describe, expect, it, vi } from "vitest";
import { CONTACT_IS_PLACEHOLDER, CONTACT_PROVIDER, HOST, PUBLISHER } from "./legal";
import { LEGAL_OVERRIDE_ACCEPTED, assertLegalReadyForProduction, legalBlockers } from "./legalReadiness";

const ready = {
  contactIsPlaceholder: false,
  contactProvider: { name: "Fournisseur", location: "France" },
  hostDpaApplies: true,
  hostModelTrainingDisabled: true,
  publisherIdentifiedToHost: true,
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
    expect(() => assertLegalReadyForProduction(env, placeholder)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/CONTACT_IS_PLACEHOLDER/));
    // Toute autre valeur ne contourne rien.
    expect(() => assertLegalReadyForProduction({ ...env, LEGAL_LAUNCH_OVERRIDE: "1" }, placeholder)).toThrow(/CONTACT_IS_PLACEHOLDER/);
    warn.mockRestore();
  });

  it("contrôle les valeurs actuelles de legal.ts", () => {
    const incomplete = CONTACT_IS_PLACEHOLDER || CONTACT_PROVIDER === null || !HOST.dpaApplies || !HOST.modelTrainingDisabled || !PUBLISHER.identifiedToHost;
    expect(legalBlockers().length > 0).toBe(incomplete);
  });
});
