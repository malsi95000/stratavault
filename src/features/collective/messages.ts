// Textes de la carte collective (interface, barre d'aide, erreurs). L'avertissement affiché à
// l'entrée (COM-02) est dans warning.ts.
import { frenchDate } from "@/features/editor/components/fiches/format";
import { CONTACT_EMAIL } from "@/lib/legal";
import { MAX_DECISION_FACTS, MAX_LEGAL_BASIS, MIN_LEGAL_BASIS } from "./decisionGrounds";
import type { ItemProblem } from "./itemData";
import {
  CHANGES_PER_DAY,
  CREATES_PER_DAY,
  MAX_DAILY_PATH_POINTS,
  MAX_ITEMS_PER_AUTHOR,
  MAX_ITEM_NOTE,
  MAX_ITEM_PATH_POINTS,
  MAX_ITEM_TITLE,
  REPORTS_PER_DAY,
  SUSPENSION_DAYS,
} from "./limits";
import { MIN_ILLEGAL_DETAILS } from "./reportForm";
import { BLOCKS_PER_DAY, MAX_BLOCKS } from "@/features/contacts/limits";
import type { DecisionAction, ItemKind, ModerationAction, QueueStatus, ReportReason } from "./types";

export const COLLECTIVE_TITLE = "Carte collective";

// Barre d'aide : modification refusée par les règles de la carte (rules.ts).
export const HINT_NOT_YOURS = "Cet élément a été ajouté par un autre membre : vous ne pouvez ni le modifier ni le supprimer. Vous pouvez le signaler depuis sa fiche.";
export const HINT_LINK_FOREIGN = "Dans la carte collective, un lien relie des pays ou vos propres éléments, pas ceux des autres membres.";
export const HINT_UNSUPPORTED = "La carte collective n’accepte que des balises, points, textes, zones, liens et flux, avec leur fiche.";
export const HINT_DELETE_ONLY =
  "Vous pouvez seulement supprimer vos éléments pour le moment (bouton Supprimer de leur fiche, ou Gomme).";
export const HINT_AUTHOR_FULL = `Vous avez atteint le nombre maximal d’éléments (${MAX_ITEMS_PER_AUTHOR}) : supprimez-en avant d’en ajouter.`;

const PROBLEM_HINTS: Record<ItemProblem, string> = {
  "title-too-long": `Titre trop long : ${MAX_ITEM_TITLE} caractères au plus dans la carte collective.`,
  "note-too-long": `Notes trop longues : ${MAX_ITEM_NOTE.toLocaleString("fr-FR")} caractères au plus dans la carte collective.`,
  "forbidden-chars": "Ce texte contient des caractères invisibles ou de contrôle, refusés dans la carte collective.",
  "bad-date": "Date invalide : choisissez une date complète.",
  "path-too-long": `Tracé trop long : ${MAX_ITEM_PATH_POINTS.toLocaleString("fr-FR")} points au plus dans la carte collective. Tracez une forme plus simple.`,
  "too-large": "Élément trop volumineux pour la carte collective : raccourcissez ses notes ou son tracé.",
  invalid: "Cet élément ne peut pas être ajouté à la carte collective.",
};

export const problemHint = (problem: ItemProblem) => PROBLEM_HINTS[problem];

// États de la session (barre du haut).
export const COLLECTIVE_LOADING = "Chargement de la carte collective…";
export const COLLECTIVE_SAVING = "Publication…";
export const COLLECTIVE_SAVED = "Vos ajouts sont publiés.";
export const COLLECTIVE_SAVE_RETRY = "Publication impossible pour le moment : nouvel essai dans quelques secondes.";
export const COLLECTIVE_READ_ONLY_NO_PROFILE =
  "Sans profil, vous pouvez seulement supprimer vos éléments et signaler ceux des autres : créez votre profil pour contribuer (vos ajouts sont signés de votre nom affiché et de votre identifiant public).";
/** Date de fin d'une suspension (ISO), en toutes lettres. */
const untilDate = (until: string) => frenchDate(until.slice(0, 10));
/** Contributions suspendues par la modération : suppression seulement (`until` : fin, ISO ; null si inconnue). */
export const collectiveReadOnlySuspended = (until: string | null) =>
  `La modération a suspendu vos contributions${until ? ` jusqu’au ${untilDate(until)}` : ""} : vous pouvez seulement supprimer vos éléments (bouton Supprimer de leur fiche, ou Gomme) et signaler ceux des autres.`;
