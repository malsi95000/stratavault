// Contrôle avant la mise en production : les pages légales ne doivent pas être publiées avec une
// adresse de contact provisoire ni sans le fournisseur de cette messagerie (destinataire des
// messages, RGPD art. 13), ni sans contrat de sous-traitance établi avec l'hébergeur (RGPD art. 28)
// ni avec l'entraînement d'IA de Vercel actif sur le compte, ni sans que l'éditeur ait communiqué son
// identité à l'hébergeur (LCEN art. 1-1, II : condition pour ne publier ni domicile ni téléphone),
// ni avant l'examen juridique demandé pour ouvrir la carte collective au public (COLLECTIVE_LEGAL_REVIEW_DONE),
// ni sans date d'entrée en vigueur des textes changés (TERMS_CHANGE.inForceOn, annoncée par e-mail).
// Appelé par next.config.ts : le build échoue sur un déploiement Vercel de production
// (VERCEL_ENV=production) tant que src/lib/legal.ts n'est pas complété. L'éditeur peut accepter de
// publier malgré ces points (LEGAL_LAUNCH_OVERRIDE, décision du 13 octobre 2026) ; chaque build les
// rappelle alors. L'adresse de contact provisoire est le point de contact unique et la voie de
// signalement et de contestation (DSA, art. 11, 12, 16 et 17) : la remplacer reste prioritaire.
import { TERMS_CHANGE, isValidDay } from "../features/legal/termsChange";
import { COLLECTIVE_LEGAL_REVIEW_DONE, CONTACT_IS_PLACEHOLDER, CONTACT_PROVIDER, HOST, PUBLISHER } from "./legal";

type Legal = {
  contactIsPlaceholder: boolean;
  contactProvider: unknown;
  hostDpaApplies: boolean;
  hostModelTrainingDisabled: boolean;
  publisherIdentifiedToHost: boolean;
  collectiveReviewDone: boolean;
  /** Date d'entrée en vigueur des derniers textes changés (AAAA-MM-JJ), ou null si elle n'est pas fixée. */
  termsInForceOn: string | null;
};

const CURRENT: Legal = {
  contactIsPlaceholder: CONTACT_IS_PLACEHOLDER,
  contactProvider: CONTACT_PROVIDER,
  hostDpaApplies: HOST.dpaApplies,
  hostModelTrainingDisabled: HOST.modelTrainingDisabled,
  publisherIdentifiedToHost: PUBLISHER.identifiedToHost,
  collectiveReviewDone: COLLECTIVE_LEGAL_REVIEW_DONE,
  termsInForceOn: TERMS_CHANGE.inForceOn,
};

/** Points qui empêchent la mise en production (vide si tout est prêt). */
export function legalBlockers(legal: Legal = CURRENT): string[] {
  const blockers: string[] = [];
  if (legal.contactIsPlaceholder) {
    blockers.push(
      "CONTACT_EMAIL est encore la valeur provisoire (CONTACT_IS_PLACEHOLDER) : point de contact, signalements et contestations (DSA, art. 11, 12, 16 et 17) passent par cette adresse.",
    );
  }
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
  if (!legal.collectiveReviewDone) {
    blockers.push(
      "Carte collective ouverte à tous les comptes avant l’examen juridique demandé par docs/legal.md, points 22 à 25 : statut du projet, données d’identification des auteurs (LCEN art. 6, V), plateforme en ligne et destinataires actifs (DSA art. 24.3), réseau social en ligne et moins de 15 ans (point 25) (COLLECTIVE_LEGAL_REVIEW_DONE).",
    );
  }
  if (legal.termsInForceOn === null || !isValidDay(legal.termsInForceOn)) {
    blockers.push(
      `Date d’entrée en vigueur des textes du ${TERMS_CHANGE.version} non renseignée ou illisible (TERMS_CHANGE.inForceOn, AAAA-MM-JJ) : fixez-la, annoncez-la par e-mail aux comptes avec le texte intégral des nouvelles versions au moins quinze jours avant, et déployez ce jour-là (docs/legal.md, point 18).`,
    );
  }
  return blockers;
}

/**
 * Valeur de LEGAL_LAUNCH_OVERRIDE par laquelle l'éditeur accepte, en connaissance de cause, de publier
 * malgré des points légaux non réglés : le build passe, mais chaque point est rappelé dans ses journaux.
 */
export const LEGAL_OVERRIDE_ACCEPTED = "accepted";

/**
 * Lève une erreur sur un déploiement de production si les informations légales sont incomplètes,
 * sauf si l'éditeur l'a accepté explicitement (LEGAL_LAUNCH_OVERRIDE=accepted) : simple avertissement.
 */
export function assertLegalReadyForProduction(env: Record<string, string | undefined> = process.env, legal: Legal = CURRENT) {
  if (env.VERCEL_ENV !== "production") return;
  const blockers = legalBlockers(legal);
  if (blockers.length === 0) return;
  const list = `\n- ${blockers.join("\n- ")}`;
  if (env.LEGAL_LAUNCH_OVERRIDE === LEGAL_OVERRIDE_ACCEPTED) {
    console.warn(`[légal] Mise en production acceptée malgré des points non réglés (voir docs/legal.md) :${list}`);
    return;
  }
  throw new Error(`Informations légales incomplètes (voir docs/legal.md) :${list}`);
}
