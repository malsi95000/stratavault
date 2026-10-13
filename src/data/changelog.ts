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
    version: APP_VERSION,
    date: "3 octobre 2026",
    paragraphs: [
      "Passage d’un fichier unique à une application Next.js. Tous les pays et territoires de la carte deviennent cliquables : Taïwan, le Kosovo, le Sahara occidental, le Groenland, les territoires dépendants et l’Antarctique, ainsi que Tuvalu, l’Abkhazie, l’Ossétie du Sud et la Transnistrie par leur capitale, chacun avec son statut. Les cartes sont enregistrées une par une dans la base de données du navigateur (IndexedDB), sans limite de 5 Mo, et peuvent être rattachées à un compte sécurisé (Supabase : mots de passe hachés avec bcrypt, sessions en cookies httpOnly, données accessibles à leur seul propriétaire).",
      "Nouvelle vue Globe, au choix avec le planisphère : le globe tourne au glisser, les liens deviennent des arcs aériens et les flux sont lissés en relief, avec leur ombre au sol.",
      "Corrections : fichiers importés strictement validés et protégés contre l’injection de code, structure de cette page réparée, numéro de version unique, coordonnées enregistrées partout dans l’ordre longitude, latitude, bannière introuvable et script dupliqué retirés, musique lancée uniquement par son bouton.",
    ],
    contribution:
      "Contribution de Claude : portage complet vers Next.js, React et TypeScript, extension du jeu de données aux territoires, nouvelle sauvegarde des cartes, vue Globe, sécurisation des comptes et correction des défauts relevés dans la version précédente.",
  },
];