export const COLLECTIVE_UNAVAILABLE = "Carte collective indisponible pour le moment. Réessayez dans quelques instants.";
export const COLLECTIVE_SESSION_ENDED = "Votre session a expiré : reconnectez-vous pour continuer.";
export const COLLECTIVE_RATE_LIMITED = "Trop de demandes en peu de temps : réessayez plus tard.";

// Refus d'un envoi : l'élément est remis comme la base le connaît.
const DAILY_FULL = `vous avez atteint ce que vous pouvez publier en 24 heures (${MAX_DAILY_PATH_POINTS.toLocaleString("fr-FR")} points de tracé, 128 Kio) : réessayez plus tard.`;
const SUSPENDED = "vos contributions sont suspendues par la modération.";
export const REFUSED_CREATE: Record<
  "suspended" | "id-taken" | "invalid-link" | "author-full" | "daily-full" | "map-full" | "invalid" | "rate-limited" | "no-profile",
  string
> = {
  suspended: `Un ajout n’a pas été publié : ${SUSPENDED}`,
  "id-taken": "Un ajout n’a pas pu être publié (identifiant déjà pris) : recommencez-le.",
  "invalid-link": "Un lien n’a pas été publié : il doit relier des pays ou vos propres éléments encore visibles.",
  "author-full": "Un ajout n’a pas été publié : vous avez atteint la place qui vous est réservée sur la carte collective.",
  "daily-full": `Un ajout n’a pas été publié : ${DAILY_FULL}`,
  "map-full": "Un ajout n’a pas été publié : la carte collective est pleine pour le moment.",
  invalid: "Un ajout n’a pas été publié : il ne respecte pas les règles de la carte collective.",
  "rate-limited": `Un ajout n’a pas été publié : ${CREATES_PER_DAY} ajouts par jour au plus.`,
  "no-profile": "Un ajout n’a pas été publié : créez d’abord votre profil.",
};
export const REFUSED_UPDATE = {
  suspended: `Une modification n’a pas été publiée : ${SUSPENDED}`,
  "not-found": "Un de vos éléments n’est plus disponible (masqué par la modération ou supprimé) : il a été retiré de la carte.",
  invalid: "Une modification n’a pas été publiée : elle ne respecte pas les règles de la carte collective.",
  "author-full": "Une modification n’a pas été publiée : vous avez atteint la place qui vous est réservée.",
  "daily-full": `Une modification n’a pas été publiée : ${DAILY_FULL}`,
  "map-full": "Une modification n’a pas été publiée : la carte collective est pleine pour le moment.",
  "rate-limited": `Une modification n’a pas été publiée : ${CHANGES_PER_DAY.toLocaleString("fr-FR")} modifications par jour au plus.`,
  "no-profile": "Une modification n’a pas été publiée : créez d’abord votre profil.",
} as const;
export const REFUSED_DELETE_RATE_LIMITED = `Une suppression n’a pas été publiée : ${CHANGES_PER_DAY.toLocaleString("fr-FR")} modifications par jour au plus.`;

// Information au point de collecte (avertissement d'entrée, signalement) : règles et données.
export const TERMS_LINK = "Conditions d’utilisation (règles de la carte collective)";
export const PRIVACY_LINK = "Politique de confidentialité (contributions, signalements, modération)";
export const LEGAL_LINKS_LABEL = "Textes applicables";

// Barre du haut.
export const SPACE_LINK = "Mon espace";
export const WARNING_BUTTON = "Avertissement";
export const NOTICES_BUTTON = "Avis de modération";
export const MODERATION_LINK = "Modération";
export const PROFILE_LINK = "Créer mon profil";

// Fiche d'un élément.
export const OWN_ITEM = "Votre contribution";
export const OWN_ITEM_PENDING = "Votre contribution (publication en cours)";
export const ANONYMOUS_AUTHOR = "Membre sans profil";
/** Signature d'un élément : nom affiché (que d'autres peuvent porter) et identifiant public (unique). */
export const contributedBy = (name: string | null, handle: string | null) =>
  handle ? `Ajouté par ${name ?? handle} (@${handle})` : `Ajouté par ${ANONYMOUS_AUTHOR}`;
