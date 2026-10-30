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
/**
 * Obligations d'un hébergeur de contenus de tiers (signalements, information des autorités), dans la
 * mesure où elles s'appliquent au service (docs/legal.md, point 24).
 */
const HOST_OBLIGATIONS =
  "respect des obligations d’un hébergeur (article 6 de la LCEN ; articles 16 à 18 du règlement sur les services numériques), dans la mesure où elles s’appliquent au service — art. 6, paragraphe 1, point c) du RGPD";

/** Autorités destinataires des contenus visibles d'autres membres (voir « Données traitées »). */
const AUTHORITIES =
  "Les autorités compétentes, dans les cas où la loi impose de les informer (voir « Données traitées ») ou sur réquisition.";

/**
 * Mesures que l'éditeur peut prendre hors de la carte collective (CGU, « Signalement, décisions et
 * recours ») : décrites dans le traitement « moderation », auquel renvoient ceux qu'elles touchent.
 */
export const MODERATION_TITLE = "Modération des profils, des cartes partagées et des comptes";
const MODERATION_REF = `voir « ${MODERATION_TITLE} »`;

const LEGITIMATE_SECURITY =
  "Intérêt légitime de l’éditeur à assurer la sécurité du service et des comptes — art. 6, paragraphe 1, point f) du RGPD.";

/** Données transmises automatiquement à chaque requête (RGPD art. 13.2.e). */
const TECHNICAL_PROVISION =
  "L’adresse IP est transmise automatiquement par votre navigateur à chaque requête : elle est techniquement nécessaire pour accéder au site et utiliser ses formulaires ; sans elle, le service ne peut pas être fourni.";

