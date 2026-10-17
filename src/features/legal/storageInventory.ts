// Inventaire exact des cookies et stockages du navigateur utilisés par Stratavault (page /cookies).
// Chaque nom correspond à une constante du code ; storageInventory.test.ts vérifie la
// correspondance et qu'aucun stockage du code n'est absent d'ici. Tous sont strictement
// nécessaires au service demandé (art. 82 de la loi Informatique et Libertés) : aucun consentement
// n'est demandé, mais chacun est décrit.

export type StorageKind = "cookie" | "indexeddb" | "localstorage" | "broadcastchannel";

export type StorageItem = {
  kind: StorageKind;
  /** Nom exact ; les parties variables sont entre chevrons. */
  name: string;
  purpose: string;
  /** Contenu enregistré. */
  content: string;
  duration: string;
  /** Qui l'écrit dans le navigateur. */
  issuer: string;
  /** Mode d'utilisation concerné. */
  scope: string;
  /** Options du cookie (cookies seulement). */
  options?: string;
};

export const KIND_LABELS: Record<StorageKind, string> = {
  cookie: "Cookies",
  indexeddb: "Bases IndexedDB",
  localstorage: "Stockage local (localStorage)",
  broadcastchannel: "Canaux entre onglets (BroadcastChannel)",
};

/** Préfixe des cookies de Supabase Auth (`sb-<réf. du projet>-auth-token…`). */
export const SUPABASE_COOKIE_PREFIX = "sb-";

/**
 * Durée de vie des cookies de Supabase Auth, en secondes : les 400 jours de @supabase/ssr sont
 * plafonnés à 30 jours par secureCookieOptions (src/lib/supabase/cookies.ts).
 */
export const SUPABASE_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

/** Durée de vie du cookie du mode démo (demoCookieOptions), en secondes. */
export const DEMO_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

const COOKIE_OPTIONS = "HttpOnly (illisible par le JavaScript de la page), Secure en production (HTTPS), SameSite=Lax, Path=/";