export const COUNTRY_FICHE_NOTE = "Les fiches des pays ne se modifient pas dans la carte collective : ajoutez une balise, un point ou un lien.";
export const FLUX_FICHE_NOTE = "La fiche d’un flux est commune à sa couleur : elle ne se modifie pas dans la carte collective.";
export const REPORT_BUTTON = "Signaler";

// Blocage de l'auteur d'un élément (même blocage que depuis la page « Contacts »).
export const BLOCK_AUTHOR_BUTTON = "Bloquer l’auteur";
export const BLOCK_AUTHOR_PENDING = "Blocage…";
export const BLOCK_AUTHOR_CONFIRM_LABEL = "Bloquer";
export const confirmBlockAuthor = (handle: string | null) =>
  `Bloquer ${handle ? `@${handle}` : "l’auteur de cet élément"} ? Vous ne verrez plus ses éléments de la carte collective ni son profil, et lui ne verra plus les vôtres ; le contact, les demandes et les partages de cartes entre vous sont supprimés. Il n’en est pas prévenu. Vous pourrez le débloquer depuis la page « Contacts ».`;
export const BLOCK_AUTHOR_RESULTS_TEXT = {
  blocked: "Auteur bloqué : ses éléments ne vous sont plus montrés.",
  "blocks-full": `Vous avez atteint la limite de ${MAX_BLOCKS} comptes bloqués.`,
  "own-item": "C’est votre propre élément.",
  "not-found": "Cet élément n’est plus disponible.",
} as const;
export const BLOCK_AUTHOR_RATE_LIMITED = `Vous avez atteint la limite de ${BLOCKS_PER_DAY} blocages par jour. Réessayez demain.`;
export const BLOCK_AUTHOR_INVALID = "Cet élément n’est plus disponible.";

// Signalement.
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  illegal: "Contenu illicite",
  hate: "Haine, violence ou discrimination",
  harassment: "Harcèlement ou attaque d’une personne",
  "personal-data": "Données personnelles ou vie privée d’autrui",
  misinformation: "Information manifestement fausse",
  spam: "Publicité ou spam",
  other: "Autre raison",
};
export const REPORT_TITLE = "Signaler cet élément";
export const REPORT_LEAD =
  "Votre signalement est transmis aux modérateurs, sans votre nom. Ils peuvent masquer ou supprimer l’élément ; vous serez informé de leur décision (« Avis de modération »), sauf si l’auteur supprime son compte avant : l’élément et les signalements disparaissent alors avec lui.";
export const REPORT_REASON_LABEL = "Motif";
export const REPORT_REASON_PLACEHOLDER = "Choisissez un motif";
export const REPORT_REASON_REQUIRED = "Choisissez le motif du signalement.";
export const REPORT_DETAILS_LABEL = "Précisions (facultatif)";
/** Contenu illicite : notification au sens de l'article 16 du DSA (explication, bonne foi). */
export const REPORT_ILLEGAL_DETAILS_LABEL = "Pourquoi ce contenu est-il illicite ? (obligatoire)";
export const REPORT_ILLEGAL_HINT =
  "Indiquez les faits et, si possible, la loi en cause. Le signalement est rattaché à votre compte (son adresse e-mail, pas votre nom) ; présenter sciemment comme illicite un contenu qui ne l’est pas est puni par la loi.";
export const REPORT_GOOD_FAITH_LABEL = "Je déclare de bonne foi que les informations de ce signalement sont exactes et complètes.";
export const REPORT_DETAILS_REQUIRED = `Pour un contenu illicite, expliquez en ${MIN_ILLEGAL_DETAILS} caractères au moins pourquoi vous l’estimez illicite.`;
export const REPORT_GOOD_FAITH_REQUIRED = "Pour un contenu illicite, cochez la déclaration de bonne foi.";
export const REPORT_SUBMIT = "Envoyer le signalement";
export const REPORT_PENDING = "Envoi…";
export const REPORT_RESULTS_TEXT = {
  reported: "Signalement envoyé. Merci : les modérateurs vont l’examiner.",
  "already-reported": "Vous avez déjà signalé cet élément.",
  "own-item": "C’est votre propre élément : supprimez-le depuis sa fiche si besoin.",
  "not-found": "Cet élément n’est plus disponible.",
} as const;
export const REPORT_RATE_LIMITED = `Vous avez atteint la limite de ${REPORTS_PER_DAY} signalements par jour. Pour une urgence, écrivez au contact du site.`;
export const REPORT_INVALID =
  "Vérifiez le motif et les précisions (500 caractères au plus, sans caractères invisibles ; pour un contenu illicite, une explication et la déclaration de bonne foi).";