/** Durée de conservation des messages reçus (reprise dans docs/registre-traitements.md). */
export const CONTACT_RETENTION =
  "Messages et réponses supprimés un an après la dernière réponse, y compris les signalements de contenus et les contestations de décisions de modération (comme le journal des décisions). Demandes d’exercice de droits : la demande et la réponse sont conservées cinq ans après la réponse, pour pouvoir prouver qu’elles ont été traitées (délai de prescription de droit commun, article 2224 du Code civil), puis supprimées.";

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
      `Créer et gérer votre compte, vous authentifier, vous envoyer les e-mails de confirmation d’adresse et de réinitialisation du mot de passe ; en cas de manquement aux conditions d’utilisation, suspendre ou supprimer le compte (${MODERATION_REF}).`,
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
    recipients: `L’éditeur, pour l’administration technique uniquement ; ${DATA_PROVIDER.name}, sous-traitant (hébergement de la base) ; ${HOST_RECIPIENT}. Les cartes sont privées : la base n’autorise chaque compte qu’à ses propres cartes, et aux cartes que d’autres membres partagent avec lui (voir « Partage de cartes et coopération »).`,
    location: `${SUPABASE_LOCATION} ${HOST_LOCATION} Une copie de travail de la carte en cours reste aussi dans votre navigateur (voir la page Cookies).`,
    retention: `Jusqu’à la suppression de la carte ou du compte (les cartes sont supprimées avec le compte). Sauvegardes de la base chez Supabase : ${DATA_PROVIDER.backupRetention} ; une carte supprimée peut y subsister jusqu’à l’expiration de la dernière sauvegarde qui la contient.`,
  },
  {
    id: "profil",
    title: "Profil d’un compte",
    purpose:
      `Vous présenter aux autres membres connectés (identifiant, nom affiché, présentation, avatar), s’ils connaissent votre identifiant exact ; en cas de manquement, retirer un nom affiché, une présentation ou un avatar, ou supprimer le profil (${MODERATION_REF}).`,
    legalBasis: CONTRACT,
    data: [
      "identifiant public choisi, nom affiché, présentation, choix de visibilité, dates de création et de modification du profil et du dernier changement d’identifiant ;",
      "avatar, s’il y en a un : l’image envoyée est recadrée et réenregistrée par le serveur de l’application (WebP 256 × 256 pixels), sans ses métadonnées (lieu de la photo, appareil…) ; seule cette version est conservée ;",
      "quand vous affichez l’avatar d’un autre membre : une autorisation technique d’une minute (identifiant de votre compte, identifiant de l’avatar, échéance), qui permet de lire ce seul fichier (incluse dans « Télécharger mes données » tant qu’elle n’est pas effacée) ;",
      "quand vous envoyez un avatar : un jeton technique d’envoi de cinq minutes (identifiant de votre compte, nom du fichier attendu, échéance), qui permet d’envoyer ce seul fichier (inclus dans « Télécharger mes données » tant qu’il n’est pas effacé).",
    ],
    provision:
      "Facultatif : aucun profil n’est créé sans que vous le demandiez sur la page « Mon profil ». Sans profil, le service reste utilisable ; seules les fonctions entre membres en dépendent.",
    recipients: `Les membres connectés qui saisissent votre identifiant exact, si votre profil est visible par « tous les membres connectés » (il n’existe ni annuaire ni recherche par adresse e-mail) ; avec la visibilité « mes contacts seulement », vos contacts et les membres à qui vous envoyez une demande de contact, tant qu’elle est en attente ; jamais un compte que vous avez bloqué. Quelle que soit cette visibilité, votre identifiant et votre nom affiché sont aussi montrés avec vos éléments de la carte collective (à tous les membres connectés, voir « Carte collective et modération »), aux membres des cartes que vous partagez, y compris ceux arrivés par un lien d’invitation, à toute personne connectée qui ouvre un lien d’invitation d’une de vos cartes (avant même de la rejoindre, et même si elle ne la rejoint pas) et aux contacts que vous invitez à une carte, et au propriétaire des cartes partagées avec vous (les autres membres de ces cartes ne voient que votre nom affiché, quand vous la modifiez : « X modifie cette carte », voir « Partage de cartes et coopération »), et aux modérateurs quand un de vos éléments de la carte collective est signalé ou modéré, même si l’un de vous a bloqué l’autre. Comme toute image affichée, votre avatar peut être copié ou partagé par un membre qui l’a vu, y compris, par l’interface technique de Supabase, sous la forme d’une adresse qui reste valable sans connexion : changer ou retirer votre avatar efface le fichier et rend ces adresses inutilisables. ${AUTHORITIES} L’éditeur, pour l’administration technique ; ${DATA_PROVIDER.name}, sous-traitant (base de données et stockage des avatars, dans un espace privé) ; ${HOST_RECIPIENT}.`,
    location: `${SUPABASE_LOCATION} Avatars : ${DATA_PROVIDER.avatarStorage}. ${HOST_LOCATION}`,
    retention: `Jusqu’à la suppression du profil (page « Mon profil ») ou du compte, avec effet immédiat ; un avatar remplacé ou retiré est supprimé aussitôt (si un incident technique l’empêche, le fichier est effacé au prochain changement ou retrait d’avatar, à la suppression du profil ou du compte, ou depuis « Mon profil », qui le signale). Autorisation d’affichage d’un avatar : valable une minute, effacée à la demande d’affichage suivante d’un membre et avec le compte. Jeton d’envoi d’un avatar : valable cinq minutes, effacé dès que l’avatar est enregistré, retiré ou abandonné, au prochain envoi d’un membre une fois échu, et avec le compte. Sauvegardes de la base chez Supabase : ${DATA_PROVIDER.backupRetention} ; un profil supprimé peut y subsister jusqu’à l’expiration de la dernière sauvegarde qui le contient (les avatars, dans Supabase Storage, ne sont pas dans ces sauvegardes).`,
  },
  {
    id: "contacts",
    title: "Contacts entre membres",
    purpose:
      "Vous permettre d’envoyer des demandes de contact à d’autres membres par leur identifiant exact, d’y répondre, de garder la liste de vos contacts, d’en retirer et de bloquer un membre (depuis la page « Contacts », depuis son profil ou depuis l’un de ses éléments de la carte collective).",
    legalBasis: CONTRACT,
    data: [
      "demandes de contact en cours : identifiant de votre compte et de celui de l’autre membre, date ;",
      "contacts : identifiants des deux comptes, date de l’acceptation ;",
      "blocages : identifiant de votre compte et de celui du compte bloqué, identifiant public du membre bloqué au moment du blocage, s’il vous était visible (sur son profil, ou sur l’élément de la carte collective depuis lequel vous l’avez bloqué, qui en est signé ; jamais mis à jour), date.",
    ],
    provision:
      "Facultatif : rien n’est créé sans action de votre part. Il faut un profil pour envoyer ou recevoir une demande ; sans contact, le service reste utilisable.",
    recipients: `Les membres concernés, dans leur page « Contacts » : vos contacts voient votre identifiant actuel, votre nom affiché et votre avatar ; les membres avec qui une demande est en cours les voient tant que votre profil leur est visible (sinon, rien de vous, pas même un nouvel identifiant) ; un membre que vous avez bloqué n’en est pas averti et ne voit plus votre profil, et vous ne voyez plus le sien ; si un membre vous a bloqué, il ne voit plus votre profil, sous aucun identifiant, et garde seulement dans sa liste l’identifiant que vous aviez au moment du blocage, s’il le voyait alors : il ne voit ni votre nouvel identifiant, ni un profil recréé, et aucune de ses recherches, demandes ou tentatives de blocage ne lui permet de les reconnaître. Seule exception : un modérateur voit, dans la file et le journal de modération de la carte collective, l’identifiant actuel et le nom affiché de l’auteur d’un élément signalé, masqué ou retiré, même si l’un des deux a bloqué l’autre (un blocage ne doit pas permettre d’échapper à la modération). Les blocages dont vous faites l’objet ne vous sont pas communiqués, même sur demande, pour protéger le membre qui bloque (RGPD, article 15, paragraphe 4). Personne d’autre ne voit vos contacts : la base n’ouvre ces listes qu’à leurs deux membres. ${AUTHORITIES} L’éditeur, pour l’administration technique ; ${DATA_PROVIDER.name}, sous-traitant (base de données) ; ${HOST_RECIPIENT}.`,
    location: `${SUPABASE_LOCATION} ${HOST_LOCATION}`,
    retention: `Demande : jusqu’à son acceptation, son refus, son annulation, un blocage entre les deux comptes ou la suppression du profil ou du compte de l’un des deux. Contact : jusqu’à son retrait par l’un des deux, un blocage, ou la suppression du profil ou du compte de l’un des deux. Blocage : jusqu’à ce que vous le leviez ou la suppression de l’un des deux comptes (il survit à la suppression du profil, pour qu’un compte bloqué ne puisse pas y échapper en recréant un profil). Sauvegardes de la base chez Supabase : ${DATA_PROVIDER.backupRetention}.`,
  },
  {
    id: "partage",
    title: "Partage de cartes et coopération",
    purpose:
      `Vous permettre de partager une de vos cartes avec d’autres membres (rôle d’éditeur ou de lecteur), en invitant un contact ou par un lien d’invitation, de rejoindre et de quitter les cartes des autres, et de modifier une carte à plusieurs, un éditeur à la fois (verrou d’édition) ; en cas de manquement, retirer un contenu d’une carte partagée, révoquer ses liens, retirer un membre ou arrêter le partage (${MODERATION_REF}).`,
    legalBasis: CONTRACT,
    data: [
      "membres d’une carte : identifiant de la carte, identifiant du compte du membre, rôle, date d’entrée ;",
      "invitations d’un contact : identifiant de la carte, identifiant du compte invité, rôle proposé, dates de l’invitation et de son échéance (30 jours) ;",
      "liens d’invitation : identifiant de la carte, empreinte du jeton (le jeton lui-même n’est jamais conservé), rôle, nombre d’usages permis et utilisés, dates de création et d’échéance ;",
      "usages des liens : identifiant du lien, identifiant du compte qui l’a utilisé pour rejoindre la carte, date (un lien ne sert qu’une fois à chaque compte : un membre retiré ne revient pas par le lien qu’il a déjà utilisé) ;",
      "verrou d’édition : identifiant de la carte, identifiant du compte qui la modifie, début et échéance du bail (deux minutes, renouvelé tant qu’il est actif) ;",
      "le contenu d’une carte partagée reste celui décrit dans « Cartes enregistrées dans un compte » : il appartient au compte de son propriétaire, même quand un éditeur le modifie.",
    ],
    provision:
      "Facultatif : rien n’est partagé sans action de votre part. Il faut un profil pour partager une carte, être invité ou en rejoindre une ; sans partage, le service reste utilisable.",
    recipients: `Les membres de la carte : le propriétaire voit l’identifiant et le nom affiché de ses membres et des contacts qu’il invite ; chaque membre voit le nom de la carte, son contenu, son rôle, l’identifiant et le nom affiché du propriétaire, et le nom affiché du membre qui la modifie (« X modifie cette carte ») ; un invité voit le nom de la carte, le rôle proposé et le propriétaire ; une personne connectée qui ouvre un lien d’invitation voit, avant de rejoindre la carte, son nom, le rôle proposé et le propriétaire. Les membres ne voient pas la liste des autres membres. Un blocage entre deux comptes retire chacun des cartes de l’autre. Comme tout contenu affiché, une carte partagée peut être copiée ou exportée par ses membres. ${AUTHORITIES} L’éditeur, pour l’administration technique ; ${DATA_PROVIDER.name}, sous-traitant (base de données) ; ${HOST_RECIPIENT}.`,
    location: `${SUPABASE_LOCATION} ${HOST_LOCATION} Seule la carte d’un autre membre, ouverte dans l’éditeur coopératif, n’est pas enregistrée dans votre navigateur ; la carte en cours de votre compte, partagée ou non, l’est (voir la page Cookies).`,
    retention: `Membre : jusqu’à son départ, son retrait par le propriétaire, un blocage entre les deux comptes, ou la suppression de la carte, du profil ou du compte de l’un des deux. Invitation : jusqu’à sa réponse, son annulation, le retrait du contact ou un blocage entre les deux comptes, ou la suppression de la carte, du profil ou du compte de l’un des deux ; échue après 30 jours, elle n’est plus utilisable ni affichée et elle est effacée à la prochaine invitation envoyée pour cette carte. Lien : jusqu’à sa révocation, ou la suppression de la carte, du profil du propriétaire (qui arrête tous les partages de ses cartes) ou de son compte ; échu ou épuisé, il n’est plus utilisable ni affiché et il est effacé à la prochaine création d’un lien pour cette carte. Usage d’un lien : aussi longtemps que le lien, ou jusqu’à la suppression du compte (il reste si seul le profil est supprimé, pour qu’un lien déjà utilisé ne puisse pas resservir). Verrou d’édition : bail de deux minutes, renouvelé tant que l’éditeur est actif (le propriétaire d’une carte qui a des membres passe lui aussi par l’éditeur coopératif ; s’il la modifie encore depuis l’éditeur de son espace, cas limite, à chaque enregistrement qui la change) et libéré à la sortie de l’éditeur coopératif ; un verrou échu, sans effet, est effacé à la prochaine prise du verrou de cette carte ou par le même compte, et avec la carte ou le compte. Sauvegardes de la base chez Supabase : ${DATA_PROVIDER.backupRetention}.`,
  },
  {
    id: "collective",
    title: "Carte collective et modération",
    purpose:
      "Vous permettre d’ajouter des éléments signés de votre nom affiché et de votre identifiant public à la carte commune aux membres connectés, de les modifier et de les supprimer, de signaler l’élément d’un autre membre, et permettre aux modérateurs désignés par l’éditeur de traiter les signalements (masquer, rétablir ou supprimer un élément, classer les signalements, suspendre les contributions d’un auteur), d’en informer les personnes concernées et de garder trace de leurs décisions et du retrait par son auteur d’un élément masqué ou signalé.",
    legalBasis: `${CONTRACT} Pour la modération, le journal des décisions et les signalements : intérêt légitime de l’éditeur à faire respecter les règles de publication et à retirer les contenus illicites qui lui sont signalés — art. 6, paragraphe 1, point f) du RGPD ; pour les signalements de contenus illicites, la motivation des décisions et l’information des autorités, ${HOST_OBLIGATIONS}.`,
    data: [
      "éléments : identifiant de votre compte, sorte (balise, point, texte, zone, lien, flux), contenu (position ou tracé, titre, notes, date), état (visible ou masqué par la modération), dates d’ajout et de modification ;",
      "signalements : identifiant de l’élément, identifiant de votre compte, motif choisi dans une liste, précisions (500 caractères ; facultatives, sauf pour un contenu illicite : le signalement n’est alors accepté qu’avec une explication et votre déclaration de bonne foi, qui n’est pas enregistrée à part), état, copie du contenu signalé tant que le signalement est en attente (pour que les modérateurs voient ce qui a été signalé, même si l’auteur l’a modifié ou retiré depuis ; une seule copie par contenu, quel que soit le nombre de signalements), dates ;",
      "décisions de modération : élément (identifiant, sorte, titre au moment de la décision), identifiant du compte de l’auteur et de celui du modérateur (aucun pour un retrait par l’auteur), décision, motif (règle des conditions d’utilisation en cause, texte de loi en cause pour un contenu illicite, et faits retenus), nombre de signalements traités, fin de la suspension prononcée, auteur avisé ou non, date ;",
      "identifiants d’éléments déjà utilisés : identifiant de l’élément, identifiant du compte de l’auteur, indication « modéré » (un identifiant ne sert jamais deux fois à des comptes différents, ni après une modération) ;",
      "suspensions : identifiant de votre compte, fin de la suspension, décision qui l’a prononcée, date ;",
      "avis de modération : identifiant de votre compte, décision concernée, rôle (auteur de l’élément ou membre qui l’a signalé), dates de l’avis et de sa lecture ;",
      "modérateurs : identifiant du compte, date de désignation (liste tenue par l’éditeur).",
    ],
    provision:
      "Facultatif : rien n’est publié sans action de votre part. Il faut un profil pour ajouter ou modifier un élément (il est signé de votre nom affiché et de votre identifiant public) ; sans profil, ou pendant une suspension, vous pouvez encore supprimer vos éléments ; sans contribution, le service reste utilisable.",
    recipients: `Tous les membres connectés voient vos éléments visibles avec votre nom affiché et votre identifiant public, même si votre profil n’est visible que de vos contacts (le nom affiché pouvant être porté par d’autres, l’identifiant public, unique, empêche d’usurper votre signature ; jamais votre adresse e-mail ni l’identifiant de votre compte) ; un blocage entre deux comptes masque à chacun les éléments de l’autre, sauf dans la file et le journal de modération. Si vous supprimez votre profil, vos éléments ne sont plus montrés aux autres membres (jamais sans signature) ; ils reviennent, signés, si vous en créez un nouveau. Les modérateurs voient en plus, pour un élément signalé ou masqué (ou retiré par vous alors qu’il était signalé), votre identifiant public et votre nom affiché, les motifs et précisions des signalements (jamais qui les a faits) et le journal des décisions, jamais pour leurs propres éléments ; le journal leur montre aussi le nom affiché du modérateur de chaque décision. Les modérateurs sont des membres désignés par l’éditeur, qui agissent sous son autorité, pour la seule modération. Les membres qui ont signalé un élément reçoivent la décision prise, son motif (règle en cause et faits retenus, qui peuvent porter sur l’auteur) et le titre et la sorte de l’élément, sans la suspension éventuelle de l’auteur ni son identité ; si l’auteur supprime son compte avant la décision, ses éléments et les signalements qui les visent sont supprimés avec lui, sans décision ni avis. L’auteur d’un élément ne sait pas qui l’a signalé ; les avis ne nomment pas le modérateur. Comme tout contenu affiché, un élément visible peut être copié par les membres. ${AUTHORITIES} L’éditeur, pour l’administration technique et la modération ; ${DATA_PROVIDER.name}, sous-traitant (base de données) ; ${HOST_RECIPIENT}.`,
    location: `${SUPABASE_LOCATION} ${HOST_LOCATION} La carte collective ouverte dans l’éditeur n’est pas enregistrée dans votre navigateur.`,
    retention: `Élément : jusqu’à sa suppression par vous (un élément masqué reste listé, et supprimable, dans « Avis de modération », même après l’effacement de son avis) ou par un modérateur, ou la suppression de votre compte (si seul votre profil est supprimé, il reste, mais n’est plus montré qu’à vous). Signalement : jusqu’à la décision d’un modérateur, même si l’auteur retire l’élément entre-temps, ou jusqu’à la suppression de votre compte ou de celui de l’auteur ; traité, il est effacé un an après la décision (la copie du contenu signalé l’est dès la décision). Décision : un an ; l’identifiant de l’auteur ou du modérateur en est retiré à la suppression de son compte. Avis : 100 au plus par compte (les plus anciens sont effacés), supprimés avec la décision ou le compte. Désignation d’un modérateur : jusqu’à son retrait par l’éditeur ou la suppression du compte. Identifiant d’élément utilisé : sans limite de durée, avec seulement l’identifiant de votre compte et l’indication « modéré » (sans motif ni date), car c’est la seule façon d’empêcher qu’un identifiant serve à un autre compte ou qu’un élément masqué ou supprimé soit republié sous le même identifiant pour contourner la modération ; l’identifiant de votre compte en est retiré à sa suppression. Suspension : jusqu’à son échéance (30 jours) ; recalculée ou levée si l’élément en cause est rétabli, remplacée par une suspension plus longue ; échue, elle est sans effet et effacée ; supprimée avec le compte. Ces durées échues, l’effacement se fait au premier usage suivant de la carte collective par un membre (rafraîchissement de la carte ou décision de modération), sans tâche planifiée. Sauvegardes de la base chez Supabase : ${DATA_PROVIDER.backupRetention}.`,
  },
  {
    id: "moderation",
    title: MODERATION_TITLE,
    purpose:
      "Traiter les signalements, reçus par e-mail, qui visent un profil, une carte partagée ou le comportement d’un membre (par exemple des demandes de contact ou des invitations abusives) ; si un manquement aux conditions d’utilisation ou un contenu illicite est retenu, appliquer la mesure prévue (retrait d’un nom affiché, d’une présentation ou d’un avatar, suppression du profil, retrait d’un contenu d’une carte partagée, révocation de ses liens d’invitation, retrait d’un membre ou arrêt du partage, suspension ou suppression du compte) ; en informer le membre visé et la personne qui a signalé ; garder trace des décisions. La carte collective a sa propre modération (voir « Carte collective et modération »).",
    legalBasis: `Intérêt légitime de l’éditeur à faire respecter les conditions d’utilisation et à retirer les contenus illicites qui lui sont signalés — art. 6, paragraphe 1, point f) du RGPD ; pour les signalements de contenus illicites, la motivation des décisions et l’information des autorités, ${HOST_OBLIGATIONS}.`,
    data: [
      "contenu en cause, lu par l’éditeur dans la base (identifiant public, nom affiché, présentation ou avatar d’un profil ; nom, propriétaire, membres et contenu d’une carte partagée), identifiant et adresse e-mail du compte concerné ;",
      "décision : mesure prise, règle des conditions d’utilisation en cause (et texte de loi en cause pour un contenu illicite), faits retenus, origine (signalement ou initiative de l’éditeur), date et, pour une suspension du compte, sa fin (enregistrée par Supabase Auth avec le compte) ;",
      "exposé des motifs envoyé par e-mail au membre visé, décision envoyée à la personne qui a signalé, contestation éventuelle et son réexamen ;",
      "signalement à l’origine de la décision : voir « Demandes envoyées par e-mail ».",
    ],
    provision:
      "Ces données ne vous sont pas demandées : elles viennent des contenus que vous rendez visibles d’autres membres et des signalements qui les visent. Sans profil ni partage, aucun de vos contenus n’est concerné.",
    recipients: `L’éditeur ; le membre visé par la mesure (exposé des motifs envoyé à l’adresse e-mail de son compte au plus tard quand la mesure prend effet, sauf obligation légale contraire) ; la personne qui a signalé (décision prise et voies de recours ; son nom n’est pas communiqué au membre visé, sauf si c’est strictement nécessaire) ; ${
      CONTACT_PROVIDER
        ? `${CONTACT_PROVIDER.name}, fournisseur de la messagerie de contact`
        : "le fournisseur de la messagerie de contact (à préciser avant la mise en ligne)"
    } ; ${DATA_PROVIDER.name}, sous-traitant (base de données et authentification). ${AUTHORITIES}`,
    location: `Contenus en cause et suspension du compte : ${DATA_PROVIDER.region}. Trace des décisions et e-mails échangés : ${
      CONTACT_PROVIDER ? CONTACT_PROVIDER.location : "messagerie de contact (lieu à préciser avant la mise en ligne)"
    }.`,
    retention:
      "Trace de chaque décision (l’exposé des motifs envoyé, gardé dans la messagerie de contact) et e-mails échangés : un an après la décision ou la dernière réponse, comme le journal de la carte collective. Suspension du compte : jusqu’à son échéance ou sa levée. Un contenu retiré, un profil ou un compte supprimé l’est définitivement (sauvegardes de la base : voir « Cartes enregistrées dans un compte »).",
  },
  {
    id: "securite",
    title: "Sécurité et lutte contre les abus",
    purpose:
      "Limiter le nombre de tentatives (connexion, inscription, mot de passe oublié, nouveau mot de passe, liens reçus par e-mail, renouvellement de session, déconnexion, suppression du compte, téléchargement des données du compte, modifications du profil, consultations de profils, envoi et affichage des avatars, demandes de contact, réponses et blocages, partages de cartes, liens d’invitation, verrou d’édition, lectures de cartes partagées et de leur état, contributions, signalements, lectures et décisions de modération de la carte collective) et le nombre de téléchargements des données menés en même temps, pour empêcher les attaques par force brute, la recherche de profils en masse et la saturation du service.",
    legalBasis: LEGITIMATE_SECURITY,
    data: [
      "adresse IP (en IPv6, son préfixe /64) ;",
      "pour la connexion et le mot de passe oublié : adresse e-mail saisie, associée ou non à l’adresse IP ;",
      "pour la suppression du compte, le téléchargement des données et l’envoi d’un avatar : identifiant du compte connecté (pour le téléchargement, aussi pendant qu’il est en cours, avec l’adresse IP, pour en limiter le nombre simultané par adresse) ;",
      "pour les profils, les contacts, les partages et la carte collective : identifiant du compte connecté, avec le nombre de créations de profil, d’essais et de changements d’identifiant, de consultations de profils, d’envois de fichiers et de changements d’avatar, d’affichages d’avatars d’autres membres, de demandes de contact, de blocages, d’autres opérations sur les contacts, de partages de cartes, d’ouvertures de liens d’invitation, d’autres opérations de partage, de prises du verrou d’édition, de lectures de cartes partagées et de lectures de leur état (rafraîchissement périodique), d’ajouts, de modifications et de suppressions d’éléments de la carte collective, de signalements, de lectures de la carte collective et de son état, et de décisions de modération dans la fenêtre en cours (compteurs tenus dans la base de données, inclus dans « Télécharger mes données ») ;",
      "nombre de tentatives dans la fenêtre en cours.",
    ],
    provision: `${TECHNICAL_PROVISION} L’adresse e-mail est celle que vous saisissez pour vous connecter ou réinitialiser votre mot de passe.`,
    recipients: `${HOST.name}, hébergeur : les compteurs par adresse IP restent dans la mémoire du serveur de l’application, qu’il exécute ; ${DATA_PROVIDER.name}, sous-traitant, pour les compteurs des profils, des contacts, des partages et de la carte collective tenus dans la base. Ils ne sont transmis à personne d’autre.`,
    location: `Compteurs par adresse IP et compteurs de compte de l’application : mémoire vive du serveur de l’application (jamais écrite sur disque ni en base de données) : celle du proxy pour le compteur de renouvellement de session, celle des fonctions pour les autres compteurs. ${HOST_LOCATION} Compteurs des profils, des contacts, des partages et de la carte collective : base de données (${DATA_PROVIDER.region}), sans adresse IP.`,
    retention:
      "Le compteur repart à zéro à la fin de sa fenêtre (5 à 60 minutes selon l’action) ; une entrée échue peut rester en mémoire jusqu’à son remplacement ou l’arrêt de l’instance du serveur. Compteurs des profils, des contacts, des partages et de la carte collective dans la base : une ligne par compte et par action, remise à zéro au début de chaque nouvelle fenêtre (une heure ou un jour) et supprimée avec le compte. Un téléchargement en cours est oublié à sa fin, quand il échoue ou quand le fichier n’est plus lu (10 secondes sans première lecture, 2 minutes entre deux lectures), et au plus tard 15 minutes après son début : une minuterie efface alors son entrée de la mémoire. Les messages d’erreur journalisés par l’application ne contiennent que le type et le code de l’erreur, aucune donnée personnelle.",
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
    purpose:
      "Répondre à vos questions et à vos demandes d’exercice de droits ; traiter les signalements de contenus (profils, cartes partagées, carte collective) et les contestations de décisions de modération reçus par e-mail, et en informer les personnes concernées.",
    legalBasis:
      `Intérêt légitime à répondre aux messages reçus — art. 6, paragraphe 1, point f) ; obligation légale pour les demandes d’exercice de droits — art. 6, paragraphe 1, point c) du RGPD. Signalements et contestations : intérêt légitime de l’éditeur à faire respecter les règles du service et à retirer les contenus illicites (art. 6, paragraphe 1, point f), et ${HOST_OBLIGATIONS}.`,
    data: [
      "adresse e-mail de l’expéditeur et contenu du message ;",
      "pour un signalement : nom de son auteur s’il l’indique, contenu visé et son emplacement, raisons du signalement, et, le cas échéant, données de la personne visée par le contenu ;",
      "pour une contestation : décision contestée et arguments, et le réexamen qui en est fait.",
    ],
    provision:
      "Facultatif : écrire n’est jamais obligatoire pour utiliser le service. Pour être une notification complète au sens de l’article 16 du règlement sur les services numériques, un signalement par e-mail indique le nom de son auteur (sauf pour un contenu relevant des abus sexuels sur mineurs, de l’exploitation sexuelle d’enfants ou de la pédopornographie, articles 3 à 7 de la directive 2011/93/UE) ; sans nom, il est quand même examiné, et vous recevez l’accusé de réception puis la décision à l’adresse depuis laquelle vous avez écrit.",
    recipients: `${
      CONTACT_PROVIDER
        ? `L’éditeur ; ${CONTACT_PROVIDER.name}, fournisseur de la messagerie de contact.`
        : "L’éditeur ; le fournisseur de la messagerie de contact (à préciser avant la mise en ligne)."
    } Le nom de l’auteur d’un signalement n’est pas communiqué au membre visé, sauf si c’est strictement nécessaire (par exemple, s’il signale une atteinte à ses propres droits). ${AUTHORITIES}`,
    location: CONTACT_PROVIDER
      ? CONTACT_PROVIDER.location
      : "Selon le fournisseur de la messagerie de contact (à préciser avant la mise en ligne).",
    retention: CONTACT_RETENTION,
  },
];
