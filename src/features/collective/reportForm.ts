// Formulaire de signalement (ReportDialog) : aucun motif n'est présélectionné. Le motif est
// l'information principale de la file de modération : le membre doit le choisir lui-même.
// Motif « Contenu illicite » : le signalement est traité comme une notification au sens de l'article 16
// du règlement sur les services numériques (DSA) ; il doit donc expliquer pourquoi le contenu serait
// illicite et porter une déclaration de bonne foi (art. 16, paragraphe 2, a et d). L'élément visé est
// désigné par son identifiant (point b). Le signalement est rattaché au compte connecté, donc à son
// adresse e-mail, mais à aucun nom (point c) : un compte n'en contient pas (le nom affiché d'un profil,
// facultatif, est un pseudonyme) et le formulaire n'en demande pas. Les textes publiés le disent et
// renvoient à l'e-mail pour une notification qui comporte aussi le nom.
// Le serveur applique les mêmes règles (schemas.ts).
import { REPORT_REASONS, type ReportReason } from "./types";

/** Motif choisi dans la liste, ou "" tant qu'aucun ne l'est. */
export type ReportReasonChoice = ReportReason | "";

/** Explication exigée pour un contenu signalé comme illicite (caractères, espaces de bord exclus). */
export const MIN_ILLEGAL_DETAILS = 20;

/** Ce qui manque au formulaire : motif, explication (contenu illicite) ou déclaration de bonne foi. */
export type ReportFormProblem = "reason" | "details" | "good-faith";

/** Valeur lue dans la liste des motifs : un motif connu, sinon "" (aucun). */
export const reasonChoice = (value: string): ReportReasonChoice =>
  (REPORT_REASONS as readonly string[]).includes(value) ? (value as ReportReason) : "";

/** Un motif « Contenu illicite » exige une explication et la déclaration de bonne foi. */
export const requiresNoticeElements = (reason: ReportReasonChoice) => reason === "illegal";

/** Premier élément manquant du formulaire, ou null s'il est complet. */
export function reportFormProblem(reason: ReportReasonChoice, details: string, goodFaith: boolean): ReportFormProblem | null {
  if (reason === "") return "reason";
  if (requiresNoticeElements(reason)) {
    if ([...details.trim()].length < MIN_ILLEGAL_DETAILS) return "details";
    if (!goodFaith) return "good-faith";
  }
  return null;
}

/** Données envoyées à la Server Action, ou null tant que le formulaire est incomplet. */
export function reportFormData(
  account: string,
  item: string,
  reason: ReportReasonChoice,
  details: string,
  goodFaith: boolean,
): FormData | null {
  if (reportFormProblem(reason, details, goodFaith) !== null) return null;
  const data = new FormData();
  data.append("account", account);
  data.append("item", item);
  data.append("reason", reason);
  data.append("details", details);
  data.append("goodFaith", goodFaith ? "on" : "");
  return data;
}