// Modération.
export const ACTION_LABELS: Record<ModerationAction, string> = {
  hide: "Masquer",
  restore: "Rétablir",
  delete: "Supprimer",
  dismiss: "Classer les signalements",
};
/** Libellés du journal : décisions des modérateurs et retrait par son auteur. */
export const DECISION_LABELS: Record<DecisionAction, string> = {
  ...ACTION_LABELS,
  withdraw: "Retiré par son auteur",
};
export const ACTION_DONE: Record<DecisionAction, string> = {
  hide: "masqué",
  restore: "rétabli",
  delete: "supprimé",
  dismiss: "maintenu (signalements classés)",
  withdraw: "retiré par son auteur",
};
export const SUSPEND_LABEL = `Suspendre aussi les contributions de l’auteur pendant ${SUSPENSION_DAYS} jours`;
export const SUSPEND_HINT =
  "Ni ajout ni modification pendant la suspension (il peut encore supprimer ses éléments). Rétablir l’élément la lève.";
export const MODERATE_RESULTS_TEXT = {
  hidden: "Élément masqué. Son auteur en est informé.",
  restored: "Élément rétabli. Son auteur en est informé.",
  deleted: "Élément supprimé. Son auteur en est informé.",
  dismissed: "Signalements classés. Les membres qui les avaient faits en sont informés.",
  unchanged: "Rien à faire : l’élément est déjà dans cet état, ou n’a aucun signalement en attente.",
  "own-item": "Vous ne pouvez pas décider sur vos propres éléments : laissez un autre modérateur s’en charger.",
  "not-found": "Cet élément n’existe plus.",
} as const;
export const MODERATE_INVALID = `Choisissez une décision et la règle en cause (pour un contenu illicite, citez le texte de loi en cause, ${MIN_LEGAL_BASIS} à ${MAX_LEGAL_BASIS} caractères), et décrivez les faits retenus (3 à ${MAX_DECISION_FACTS} caractères).`;
export const MODERATE_RATE_LIMITED = "Limite de décisions atteinte pour aujourd’hui.";
export const MODERATION_FORBIDDEN = "Cette page est réservée aux modérateurs.";

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  ping: "Balise",
  point: "Point",
  text: "Texte",
  zone: "Zone",
  link: "Lien",
  flux: "Flux",
};

// Avis de modération (auteur, membre qui a signalé). Supprimer un élément supprime aussi les liens de
// son auteur qui y sont rattachés (moderate_collective_item) : l'avis d'auteur le dit.
export function noticeText(role: "author" | "reporter", action: DecisionAction, kind: ItemKind, title: string): string {
  const what = `${ITEM_KIND_LABELS[kind].toLowerCase()}${title ? ` « ${title} »` : ""}`;
  if (role === "author") {
    const links = action === "delete" && kind !== "link" ? ", avec vos liens qui y étaient rattachés s’il y en avait," : "";
    return `Votre élément (${what}) a été ${ACTION_DONE[action]}${links} par la modération.`;
  }
  return `Votre signalement (${what}) a été traité : élément ${ACTION_DONE[action]}.`;
}
/**
 * Exposé des motifs d'un avis d'auteur (DSA, art. 17, paragraphe 3, b et c) : la décision suit-elle
 * des signalements (`reports` : nombre traités ; 0 : initiative de la modération), prise par une
 * personne, sans moyen automatisé.
 */
