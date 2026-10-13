// Contrôle avant la mise en production : les pages légales ne doivent pas être publiées avec une
// adresse de contact provisoire ni sans le fournisseur de cette messagerie (destinataire des
// messages, RGPD art. 13), ni sans contrat de sous-traitance établi avec l'hébergeur (RGPD art. 28)
// ni avec l'entraînement d'IA de Vercel actif sur le compte, ni sans que l'éditeur ait communiqué son
// identité à l'hébergeur (LCEN art. 1-1, II : condition pour ne publier ni domicile ni téléphone).
// Appelé par next.config.ts : le build échoue sur un déploiement Vercel de production
// (VERCEL_ENV=production) tant que src/lib/legal.ts n'est pas complété.
import { CONTACT_IS_PLACEHOLDER, CONTACT_PROVIDER, HOST, PUBLISHER } from "./legal";

type Legal = {
  contactIsPlaceholder: boolean;
  contactProvider: unknown;
  hostDpaApplies: boolean;
  hostModelTrainingDisabled: boolean;
  publisherIdentifiedToHost: boolean;
};

const CURRENT: Legal = {
  contactIsPlaceholder: CONTACT_IS_PLACEHOLDER,
  contactProvider: CONTACT_PROVIDER,
  hostDpaApplies: HOST.dpaApplies,
  hostModelTrainingDisabled: HOST.modelTrainingDisabled,
  publisherIdentifiedToHost: PUBLISHER.identifiedToHost,
};

/** Points qui empêchent la mise en production (vide si tout est prêt). */
export function legalBlockers(legal: Legal = CURRENT): string[] {
  const blockers: string[] = [];
  if (legal.contactIsPlaceholder) blockers.push("CONTACT_EMAIL est encore la valeur provisoire (CONTACT_IS_PLACEHOLDER).");
  if (legal.contactProvider === null) blockers.push("CONTACT_PROVIDER (fournisseur de la messagerie de contact) n’est pas renseigné.");
  if (!legal.hostDpaApplies) {
    blockers.push(
      "Aucun contrat de sous-traitance établi avec Vercel (RGPD art. 28) : offre Pro, ou confirmation écrite que le DPA s’applique au compte Hobby (VERCEL_HOBBY_DPA_CONFIRMED_IN_WRITING).",
    );
  }
  if (!legal.hostModelTrainingDisabled) {
    blockers.push("« Model Training » n’est pas désactivé dans les réglages de l’équipe Vercel (VERCEL_MODEL_TRAINING_DISABLED).");
  }
  if (!legal.publisherIdentifiedToHost) {
    blockers.push(
      "L’éditeur n’a pas déclaré avoir communiqué son identité (nom, prénoms, domicile, téléphone) à Vercel (LCEN art. 1-1, II ; PUBLISHER_IDENTIFIED_TO_HOST).",
    );
  }
  return blockers;
}

/** Lève une erreur sur un déploiement de production si les informations légales sont incomplètes. */
export function assertLegalReadyForProduction(env: Record<string, string | undefined> = process.env, legal: Legal = CURRENT) {
  if (env.VERCEL_ENV !== "production") return;
  const blockers = legalBlockers(legal);
  if (blockers.length > 0) {
    throw new Error(`Informations légales incomplètes (voir docs/legal.md) :\n- ${blockers.join("\n- ")}`);
  }
}
