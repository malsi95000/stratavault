// Traitements de données personnelles (RGPD art. 13), affichés sur /confidentialite et repris dans
// docs/registre-traitements.md. Chaque description correspond au code : à mettre à jour avec lui.
import { SUPABASE_COOKIE_MAX_AGE_S } from "@/features/legal/storageInventory";
import { CONTACT_PROVIDER, DATA_PROVIDER, HOST, HOST_FUNCTION_LOCATION, INACTIVE_ACCOUNT_YEARS } from "@/lib/legal";

export type Processing = {
  id: string;
  title: string;
  purpose: string;
  legalBasis: string;
  data: readonly string[];
  /** Caractère obligatoire ou non des données et conséquences d'un refus (RGPD art. 13.2.e). */
  provision?: string;
  recipients: string;
  location: string;
  retention: string;
};

const CONTRACT = "Exécution du contrat (conditions d’utilisation) — art. 6, paragraphe 1, point b) du RGPD.";
const LEGITIMATE_SECURITY =
  "Intérêt légitime de l’éditeur à assurer la sécurité du service et des comptes — art. 6, paragraphe 1, point f) du RGPD.";

/** Données transmises automatiquement à chaque requête (RGPD art. 13.2.e). */
const TECHNICAL_PROVISION =
  "L’adresse IP est transmise automatiquement par votre navigateur à chaque requête : elle est techniquement nécessaire pour accéder au site et utiliser ses formulaires ; sans elle, le service ne peut pas être fourni.";

/** Durée de conservation des messages reçus (reprise dans docs/registre-traitements.md). */
export const CONTACT_RETENTION =
  "Messages et réponses supprimés un an après la dernière réponse. Demandes d’exercice de droits : la demande et la réponse sont conservées cinq ans après la réponse, pour pouvoir prouver qu’elles ont été traitées (délai de prescription de droit commun, article 2224 du Code civil), puis supprimées.";

const SUPABASE_LOCATION = `Base de données et authentification hébergées chez ${DATA_PROVIDER.region}. ${DATA_PROVIDER.name} (Singapour) et ses sous-traitants (liste publiée par Supabase, voir « Transferts hors de l’Union européenne ») peuvent y accéder depuis l’extérieur de l’Union européenne : ces transferts sont encadrés par les ${DATA_PROVIDER.transfers}.`;

/** Serveur de l'application : fonctions Vercel, par lesquelles passent toutes les requêtes. */
const HOST_RECIPIENT = `${HOST.name}, hébergeur et sous-traitant (exécution du serveur de l’application, par lequel passent toutes les données envoyées au service)`;

/**
 * Deux lieux d'exécution chez Vercel : le proxy (src/proxy.ts : renouvellement de session à partir des
 * cookies, compteur de renouvellement par IP), déployé dans toutes les régions, puis les fonctions,
 * dans la région du projet.
 */
const HOST_LOCATION = `Le serveur de l’application s’exécute sur l’infrastructure de ${HOST.name}. Chaque requête passe d’abord par son proxy, qui lit les cookies de session pour renouveler la session et tient le compteur de renouvellement : ${HOST.name} l’exécute ${HOST.proxyLocation}. Elle est ensuite traitée par les fonctions de l’application (pages, formulaires, cartes), exécutées dans la région ${HOST_FUNCTION_LOCATION}. ${HOST.name} étant établie aux États-Unis, ces transferts sont encadrés ainsi : ${HOST.transfers}.`;

const SESSION_DAYS = SUPABASE_COOKIE_MAX_AGE_S / 86400;