export function noticeOrigin(reports: number): string {
  const origin =
    reports > 0
      ? `à la suite de ${reports} signalement${reports > 1 ? "s" : ""} de membres`
      : "à l’initiative de la modération, sans signalement";
  return `Décision prise par un modérateur, ${origin}, après examen humain et sans traitement automatisé.`;
}
/** Suspension annoncée par un avis ou inscrite au journal (`until` : fin, ISO). */
export const suspensionText = (until: string) => `Contributions suspendues jusqu’au ${untilDate(until)}.`;
export const NOTICES_EMPTY = "Aucun avis de modération.";
export const NOTICE_REASON = "Motif";
/** Contestation d'une décision : adresse de contact du site (src/lib/legal.ts) et règles de la carte (CGU). */
export const NOTICE_CONTEST_EMAIL = CONTACT_EMAIL;
export const NOTICE_CONTEST = "Pour contester une décision, écrivez en indiquant l’élément concerné à";
/** Recours juridictionnel (DSA, art. 17, paragraphe 3, f). */
export const NOTICE_COURTS = "Vous pouvez aussi saisir les juridictions françaises.";
export const NOTICE_RULES_LINK = "Règles de la carte collective et de sa modération";
export const DELETE_HIDDEN = "Supprimer définitivement cet élément";
export const DELETE_HIDDEN_CONFIRM = "Supprimer définitivement cet élément masqué ? Cette action est irréversible.";
export const HIDDEN_DELETED = "Élément supprimé.";
/** Éléments masqués du compte, listés dans la fenêtre des avis même après l'effacement de leur avis. */
export const HIDDEN_ITEMS_TITLE = "Vos éléments masqués";
export const HIDDEN_ITEMS_LEAD =
  "Masqués par la modération, ils ne sont plus montrés aux autres membres : seuls vous et les modérateurs les voyez. Vous pouvez les supprimer définitivement à tout moment.";
export const NOTICE_STILL_HIDDEN = `Cet élément est encore masqué (voir « ${HIDDEN_ITEMS_TITLE} »).`;
/** Libellé d'un élément masqué (sorte et titre). */
export const hiddenItemLabel = (kind: ItemKind, title: string) => `${ITEM_KIND_LABELS[kind]}${title ? ` « ${title} »` : ""}`;

// Erreurs génériques des Server Actions.
export const ACTION_SESSION_CHANGED = "Un autre compte a été ouvert dans ce navigateur : rechargez la page.";

// Page de modération (modérateurs seulement).
export const MODERATION_TITLE = "Modération de la carte collective";
export const MODERATION_LEAD =
  "Éléments signalés par les membres (même retirés depuis par leur auteur ; ceux signalés comme illicites d’abord, puis du plus ancien signalement au plus récent), puis éléments masqués, par pages de 100. Chaque décision exige la règle en cause (choisie parmi les motifs de retrait des conditions d’utilisation) et les faits retenus : ce motif est enregistré au journal et transmis, sans votre nom, aux membres qui avaient signalé l’élément et à son auteur (sauf pour un classement), avec l’origine de la décision (signalements ou initiative de la modération). Pour un contenu illicite, citez obligatoirement le texte de loi en cause (fondement légal), et expliquez dans les faits en quoi le contenu y contrevient. Vos propres éléments n’apparaissent ni ici ni au journal : un autre modérateur en décide.";
export const QUEUE_TITLE = "File de modération";
export const QUEUE_EMPTY = "Aucun élément signalé ni masqué.";
/** Page de la file au-delà de la dernière (décisions prises entre-temps). */
export const QUEUE_PAGE_EMPTY = "Plus rien sur cette page : revenez à la première page de la file.";
export const QUEUE_PREVIOUS = "Page précédente";
export const QUEUE_NEXT = "Page suivante";
/** Titre de la file : nombre d'éléments, et page en cours s'il y en a plusieurs. */
export function queueTitle(total: number, page: number, pages: number): string {
  return pages > 1 ? `${QUEUE_TITLE} (${total}, page ${page + 1} sur ${pages})` : `${QUEUE_TITLE} (${total})`;
}
export const REPORTED_VERSION =
  "Modifié par son auteur depuis le signalement. Contenu au moment du signalement (votre décision vaut aussi pour lui) :";
