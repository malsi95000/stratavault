// Assistant de l'éditeur (EDI-10) : tutoriel court de chaque outil, de chaque vue, des filtres et
// des catégories, affiché par le bouton « ? » voisin. Les textes décrivent le comportement réel du
// code (mapClick.ts, store.ts, ops.ts, tools.ts, frise et filtres) : à mettre à jour avec lui.
import type { Tool } from "@/features/editor/hints";
import { TOOL_SHORTCUTS } from "@/features/editor/tools";
import type { EditorView } from "@/features/editor/viewStore";

/** Sujet d'un tutoriel : un outil, une vue, les filtres ou les catégories. */
export type HelpTopic = Tool | EditorView | "filtres" | "categories";

export type Tutorial = {
  /** Titre du tutoriel (nom de l'outil ou de la vue). */
  title: string;
  /** Une phrase : à quoi sert l'outil. */
  summary: string;
  /** Étapes, dans l'ordre (deux à quatre). */
  steps: readonly string[];
  /** Raccourci clavier, s'il y en a un. */
  shortcut?: string;
  /** Astuce ou précision utile. */
  tip?: string;
};

/** Touche du raccourci d'un outil, en majuscule (tools.ts). */
export function toolShortcut(tool: Tool): string | undefined {
  const key = Object.keys(TOOL_SHORTCUTS).find((k) => TOOL_SHORTCUTS[k] === tool);
  return key?.toUpperCase();
}

const TOOL_TUTORIALS: Record<Tool, Omit<Tutorial, "shortcut">> = {
  select: {
    title: "Sélection",
    summary: "Ouvre la fiche d’un élément de la carte pour la lire ou la compléter.",
    steps: [
      "Cliquez sur un pays, un lien, une balise, un point, une zone, un texte ou un trait de flux : sa fiche s’ouvre dans le panneau de droite.",
      "Complétez-la (titre, date, notes selon l’élément) : tout est enregistré automatiquement.",
      "« Nouvelle fiche » ajoute des fiches supplémentaires à l’élément ; pour un pays ou un lien, « Sur la carte » règle sa couleur et sa catégorie.",
      "Molette : zoomer sous le pointeur. Glisser : déplacer la carte (en vue globe, la faire tourner).",
    ],
    tip: "Échap ferme la fiche. Le bouton plein écran de son en-tête l’agrandit à tout l’écran ; Échap y revient.",
  },
  link: {
    title: "Tracer un lien",
    summary: "Relie deux éléments de la carte par un trait (un arc aérien en vue globe).",
    steps: [
      "Cliquez sur une première extrémité : un pays, une balise, un point, une zone ou un texte. Elle est mise en évidence.",
      "Cliquez sur la seconde : le lien est tracé et sa fiche s’ouvre.",
      "Donnez-lui un titre et des notes ; « Sur la carte » règle sa couleur et sa catégorie.",
    ],
    tip: "Échap, un clic dans le vide ou un second clic sur la même extrémité annule. Deux éléments ne sont reliés qu’une fois : relier de nouveau la même paire ouvre le lien existant.",
  },
  ping: {
    title: "Poser une balise",
    summary:
      "Marque un lieu par une balise typée : maritime, entreprise, groupe armé, point stratégique, crise ou base militaire.",
    steps: [
      "Survolez l’outil (ou cliquez dessus) pour afficher les six types de balise, puis choisissez-en un.",
      "Cliquez n’importe où sur la carte, mer comprise : la balise est posée et sa fiche s’ouvre.",
      "Nommez-la et complétez sa fiche ; son type peut encore y être changé.",
    ],
    tip: "Un clic sur un élément existant (autre qu’un pays) ouvre sa fiche au lieu de poser une balise.",
  },
  flux: {
    title: "Pinceau flux",
    summary: "Dessine à main levée un flux (route, échange, mouvement) dans la couleur et l’épaisseur choisies.",
    steps: [
      "Choisissez l’outil : son menu s’ouvre. Prenez l’une des 22 couleurs et réglez l’épaisseur.",
      "Appuyez sur la carte et glissez pour tracer ; relâchez pour terminer le trait.",
      "Avec l’outil Sélection, un clic sur un trait ouvre la fiche de sa couleur.",
    ],
    tip: "Tous les traits d’une même couleur partagent une seule fiche : une couleur par flux à décrire. La gomme efface un trait à la fois.",
  },
  lasso: {
    title: "Lasso de zone",
    summary: "Délimite une zone (région, front, espace maritime) par un contour tracé à main levée.",
    steps: [
      "Appuyez sur la carte et glissez pour dessiner le contour.",
      "Relâchez : le contour se referme tout seul, la zone est créée et sa fiche s’ouvre.",
      "Nommez la zone et complétez sa fiche.",
    ],
    tip: "Un contour trop petit est refusé : dessinez une forme plus grande. Une zone peut servir d’extrémité à un lien.",
  },
  texte: {
    title: "Ajouter un texte",
    summary: "Pose un petit titre directement sur la carte.",
    steps: [
      "Réglez la taille du texte dans le menu de l’outil.",
      "Cliquez à l’endroit voulu, sur un pays ou en mer : le texte est posé et sa fiche s’ouvre.",
      "Écrivez son titre dans la fiche : c’est lui qui s’affiche sur la carte.",
    ],
    tip: "Un clic sur un élément existant (autre qu’un pays) ouvre sa fiche au lieu de poser un texte.",
  },
  gomme: {
    title: "Gomme",
    summary: "Supprime un élément de la carte d’un simple clic.",
    steps: [
      "Cliquez sur un lien, une balise, un point, une zone, un texte ou un trait de flux : il est supprimé aussitôt.",
      "Les liens rattachés à l’élément supprimé disparaissent avec lui.",
      "Si des fiches supplémentaires devaient être perdues, une confirmation est demandée d’abord.",
    ],
    tip: "Les pays ne s’effacent pas : videz plutôt leur fiche. Aucune suppression ne peut être annulée : exportez la carte avant un grand ménage.",
  },
  point: {
    title: "Placer un point",
    summary: "Place un point discret pour une ville ou un lieu précis.",
    steps: [
      "Cliquez sur la carte à l’endroit voulu : le point est placé et sa fiche s’ouvre.",
      "Donnez-lui un nom, une date et des notes.",
    ],
    tip: "Un point peut servir d’extrémité à un lien (outil « Tracer un lien »).",
  },
};

