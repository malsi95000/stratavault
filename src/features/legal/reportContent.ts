// Signalement par e-mail d'un contenu visible d'autres membres hors de la carte collective (profil,
// carte partagée) : lien « Signaler » placé à côté du contenu, pour que le dispositif soit facile
// d'accès (DSA, art. 16, paragraphe 1 ; LCEN, art. 6). Le message est prérempli avec l'emplacement du
// contenu et les éléments qu'une notification doit contenir (DSA, art. 16, paragraphe 2), comme le
// demandent /mentions-legales#signalement et /conditions#signalement. Rien n'est envoyé par le site :
// la messagerie de la personne ouvre un brouillon qu'elle complète et envoie elle-même.
import { CONTACT_EMAIL } from "@/lib/legal";

/** Contenu signalé : un profil (identifiant public) ou une carte partagée (nom, propriétaire affiché). */
export type ReportTarget = { kind: "profile"; handle: string } | { kind: "shared-map"; mapName: string; owner: string };

/** Texte du lien, selon le contenu. */
export const REPORT_LINK_LABEL: Record<ReportTarget["kind"], string> = {
  profile: "Signaler ce profil",
  "shared-map": "Signaler cette carte",
};

/** Infobulle du lien : ce qui se passe au clic. */
export const REPORT_LINK_TITLE = `Ouvre un e-mail prérempli à ${CONTACT_EMAIL} (point de contact du site, voir les mentions légales)`;

/** Emplacement du contenu, tel qu'il figure dans l'objet et le message. */
export function reportLocation(target: ReportTarget): string {
  return target.kind === "profile"
    ? `profil @${target.handle}`
    : `carte partagée « ${target.mapName} », de ${target.owner}`;
}

/** Objet du message. */
export const reportSubject = (target: ReportTarget) => `Signalement : ${reportLocation(target)}`;

/** Message prérempli : emplacement, puis les éléments à compléter (DSA, art. 16, paragraphe 2). */
export function reportBody(target: ReportTarget): string {
  return [
    `Contenu signalé : ${reportLocation(target)}.`,
    "",
    "Raisons du signalement (pour un contenu que vous estimez illicite, expliquez pourquoi) :",
    "",
    "",
    "Précisions sur l’emplacement (fiche, élément, texte en cause) :",
    "",
    "",
    "Vos nom et prénom (facultatifs pour un contenu d’abus sexuels sur mineurs, d’exploitation sexuelle d’enfants ou de pédopornographie) :",
    "",
    "Je déclare de bonne foi que les informations fournies sont exactes et complètes (écrivez « oui ») :",
  ].join("\n");
}

/** Adresse « mailto: » du signalement (objet et message encodés). */
export function reportMailto(target: ReportTarget): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(reportSubject(target))}&body=${encodeURIComponent(reportBody(target))}`;
}
