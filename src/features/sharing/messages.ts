// Textes du partage des cartes (page « Partager », section « Partagées avec moi », lien d'invitation,
// éditeur coopératif).
import {
  INVITATION_DAYS,
  LINK_ATTEMPTS_PER_DAY,
  MAX_ACTIVE_LINKS,
  MAX_MAP_SEATS,
  MAX_SHARED_MAPS,
  SHARES_PER_DAY,
  SHARE_CHANGES_PER_DAY,
} from "./limits";
import type { InviteResult, JoinResult, MapRole } from "./types";

export const ROLE_LABELS: Record<MapRole, string> = {
  owner: "Propriétaire",
  editor: "Éditeur",
  reader: "Lecteur",
};

/** Ce que permet chaque rôle (aide des formulaires). */
export const ROLE_HELP =
  "Un éditeur peut modifier la carte (une personne à la fois) ; un lecteur la consulte seulement. Seul le propriétaire renomme, supprime ou partage la carte.";

export const INVITE_MESSAGES: Record<InviteResult, string> = {
  invited: `Invitation envoyée : elle reste valable ${INVITATION_DAYS} jours, jusqu’à sa réponse.`,
  "not-found": "Ce contact ou cette carte est introuvable : rechargez la page.",
  "already-member": "Ce contact est déjà membre de la carte.",
  "already-invited": "Ce contact a déjà une invitation en attente pour cette carte.",
  "map-full": `Cette carte a déjà ${MAX_MAP_SEATS} membres ou invitations en attente.`,
  unavailable: "Ce contact ne peut pas recevoir d’invitation pour le moment.",
};

export const JOIN_MESSAGES: Record<JoinResult, string> = {
  joined: "Vous avez rejoint la carte.",
  "already-member": "Vous êtes déjà membre de cette carte.",
  owner: "C’est votre propre carte.",
  refused: "Invitation refusée.",
  "not-found": "Ce lien ou cette invitation n’est plus valable : il a pu expirer, être épuisé ou révoqué.",
  "map-full": `Cette carte a déjà ${MAX_MAP_SEATS} membres : demandez à son propriétaire de faire de la place.`,
  "memberships-full": `Vous êtes déjà membre de ${MAX_SHARED_MAPS} cartes partagées : quittez-en une avant d’en rejoindre une autre.`,
};

export const INVITATION_CANCELLED = "Invitation annulée.";
export const LINK_REVOKED = "Lien révoqué : il ne permet plus de rejoindre la carte.";
export const LINK_CREATED = "Lien créé. Copiez-le maintenant : il ne sera plus affiché.";
export const MEMBER_ROLE_UPDATED = "Rôle modifié.";
export const MEMBER_REMOVED = "Membre retiré de la carte.";
export const MAP_LEFT = "Vous avez quitté la carte.";
/** Membre, invitation ou lien qui n'existe plus (traité dans un autre onglet…). */
export const SHARE_GONE = "Ce membre, cette invitation ou ce lien n’existe plus : rechargez la page.";
export const MAP_GONE_OR_FORBIDDEN = "Cette carte est introuvable, ou vous n’y avez plus accès.";
export const LINKS_FULL = `Cette carte a déjà ${MAX_ACTIVE_LINKS} liens actifs : révoquez-en un avant d’en créer un autre.`;
export const SHARING_NO_PROFILE =
  "Créez d’abord votre profil : les membres d’une carte partagée se reconnaissent à leur identifiant et à leur nom affiché.";
// Le même message pour les trois limites de la base : il ne dit pas laquelle est atteinte.
export const SHARING_RATE_LIMITED = `Trop d’opérations de partage aujourd’hui (au plus ${SHARES_PER_DAY} partages, ${LINK_ATTEMPTS_PER_DAY} liens ouverts et ${SHARE_CHANGES_PER_DAY} autres opérations par jour). Réessayez plus tard.`;
export const SHARING_UNAVAILABLE = "L’opération n’a pas pu aboutir. Réessayez plus tard.";
export const SHARING_SESSION_ENDED = "Votre session a pris fin : reconnectez-vous, puis recommencez.";
export const SHARING_SESSION_CHANGED = "Un autre compte est maintenant ouvert dans ce navigateur : rechargez la page.";
export const SHARING_INVALID = "Choix invalide : rechargez la page, puis recommencez.";

/** Confirmations demandées avant une action. */
export const CONFIRM_REMOVE_MEMBER = (handle: string) =>
  `Retirer @${handle} de cette carte ? Il ne pourra plus l’ouvrir, sauf nouvelle invitation ou lien qu’il n’a pas encore utilisé (un lien ne sert qu’une fois à chaque compte) ; il n’en est pas prévenu.`;
