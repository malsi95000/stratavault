// Information des titulaires d'un compte sur un changement important des textes (CGU, section
// « Modification des conditions » ; docs/legal.md, point 18) : un e-mail avant l'entrée en vigueur,
// envoyé à la main par l'éditeur avec le texte intégral des nouvelles versions, puis cet avis,
// affiché dans l'espace des comptes créés avant l'entrée en vigueur, pendant une durée limitée.
// Pour un prochain changement important, remplacer ce texte et ses dates.

export const TERMS_CHANGE = {
  /** Version des textes modifiés (LEGAL_UPDATED_ON au moment du changement). */
  version: "30 octobre 2026",
  /**
   * Date d'entrée en vigueur (AAAA-MM-JJ) : jour du déploiement en production, annoncé dans l'e-mail
   * envoyé au moins quinze jours avant (docs/legal.md, point 18). `null` tant qu'elle n'est pas fixée :
   * le build de production le rappelle (src/lib/legalReadiness.ts) et l'avis s'affiche alors à tous
   * les comptes. La renseigner ne modifie pas les textes (LEGAL_UPDATED_ON reste inchangé).
   */
  inForceOn: null as string | null,
  /** Dernier jour d'affichage de l'avis (inclus, AAAA-MM-JJ, en temps universel). */
  showUntil: "2027-01-31",
  title: "Conditions d’utilisation et politique de confidentialité mises à jour",
  summary:
    "La bêta 2.1 ajoute des fonctions entre membres, toutes facultatives : profil, contacts, partage de cartes et carte collective, avec leurs règles de publication, de signalement et de modération.",
  closing:
    "Vos cartes restent privées tant que vous ne les partagez pas. Si vous n’acceptez pas ces changements, vous pouvez télécharger vos données et supprimer votre compte depuis « Mon compte ».",
};

type TermsChange = Pick<typeof TERMS_CHANGE, "version" | "inForceOn" | "showUntil">;

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Début du jour `day` (AAAA-MM-JJ) en temps universel, en millisecondes ; NaN si la date est illisible. */
function startOfDay(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Number.NaN;
  const time = Date.parse(`${day}T00:00:00Z`);
  // Date.parse accepte « 2026-02-30 » : on exige que la date relue soit la même.
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day ? time : Number.NaN;
}

/** Vrai si `day` est une date AAAA-MM-JJ valide. */
export const isValidDay = (day: string): boolean => Number.isFinite(startOfDay(day));

/** Date AAAA-MM-JJ écrite en français : « 20 novembre 2026 », « 1er décembre 2026 ». */
export function frenchDay(day: string): string {
  const time = startOfDay(day);
  if (!Number.isFinite(time)) return day;
  const date = new Date(time);
  const d = date.getUTCDate();
  return `${d === 1 ? "1er" : d} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** « version du 30 octobre 2026 », suivie de la date d'entrée en vigueur une fois fixée. */
export function termsVersionLabel(change: Pick<TermsChange, "version" | "inForceOn"> = TERMS_CHANGE): string {
  const inForce = change.inForceOn && isValidDay(change.inForceOn) ? `, en vigueur depuis le ${frenchDay(change.inForceOn)}` : "";
  return `version du ${change.version}${inForce}`;
}

/**
 * Mention d'entrée en vigueur pour /conditions et /confidentialite, une fois la date fixée :
 * « Version du 30 octobre 2026 en vigueur depuis le 20 novembre 2026. » ; `null` avant.
 */
export function termsInForceNotice(change: Pick<TermsChange, "version" | "inForceOn"> = TERMS_CHANGE): string | null {
  if (!change.inForceOn || !isValidDay(change.inForceOn)) return null;
  return `Version du ${change.version} en vigueur depuis le ${frenchDay(change.inForceOn)}.`;
}

/** Texte de l'avis : résumé, version et entrée en vigueur, droit de partir. */
export function termsChangeText(change: typeof TERMS_CHANGE = TERMS_CHANGE): string {
  return `${change.summary} Les conditions d’utilisation et la politique de confidentialité ont été mises à jour en conséquence (${termsVersionLabel(change)}). ${change.closing}`;
}

/**
 * Vrai si l'avis doit être montré à un compte créé à `createdAt` (date ISO renvoyée par l'API Auth) :
 * jusqu'au jour `showUntil` inclus, et seulement aux comptes créés avant la fin du jour d'entrée en
 * vigueur (un compte créé ensuite a accepté les nouveaux textes à l'inscription). Date d'entrée en
 * vigueur pas encore fixée, ou date de création inconnue : l'avis est montré (mieux vaut informer).
 */
export function termsChangeVisible(now: Date, createdAt: string | null, change: TermsChange = TERMS_CHANGE): boolean {
  const end = startOfDay(change.showUntil) + DAY_MS;
  if (!Number.isFinite(end) || now.getTime() >= end) return false;
  if (change.inForceOn === null) return true;
  const cutoff = startOfDay(change.inForceOn) + DAY_MS;
  const created = createdAt === null ? Number.NaN : Date.parse(createdAt);
  if (!Number.isFinite(cutoff) || !Number.isFinite(created)) return true;
  return created < cutoff;
}