const OTHER_TUTORIALS: Record<Exclude<HelpTopic, Tool>, Tutorial> = {
  planisphere: {
    title: "Planisphère",
    summary: "Le monde à plat, en projection Winkel tripel.",
    steps: [
      "Molette : zoomer sous le pointeur.",
      "Glisser : déplacer la carte (avec le lasso et le pinceau, le glisser dessine).",
      "Planisphère, Globe et Frise changent de vue ; le choix est mémorisé dans ce navigateur.",
    ],
    tip: "Passer au globe le centre sur le point qui était au milieu de l’écran.",
  },
  globe: {
    title: "Globe",
    summary: "La Terre en relief, que l’on fait tourner.",
    steps: [
      "Glisser : faire tourner le globe (avec le lasso et le pinceau, le glisser dessine).",
      "Molette : zoomer sous le pointeur.",
      "Les liens deviennent des arcs aériens avec leur ombre au sol ; ce qui est sur la face cachée n’est pas affiché.",
    ],
    tip: "Entre planisphère et globe, le zoom revient à l’échelle de départ. Tous les outils fonctionnent aussi sur le globe.",
  },
  frise: {
    title: "Frise chronologique",
    summary: "Range toutes les fiches datées de la carte entre 1800 et 2100.",
    steps: [
      "Renseignez la date d’une fiche (pays, lien, balise, point, zone, texte, flux ou fiche supplémentaire) : elle apparaît sur la frise, à sa couleur.",
      "Molette : zoomer autour du pointeur. Glisser ou Maj + molette : se déplacer dans le temps.",
      "Cliquez sur une fiche pour l’ouvrir. Un repère numéroté regroupe des fiches proches : cliquez-le pour afficher leur liste.",
    ],
    shortcut: "← et → pour se déplacer, + et − pour zoomer (la frise doit avoir le focus).",
    tip: "« Ajuster » recadre sur les fiches affichées. Les fiches sans date, ou datées hors de 1800–2100, sont listées sous la frise.",
  },
  filtres: {
    title: "Filtres",
    summary: "N’affiche que les fiches qui vous intéressent, sur la carte comme sur la frise.",
    steps: [
      "Choisissez une période (Du / Au, bornes incluses), des couleurs, des catégories ou des types d’éléments.",
      "Chaque choix s’applique aussitôt ; le nombre de fiches retenues s’affiche en tête du panneau.",
      "Dans un même critère, une valeur cochée suffit ; tous les critères renseignés doivent être remplis.",
    ],
    tip: "Un élément reste affiché si l’une de ses fiches correspond ; un pays écarté est atténué mais reste cliquable. Le filtre n’est pas enregistré avec la carte.",
  },
  categories: {
    title: "Catégories",
    summary: "Classe pays, liens et fiches dans des catégories colorées, propres à cette carte.",
    steps: [
      "Ajoutez une catégorie : un nom et une couleur.",
      "Choisissez-la dans « Sur la carte » (fiche d’un pays ou d’un lien) ou dans une fiche supplémentaire.",
      "Un élément sans couleur propre prend la couleur de sa catégorie.",
    ],
    tip: "Supprimer une catégorie la retire des éléments et des fiches qui la portent ; la confirmation indique combien.",
  },
};

const isTool = (topic: HelpTopic): topic is Tool => Object.hasOwn(TOOL_TUTORIALS, topic);

/** Tutoriel d'un sujet ; pour un outil, le raccourci vient de tools.ts. */
export function tutorialFor(topic: HelpTopic): Tutorial {
  if (!isTool(topic)) return OTHER_TUTORIALS[topic];
  const shortcut = toolShortcut(topic);
  return shortcut ? { ...TOOL_TUTORIALS[topic], shortcut } : TOOL_TUTORIALS[topic];
}

/** Tous les sujets qui ont un tutoriel. */
export const HELP_TOPICS: readonly HelpTopic[] = [
  ...(Object.keys(TOOL_TUTORIALS) as Tool[]),
  ...(Object.keys(OTHER_TUTORIALS) as Exclude<HelpTopic, Tool>[]),
];