export const LOG_TITLE = "Journal des décisions";
export const LOG_EMPTY = "Aucune décision pour le moment.";
export const CONTENT_UNREADABLE = "Contenu illisible (il ne respecte plus les règles de la carte) : masquez-le ou supprimez-le.";
export const STATUS_LABELS: Record<QueueStatus, string> = { visible: "Visible", hidden: "Masqué", withdrawn: "Retiré par son auteur" };
export const WITHDRAWN_NOTE =
  "Retiré par son auteur après ces signalements : contenu signalé ci-dessous. Supprimer retient les signalements (l’identifiant ne resservira pas, suspension possible, l’auteur est informé) ; classer les clôt.";
export const CONTENT_NOT_KEPT = "Contenu signalé non conservé (réserve des copies pleine au moment du signalement).";
export const DECISION_LABEL = "Décision";
/** Exposé des motifs (DSA, art. 17, paragraphe 3, d et e) : règle en cause, puis faits retenus. */
export const DECISION_GROUND_LABEL = "Règle en cause (conditions d’utilisation)";
export const DECISION_GROUND_PLACEHOLDER = "Choisissez la règle en cause";
export const DECISION_GROUND_REQUIRED = "Choisissez la règle en cause.";
export const DECISION_REASON_LABEL = "Faits retenus (transmis à l’auteur avec la règle)";
export const DECISION_REASON_PLACEHOLDER =
  "Par ex. : la fiche publie l’adresse personnelle d’un tiers. Pour un contenu illicite, expliquez en quoi il contrevient au texte de loi cité.";
/** Fondement légal d'une décision sur un contenu illicite (DSA, art. 17, paragraphe 3, d). */
export const DECISION_LEGAL_BASIS_LABEL = "Texte de loi en cause (transmis à l’auteur)";
export const DECISION_LEGAL_BASIS_PLACEHOLDER = "Par ex. : loi du 29 juillet 1881, article 29 (diffamation)";
export const DECISION_LEGAL_BASIS_REQUIRED = `Pour un contenu illicite, citez le texte de loi en cause (${MIN_LEGAL_BASIS} à ${MAX_LEGAL_BASIS} caractères).`;
export const DECISION_SUBMIT = "Appliquer la décision";
export const DECISION_PENDING = "Enregistrement…";
export const DECISION_DELETE_CONFIRM = "Supprimer définitivement cet élément (et les liens de son auteur qui y sont rattachés) ?";
export const UNKNOWN_AUTHOR = "Auteur sans profil";
export const authorLabel = (handle: string | null, name: string | null) =>
  handle ? `${name ?? handle} (@${handle})` : UNKNOWN_AUTHOR;
export const reportsLabel = (count: number) => (count === 0 ? "Aucun signalement en attente" : `${count} signalement${count > 1 ? "s" : ""} en attente`);

// Espace et accueil (COM-03, COM-01).
export const SPACE_COLLECTIVE_LINK = "Carte collective";
export const SPACE_COLLECTIVE_LEAD =
  "Une carte commune à tous les membres connectés : ajoutez-y vos propres éléments, signés de votre nom affiché et de votre identifiant public, et découvrez ceux des autres.";
export const unreadNoticesText = (count: number) =>
  count === 1
    ? "Vous avez 1 avis de modération non lu : ouvrez la carte collective, bouton « Avis de modération »."
    : `Vous avez ${count} avis de modération non lus : ouvrez la carte collective, bouton « Avis de modération ».`;
export const HOME_PROMO_TITLE = "La carte collective";
const HOME_PROMO_LEAD =
  "Une carte commune aux membres connectés : chacun y ajoute balises, points, liens, zones, textes et flux, signés de son nom.";
/**
 * Texte de l'encart de l'accueil. `signedIn` : le navigateur a probablement une session de compte
 * (cookies, affichage seulement) ; sinon (visiteur ou mode démo), il invite à se connecter.
 */
export const homePromoText = (signedIn: boolean) =>
  signedIn
    ? `${HOME_PROMO_LEAD} Ouvrez-la pour la découvrir et y contribuer (créez d’abord votre profil pour publier).`
    : `${HOME_PROMO_LEAD} Connectez-vous pour la découvrir et y contribuer.`;
export const homePromoLink = (signedIn: boolean) => (signedIn ? "Ouvrir la carte collective" : "Rejoindre la carte collective");