export const CONFIRM_REVOKE_LINK = "Révoquer ce lien ? Il ne permettra plus de rejoindre la carte (les membres déjà entrés restent).";
export const CONFIRM_LEAVE = (name: string) =>
  `Quitter la carte « ${name} » ? Vous ne pourrez plus l’ouvrir, sauf nouvelle invitation de son propriétaire.`;
export const CONFIRM_REFUSE_INVITATION = (name: string) => `Refuser l’invitation à la carte « ${name} » ?`;

/** Propriétaire d'une carte, tel qu'il est montré aux membres. */
export function ownerLabel(handle: string | null, name: string | null): string {
  if (name && handle) return `${name} (@${handle})`;
  if (handle) return `@${handle}`;
  return name ?? "Propriétaire sans profil";
}

/** Ce que voit un compte qui rejoint une carte (lien d'invitation, invitation d'un contact). */
export const JOIN_DISCLOSURE =
  "En rejoignant la carte, vous montrez votre identifiant et votre nom affiché à son propriétaire, et votre nom affiché aux autres membres quand vous la modifiez.";

// Éditeur coopératif.
export const COOP_LOADING = "Chargement de la carte partagée…";
export const COOP_EDITING = "Vous modifiez cette carte : les autres membres la voient en lecture seule.";
export const COOP_READER = "Lecture seule : vous êtes lecteur de cette carte.";
export const COOP_FREE = "Lecture seule : personne ne modifie cette carte pour le moment.";
export const coopHeldBy = (name: string | null) => `${name ?? "Un autre membre"} modifie cette carte.`;
export const COOP_IDLE = "Vous étiez inactif : la carte est repassée en lecture seule pour laisser la main aux autres.";
export const COOP_LOST = "Un autre membre a pris la main : la carte a été relue, vos dernières modifications non enregistrées sont perdues.";
/** Le propriétaire a fait du compte un lecteur pendant qu'il modifiait la carte. */
export const COOP_DEMOTED =
  "Vous êtes désormais lecteur de cette carte : elle a été relue, vos dernières modifications non enregistrées sont perdues.";
/** Enregistrement refusé parce que la carte a changé entre-temps (autre onglet du compte, autre membre après un bail échu…). */
export const COOP_CONFLICT =
  "La carte a été modifiée ailleurs entre-temps (autre onglet, autre appareil ou autre membre) : elle a été relue, vos dernières modifications non enregistrées sont perdues.";
export const COOP_SAVED = "Enregistré dans la carte partagée.";
export const COOP_SAVING = "Enregistrement…";
export const COOP_SAVE_FAILED = "Enregistrement impossible pour le moment : nouvel essai dans quelques secondes. Gardez cet onglet ouvert.";
export const COOP_TOO_LARGE = "Carte trop grande : la dernière modification n’a pas pu être enregistrée.";
export const COOP_INVALID = "Carte refusée par le serveur : la dernière modification n’a pas pu être enregistrée.";
export const COOP_QUOTA =
  "L’espace du compte du propriétaire est plein : la dernière modification n’a pas pu être enregistrée.";
export const COOP_MINE_ELSEWHERE =
  "Lecture seule ici : vous modifiez déjà cette carte ailleurs (autre onglet, autre appareil, ou votre espace). « Modifier la carte » reprend la main ici ; fermez d’abord l’autre page, ses modifications non enregistrées seraient perdues.";
export const COOP_GONE = "Cette carte n’est plus partagée avec vous, ou elle a été supprimée.";
export const COOP_UNAVAILABLE = "Impossible de charger la carte partagée : vérifiez votre connexion, puis rechargez la page.";
export const COOP_RATE_LIMITED = "Trop de requêtes pour cette carte : réessayez dans quelques minutes.";
/** Rafraîchissement des lecteurs refusé (limite des lectures de l'état, par exemple plusieurs onglets ouverts). */
export const COOP_REFRESH_RATE_LIMITED =
  "Carte plus relue pour le moment (trop de lectures : fermez les autres onglets de cette carte) : elle n’est peut-être plus à jour. Nouvel essai automatique.";
/** Rafraîchissement des lecteurs impossible (réseau, serveur). */
export const COOP_REFRESH_FAILED = "Carte non relue (connexion ?) : elle n’est peut-être plus à jour. Nouvel essai automatique.";
export const COOP_TAKE = "Modifier la carte";
export const COOP_RELEASE = "Rendre la main";