export const PROCESSINGS: readonly Processing[] = [
  {
    id: "compte",
    title: "Compte utilisateur",
    purpose:
      "Créer et gérer votre compte, vous authentifier, vous envoyer les e-mails de confirmation d’adresse et de réinitialisation du mot de passe.",
    legalBasis: CONTRACT,
    data: [
      "adresse e-mail ;",
      "mot de passe : transmis à Supabase par le serveur de l’application, qui ne le conserve ni ne le journalise ; Supabase Auth le hache avec bcrypt (sel compris) et ne le stocke jamais en clair ;",
      "dates de création du compte, de confirmation de l’adresse et de dernière connexion ;",
      "sessions ouvertes : dates, et adresse IP et navigateur (user agent) du serveur de l’application, par lequel passent vos demandes, enregistrés par Supabase Auth ;",
      "exception : un lien reçu par e-mail au format par défaut de Supabase s’ouvre d’abord chez Supabase, qui reçoit alors votre adresse IP et votre navigateur et les inscrit dans ses journaux.",
    ],
    provision:
      "L’adresse e-mail et le mot de passe sont nécessaires à la création du compte (exigence contractuelle) ; sans eux, aucun compte ne peut être créé, mais le service reste utilisable en mode démo, sans compte.",
    recipients: `L’éditeur (tableau de bord de Supabase) ; ${DATA_PROVIDER.name}, sous-traitant (authentification, base de données, envoi des e-mails par son service d’e-mail) ; ${HOST_RECIPIENT}.`,
    location: `${SUPABASE_LOCATION} ${HOST_LOCATION}`,
    retention: `Jusqu’à la suppression du compte, que vous pouvez faire à tout moment depuis la page « Mon compte » (effet immédiat). Compte inactif : l’éditeur s’engage à supprimer manuellement un compte resté sans connexion pendant ${INACTIVE_ACCOUNT_YEARS} ans, après en avoir prévenu son titulaire par e-mail. Dans un navigateur, la session se ferme à la déconnexion ou après ${SESSION_DAYS} jours sans utilisation du compte.`,
  },
  {
    id: "cartes",
    title: "Cartes enregistrées dans un compte",
    purpose: "Enregistrer vos cartes stratégiques dans votre compte et les retrouver sur vos appareils.",
    legalBasis: CONTRACT,
    data: [
      "nom et contenu de chaque carte (notes et dates des pays, liens, balises, points, zones, textes, flux et leurs fiches ; fiches supplémentaires avec leur titre ; couleurs et catégories des éléments ; catégories définies dans la carte, avec leur nom et leur couleur) ;",
      "logo ou aperçu de chaque carte, s’il y en a un (icône et couleur choisies, ou miniature de la carte) ;",
      "nombre d’éléments par carte, dates de création et de modification, numéro de version.",
    ],
    provision: "Facultatif : vous choisissez ce que vous enregistrez. Sans carte enregistrée, il n’y a simplement rien à retrouver.",
    recipients: `L’éditeur, pour l’administration technique uniquement ; ${DATA_PROVIDER.name}, sous-traitant (hébergement de la base) ; ${HOST_RECIPIENT}. Les cartes sont privées : la base n’autorise chaque compte qu’à ses propres cartes.`,
    location: `${SUPABASE_LOCATION} ${HOST_LOCATION} Une copie de travail de la carte en cours reste aussi dans votre navigateur (voir la page Cookies).`,
    retention: `Jusqu’à la suppression de la carte ou du compte (les cartes sont supprimées avec le compte). Sauvegardes de la base chez Supabase : ${DATA_PROVIDER.backupRetention} ; une carte supprimée peut y subsister jusqu’à l’expiration de la dernière sauvegarde qui la contient.`,
  },
  {
    id: "securite",
    title: "Sécurité et lutte contre les abus",
    purpose:
      "Limiter le nombre de tentatives (connexion, inscription, mot de passe oublié, nouveau mot de passe, liens reçus par e-mail, renouvellement de session, déconnexion, suppression du compte, téléchargement des données du compte) et le nombre de téléchargements des données menés en même temps, pour empêcher les attaques par force brute et la saturation du service.",
    legalBasis: LEGITIMATE_SECURITY,
    data: [
      "adresse IP (en IPv6, son préfixe /64) ;",
      "pour la connexion et le mot de passe oublié : adresse e-mail saisie, associée ou non à l’adresse IP ;",
      "pour la suppression du compte et le téléchargement des données : identifiant du compte connecté (pour le téléchargement, aussi pendant qu’il est en cours, avec l’adresse IP, pour en limiter le nombre simultané par adresse) ;",
      "nombre de tentatives dans la fenêtre en cours.",
    ],
    provision: `${TECHNICAL_PROVISION} L’adresse e-mail est celle que vous saisissez pour vous connecter ou réinitialiser votre mot de passe.`,
    recipients: `${HOST.name}, hébergeur : les compteurs restent dans la mémoire du serveur de l’application, qu’il exécute. Ils ne sont transmis à personne d’autre.`,
    location: `Mémoire vive du serveur de l’application (jamais écrite sur disque ni en base de données) : celle du proxy pour le compteur de renouvellement de session, celle des fonctions pour les autres compteurs. ${HOST_LOCATION}`,
    retention:
      "Le compteur repart à zéro à la fin de sa fenêtre (5 à 60 minutes selon l’action) ; une entrée échue peut rester en mémoire jusqu’à son remplacement ou l’arrêt de l’instance du serveur. Un téléchargement en cours est oublié à sa fin, quand il échoue ou quand le fichier n’est plus lu (10 secondes sans première lecture, 2 minutes entre deux lectures), et au plus tard 15 minutes après son début : une minuterie efface alors son entrée de la mémoire. Les messages d’erreur journalisés par l’application ne contiennent que le type et le code de l’erreur, aucune donnée personnelle.",
  },
  {
    id: "journaux",
    title: "Journaux d’hébergement",
    purpose: "Faire fonctionner le site, diagnostiquer les pannes et détecter les abus.",
    legalBasis: LEGITIMATE_SECURITY,
    data: [
      "adresse IP, navigateur (user agent), page demandée et ses paramètres, date, code de réponse ;",
      "côté Supabase : journaux des requêtes à l’API et à la base, qui viennent du serveur de l’application, sauf l’ouverture d’un lien reçu par e-mail au format par défaut de Supabase, journalisée avec votre adresse IP et votre navigateur ;",
      "côté Supabase : journaux d’authentification, tenus par la plateforme Supabase (pas dans la base du projet), qui enregistrent les événements du compte (connexion, inscription, réinitialisation du mot de passe, déconnexion…) avec l’identifiant du compte, l’adresse IP et le navigateur à l’origine de la requête (ceux du serveur de l’application, ou les vôtres à l’ouverture d’un lien au format par défaut) et d’autres métadonnées (dont, le cas échéant, l’adresse e-mail).",
    ],
    provision: TECHNICAL_PROVISION,
    recipients: `${HOST.name}, hébergeur, comme sous-traitant pour le fonctionnement du site et pour son propre compte pour l’usage décrit dans « Durée de conservation » ; ${DATA_PROVIDER.name}, sous-traitant. L’éditeur peut les consulter.`,
    location: `${HOST.name} (États-Unis) : ${HOST.transfers}. ${DATA_PROVIDER.name} : ${DATA_PROVIDER.logLocation} ; ces transferts sont encadrés par les ${DATA_PROVIDER.transfers}.`,
    retention: `Consultables par l’éditeur pendant ${HOST.logRetention} chez ${HOST.name} ; chez Supabase, ${DATA_PROVIDER.logRetention} pour les journaux de l’API et de la base, et ${DATA_PROVIDER.authLogRetention} pour les journaux d’authentification (durées indiquées par la documentation de chaque prestataire). En outre, ${HOST.name} se réserve (${HOST.systemDataClause}) le droit d’utiliser les données techniques nées du service (données de trafic, télémétrie, journaux, statistiques d’usage) pour toutes ses finalités, pendant et après la durée du contrat, et de ne les divulguer que sous forme agrégée ou dépersonnalisée. Pour cet usage, ${HOST.name} décide seule des finalités et agit pour son propre compte, en responsable de traitement distinct (ses conditions, section 10.1, prévoient qu’elle traite ces données comme responsable de traitement ou comme sous-traitant), selon ses conditions et sa politique de confidentialité, sans durée de conservation annoncée. Les journaux que Supabase conserve pour ses propres besoins relèvent de sa politique de confidentialité. Les liens figurent dans « Transferts hors de l’Union européenne ».`,
  },
  {
    id: "demo",
    title: "Mode démo (sans compte)",
    purpose: "Utiliser l’éditeur et la banque de cartes sans créer de compte.",
    legalBasis: CONTRACT,
    data: [
      "cartes enregistrées uniquement dans votre navigateur (base IndexedDB « stratavault ») ;",
      "cookie « sv-demo » qui mémorise ce choix, sans donnée personnelle.",
    ],
    provision: "Facultatif : le mode démo n’est utilisé que si vous le choisissez ; vous pouvez aussi utiliser le service avec un compte.",
    recipients: "Personne : les cartes de la démo ne quittent pas votre navigateur, l’éditeur n’y a pas accès.",
    location: "Votre navigateur.",
    retention:
      "Jusqu’à ce que vous les supprimiez : banque de cartes, « Effacer les données de ce navigateur » dans votre espace, ou réglages du navigateur (voir la page Cookies). Le cookie expire au bout de 30 jours.",
  },
  {
    id: "contact",
    title: "Demandes envoyées par e-mail",
    purpose: "Répondre à vos questions et à vos demandes d’exercice de droits.",
    legalBasis:
      "Intérêt légitime à répondre aux messages reçus — art. 6, paragraphe 1, point f) ; obligation légale pour les demandes d’exercice de droits — art. 6, paragraphe 1, point c) du RGPD.",
    data: ["adresse e-mail de l’expéditeur et contenu du message."],
    provision: "Facultatif : écrire n’est jamais obligatoire pour utiliser le service.",
    recipients: CONTACT_PROVIDER
      ? `L’éditeur ; ${CONTACT_PROVIDER.name}, fournisseur de la messagerie de contact.`
      : "L’éditeur ; le fournisseur de la messagerie de contact (à préciser avant la mise en ligne).",
    location: CONTACT_PROVIDER
      ? CONTACT_PROVIDER.location
      : "Selon le fournisseur de la messagerie de contact (à préciser avant la mise en ligne).",
    retention: CONTACT_RETENTION,
  },
];