export const STORAGE_INVENTORY: readonly StorageItem[] = [
  {
    kind: "cookie",
    name: "sb-<réf. du projet>-auth-token (découpé en .0, .1… s’il est long)",
    purpose: "Garder la session du compte ouverte entre deux pages.",
    content:
      "Session de Supabase Auth : jeton d’accès (qui contient l’identifiant et l’adresse e-mail du compte), jeton de rafraîchissement, et fiche du compte (identifiant, adresse e-mail, dates de création, de confirmation et de dernière connexion).",
    duration:
      "30 jours, durée qui repart à chaque renouvellement de la session (la session se ferme donc après 30 jours sans utilisation du compte dans ce navigateur) ; effacé à la déconnexion.",
    issuer: "Serveur de Stratavault, pour Supabase Auth",
    scope: "Compte",
    options: COOKIE_OPTIONS,
  },
  {
    kind: "cookie",
    name: "sb-<réf. du projet>-auth-token-code-verifier, …-auth-token-flows-code-verifier, …-auth-token-flow-<identifiant>-code-verifier",
    purpose:
      "Sécuriser les liens envoyés par e-mail (inscription, mot de passe oublié) : seul le navigateur qui a fait la demande peut utiliser un lien au format « code ». Les liens au format « token_hash » (modèles d’e-mail recommandés dans la documentation du projet) ne s’en servent pas.",
    content: "Valeur aléatoire (vérificateur PKCE) et liste des demandes en cours.",
    duration:
      "Jusqu’à la déconnexion, ou jusqu’à l’utilisation d’un lien au format « code » ; 30 jours au plus.",
    issuer: "Serveur de Stratavault, pour Supabase Auth",
    scope: "Compte (demande d’inscription ou de réinitialisation)",
    options: COOKIE_OPTIONS,
  },
  {
    kind: "cookie",
    name: "sv-demo",
    purpose: "Mémoriser le choix « Accès temporaire (démo) » pour ouvrir la banque et l’éditeur sans compte.",
    content: "La valeur « 1 », sans aucune donnée personnelle.",
    duration:
      "30 jours ; effacé quand une session de compte s’ouvre dans ce navigateur (connexion ou lien de confirmation), à la déconnexion, ou en effaçant les cookies du site dans les réglages du navigateur.",
    issuer: "Serveur de Stratavault",
    scope: "Démo",
    options: COOKIE_OPTIONS,
  },
  {
    kind: "indexeddb",
    name: "stratavault",
    purpose: "Enregistrer les cartes du mode démo dans ce navigateur (sauvegarde automatique et banque de cartes).",
    content:
      "Cartes de la banque (nom, date, contenu, logo ou aperçu s’il y en a un : icône et couleur choisies, ou miniature de la carte), carte en cours, identifiant de la carte ouverte, et éventuels brouillons illisibles mis de côté.",
    duration:
      "Jusqu’à ce que vous les supprimiez : banque, « Effacer les données de ce navigateur » (espace, en mode démo), ou données du site dans les réglages du navigateur. Partagée par toutes les personnes qui utilisent la démo dans ce navigateur.",
    issuer: "Page Stratavault (dans votre navigateur)",
    scope: "Démo",
  },
  {
    kind: "indexeddb",
    name: "stratavault-u-<identifiant du compte>",
    purpose:
      "Garder une copie de travail de la carte en cours d’un compte, pour ne rien perdre si le serveur est momentanément injoignable.",
    content:
      "Carte en cours, identifiant de la carte ouverte, version de référence, indicateur de modifications pas encore envoyées, et éventuels brouillons illisibles mis de côté.",
    duration:
      "Effacée à la déconnexion et à la suppression du compte. Celles d’autres comptes sont effacées quand un compte s’ouvre dans ce navigateur, sinon à l’ouverture de la démo ou de la page de connexion sans session, sauf si elle contient une carte jamais envoyée au compte (gardée pour la prochaine connexion).",
    issuer: "Page Stratavault (dans votre navigateur)",
    scope: "Compte",
  },
  {
    kind: "localstorage",
    name: "stratavault-vue",
    purpose: "Mémoriser la vue choisie dans l’éditeur (planisphère, globe ou frise).",
    content: "Le nom de la vue, et celui de la dernière carte affichée (planisphère ou globe).",
    duration:
      "Jusqu’à « Effacer les données de ce navigateur » (espace, en mode démo), ou jusqu’à ce que vous effaciez les données du site dans les réglages du navigateur.",
    issuer: "Page Stratavault (dans votre navigateur)",
    scope: "Démo et compte",
  },
  {
    kind: "broadcastchannel",
    name: "stratavault-editeur",
    purpose: "Prévenir quand l’éditeur est ouvert dans plusieurs onglets sur la même carte en cours.",
    content: "Messages éphémères entre onglets (étiquette aléatoire de l’onglet, nom de la base locale). Rien n’est enregistré.",
    duration: "Le temps que les onglets restent ouverts.",
    issuer: "Page Stratavault (dans votre navigateur)",
    scope: "Démo et compte",
  },
  {
    kind: "broadcastchannel",
    name: "stratavault-comptes",
    purpose:
      "Fermer la session dans les autres onglets ouverts sur le même compte après une déconnexion ou la suppression du compte, et recharger ceux du mode démo après l’effacement de ses données.",
    content:
      "Messages éphémères : « déconnecté » avec l’identifiant du compte, ou « données de démo effacées ». Rien n’est enregistré.",
    duration: "Le temps que les onglets restent ouverts.",
    issuer: "Page Stratavault (dans votre navigateur)",
    scope: "Démo et compte",
  },
];

/** Inventaire regroupé par type, dans l'ordre de KIND_LABELS. */
export function inventoryByKind(items: readonly StorageItem[] = STORAGE_INVENTORY) {
  return (Object.keys(KIND_LABELS) as StorageKind[])
    .map((kind) => ({ kind, label: KIND_LABELS[kind], items: items.filter((item) => item.kind === kind) }))
    .filter((group) => group.items.length > 0);
}
