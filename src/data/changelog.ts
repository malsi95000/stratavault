// Historique des mises à jour (bêta, lignes 239-268), de la plus ancienne à la plus récente.
import { APP_VERSION } from "@/lib/version";

export type Release = {
  version: string;
  date: string;
  /** Un ou plusieurs paragraphes de description. */
  paragraphs: string[];
  /** Contribution de Claude, affichée en retrait à la fin du dernier paragraphe. */
  contribution?: string;
};

export const CHANGELOG: readonly Release[] = [
  {
    version: "Bêta 1.0",
    date: "29 septembre 2026",
    paragraphs: [
      "Cadrage du projet et première brique : page d’accueil avec le nom du site et le bouton central « Créer une carte stratégique », premier fond de carte sombre en projection Winkel Tripel.",
    ],
    contribution:
      "Contribution de Claude : validation de la faisabilité technique (données des 195 pays, capitales, projection cartographique) puis mise en place de l’architecture de la page d’accueil.",
  },
  {
    version: "Bêta 1.1",
    date: "29 septembre 2026",
    paragraphs: [
      "Carte interactive complète : 195 pays cliquables avec leur capitale, fiches pays éditables, outil de lien entre pays avec fiche relationnelle, outil balise, sauvegarde automatique dans le navigateur, export et import de carte.",
    ],
    contribution:
      "Contribution de Claude : construction du jeu de données géographiques vérifié pays par pays, et développement des trois premiers outils d’édition.",
  },
  {
    version: "Bêta 1.2",
    date: "29 septembre 2026",
    paragraphs: [
      "Renommage du projet en Stratavault avec logo dédié, page d’accueil déroulante à onglets (À propos, Projection, Limites), pied de page, quatre catégories de balises accessibles par un tiroir d’outils, outil lasso pour délimiter des zones, outil « + » réservé pour une future fonctionnalité, et thème musical sur la page d’accueil.",
    ],
    contribution:
      "Contribution de Claude : refonte graphique complète, extension du modèle de données aux zones et aux catégories de balises, et intégration d’un lecteur musical généré à partir du fichier fourni.",
  },
  {
    version: "Bêta 1.3",
    date: "29 septembre 2026",
    paragraphs: [
      "Ajout des onglets Historique des mises à jour et Communauté, généralisation de l’outil de lien pour pouvoir relier des balises et des zones (et plus seulement des pays), et ajout d’un champ date dans chaque fiche technique.",
    ],
    contribution:
      "Contribution de Claude : généralisation du système de liens à toutes les entités de la carte, rédaction de cette page d’historique et ajout de la datation des fiches.",
  },
  {
    version: "Bêta 1.4",
    date: "29 septembre 2026",
    paragraphs: [
      "Ajout de la banque de cartes (créer, enregistrer et reprendre plusieurs cartes distinctes), de l’outil Gomme pour supprimer traits, balises, zones et textes, de l’outil Texte pour poser de petits titres directement sur la carte, et intégration de la vidéo de présentation sur la page d’accueil.",
    ],
    contribution:
      "Contribution de Claude : mise en place du système de sauvegarde multi-cartes, généralisation des liens et de la gomme au nouvel outil de texte, et intégration de la vidéo fournie.",
  },
  {
    version: "Bêta 1.6",
    date: "30 septembre 2026",
    paragraphs: [
      "Ajout de deux nouvelles balises (Ping crise et Ping base militaire), d’un contrôle de taille pour l’outil Texte, et ancrage des textes et des flux à la carte : leur taille suit désormais le zoom.",
    ],
    contribution:
      "Contribution de Claude : extension des catégories de balises, réglage typographique persistant et correction du rendu cartographique des textes et des flux.",
  },
  {
    version: "Bêta 1.7",
    date: "30 septembre 2026",
    paragraphs: [
      "Suppression de l’onglet Communauté, renommage de l’onglet, nouvelle page de connexion (esthétique) comme passerelle vers l’espace stratégique, refonte du logo du ping crise en silhouette 2D.",
      "Ajout de l’outil Pinceau flux pour dessiner des flux à main levée, avec sous-menu de couleur parmi 10 couleurs, curseur d’épaisseur, transparence légère des traits et fiche technique unique par couleur de flux ; recalibrage des épaisseurs ×5 (le niveau 1 correspond à l’ancien niveau 5). Ajout de l’outil Point, discret comme les balises, pour placer des villes. Mise à jour de la bannière de la page d’accueil (logo retiré, titre recentré), correction de la mise à jour du titre des lignes de flux dans le gros titre de leur fiche et de l’épaisseur des flux selon le zoom de la carte. Suppression de l’avertissement intempestif « vous n’avez pas enregistré » à la navigation grâce à la sauvegarde automatique.",
    ],
    contribution:
      "Contribution de Claude : ajout des outils Pinceau flux et Point, recalibrage du rendu des flux et amélioration de la navigation avec sauvegarde automatique.",
  },
  {
    version: "Bêta 2.0",
    date: "3 octobre 2026",
    paragraphs: [
      "Passage d’un fichier unique à une application Next.js. Tous les pays et territoires de la carte deviennent cliquables : Taïwan, le Kosovo, le Sahara occidental, le Groenland, les territoires dépendants et l’Antarctique, ainsi que Tuvalu, l’Abkhazie, l’Ossétie du Sud et la Transnistrie par leur capitale, chacun avec son statut. Les cartes sont enregistrées une par une dans la base de données du navigateur (IndexedDB), sans limite de 5 Mo, et peuvent être rattachées à un compte sécurisé (Supabase : mots de passe hachés avec bcrypt, sessions en cookies httpOnly, données accessibles à leur seul propriétaire).",
      "Nouvelle vue Globe, au choix avec le planisphère : le globe tourne au glisser, les liens deviennent des arcs aériens et les flux sont lissés en relief, avec leur ombre au sol.",
      "Corrections : fichiers importés strictement validés et protégés contre l’injection de code, structure de cette page réparée, numéro de version unique, coordonnées enregistrées partout dans l’ordre longitude, latitude, bannière introuvable et script dupliqué retirés, musique lancée uniquement par son bouton.",
    ],
    contribution:
      "Contribution de Claude : portage complet vers Next.js, React et TypeScript, extension du jeu de données aux territoires, nouvelle sauvegarde des cartes, vue Globe, sécurisation des comptes et correction des défauts relevés dans la version précédente.",
  },
  {
    version: APP_VERSION,
    date: "30 octobre 2026",
    paragraphs: [
      "Fiches enrichies : chaque pays, lien, balise, point, zone ou texte peut recevoir plusieurs fiches (titre, date, notes), à ouvrir en plein écran au besoin ; la fiche d’un pays montre sa silhouette en mini-carte. Pays et liens prennent une couleur et une catégorie, définies par la carte (créer, renommer, recolorer, supprimer), et le pinceau flux passe à 22 couleurs nommées.",
      "Nouvelle vue Frise, à côté du planisphère et du globe : toutes les fiches datées s’y rangent de 1800 à 2100, avec zoom et ouverture de la fiche d’un clic. Un panneau de filtres (période, couleur, catégorie, type) s’applique à la carte comme à la frise, et un bouton « ? » sur chaque outil en donne un court tutoriel.",
      "Banque de cartes : chaque carte peut recevoir un logo (icône et couleur) ou un aperçu miniature calculé à partir de son contenu. Accueil avec un menu fixe et des animations discrètes, coupées si l’appareil demande de réduire les animations ; fonds topographiques propres à chaque page annexe. Le nouveau format de carte reste compatible : les anciens fichiers s’importent toujours.",
      "Profils, en mode compte seulement : la page « Mon profil » crée sur demande un identifiant public unique, un nom affiché, une courte présentation et un avatar facultatif (image recadrée et réenregistrée par le serveur, sans ses métadonnées), visibles par tous les membres connectés ou par vos seuls contacts (et les membres à qui vous envoyez une demande). On ne trouve un membre que par son identifiant exact : ni annuaire, ni recherche par adresse e-mail. Le profil et l’avatar figurent dans « Télécharger mes données » et sont supprimés avec le compte.",
      "Contacts, en mode compte seulement : nouvelle page « Contacts », accessible depuis l’espace, pour envoyer une demande à un membre par son identifiant exact, l’annuler, accepter ou refuser les demandes reçues, retirer un contact et bloquer un membre (vous ne voyez plus vos profils l’un l’autre et il ne peut plus vous envoyer de demande, sans en être averti). Le nombre de demandes est limité par la base ; contacts, demandes et blocages figurent dans « Télécharger mes données ».",
      "Partage et coopération, en mode compte seulement : chaque carte de la banque a ses boutons « Partager », « Inviter » et « Coopérer ». Le propriétaire invite un contact ou crée un lien d’invitation (expirant, révocable, au nombre d’usages limité), avec le rôle d’éditeur ou de lecteur, change les rôles et retire des membres ; chaque membre peut quitter la carte. La section « Partagées avec moi » de l’espace réunit les cartes des autres et les invitations reçues. Une carte se modifie à plusieurs, une personne à la fois : celle qui la modifie la verrouille, les autres la voient en lecture seule avec « X modifie cette carte », rafraîchie automatiquement. Les partages figurent dans « Télécharger mes données ».",
      "Carte collective, en mode compte seulement : une carte commune aux membres connectés, ouverte depuis l’espace ou l’encart de l’accueil (connexion d’abord, qui ramène ensuite à la carte). Chacun y ajoute balises, points, textes, zones, liens et flux, signés de son nom affiché et de son identifiant public, et ne modifie ou ne supprime que les siens ; un avertissement rappelle à l’entrée que ces contenus ne sont pas vérifiés et quelles sont les règles de publication. Tout membre peut signaler un élément ; des modérateurs désignés le masquent, le rétablissent ou le suppriment avec un motif, dont l’auteur est informé dans l’application (et dans son espace), peuvent suspendre 30 jours ses contributions, et chaque décision est inscrite au journal, comme le retrait par son auteur d’un élément masqué ou signalé. Le nombre d’ajouts, de signalements et la taille des éléments sont limités par la base ; contributions, signalements et avis figurent dans « Télécharger mes données ». L’auteur d’un élément se bloque depuis sa fiche (« Bloquer l’auteur »), même si son profil n’est visible que de ses contacts ; la carte ne se relit plus en entier après vos propres ajouts.",
      "Textes légaux mis à jour : les conditions d’utilisation encadrent les profils, les contacts, les cartes partagées et la carte collective (contenus visibles des autres membres, règles de publication, motifs de retrait, signalement, décisions prises par des personnes, information de l’auteur, suspension, recours) ; la politique de confidentialité décrit chaque nouveau traitement (finalité, base légale, destinataires, durées, droits) ; les mentions légales donnent le point de contact (en français ou en anglais) et la façon de signaler un contenu illicite, et la page Cookies précise le cache des avatars. Un signalement pour contenu illicite demande désormais une explication et une déclaration de bonne foi ; chaque décision de modération cite la règle en cause (et, pour un contenu illicite, le texte de loi en cause), et l’avis à l’auteur dit si elle suit des signalements, qu’elle a été prise par une personne et comment la contester ; les liens « Signaler ce profil » et « Signaler cette carte » préparent un signalement par e-mail ; le journal et les signalements traités sont effacés au bout d’un an sans attendre une nouvelle décision ; « Télécharger mes données » contient aussi la suspension éventuelle, la désignation comme modérateur, les identifiants des éléments publiés et les décisions de modération qui les visent ; la fenêtre « Avis de modération » liste ses éléments masqués, que l’on peut toujours supprimer, même après l’effacement de leur avis.",
    ],
    contribution:
      "Contribution de Claude : format de carte v2 et contrôles de la base de données, fiches, couleurs et catégories, frise et filtres, tutoriels, logos et aperçus de la banque, menu et animations de l’accueil, fonds des pages annexes, profils et avatars (base, stockage privé, limites anti-abus), contacts et blocages, partage des cartes et verrou d’édition, carte collective et modération, mise à jour des textes légaux.",
  },
];
