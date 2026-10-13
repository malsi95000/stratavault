// Textes de la barre d'aide (bêta, HINTS).
import { PING_LABELS } from "@/features/map-doc/types";
import type { PingType } from "@/features/map-doc/types";

export type Tool = "select" | "link" | "ping" | "point" | "lasso" | "texte" | "gomme" | "flux";

export const HINTS: Record<Tool, string> = {
  select:
    "Cliquez sur un pays, un lien, une zone, une balise, un point ou un texte pour ouvrir sa fiche. Molette : zoom, glisser : déplacer.",
  link: "Cliquez sur un premier élément (pays, balise, zone ou texte), puis sur un second pour tracer le lien. Échap pour annuler.",
  point: "Cliquez sur la carte pour placer un point discret (ville ou lieu), puis renseignez sa fiche.",
  ping: "Survolez l’outil pour choisir un type de balise, puis cliquez n’importe où sur la carte, mer comprise.",
  lasso: "Glissez pour dessiner un contour fermé délimitant une zone. Relâchez pour la refermer.",
  texte: "Cliquez sur un espace libre de la carte pour poser un petit titre, puis nommez-le dans la fiche.",
  flux: "Dessinez un flux libre sur la carte. Choisissez sa couleur et son épaisseur dans le panneau.",
  gomme: "Cliquez sur un trait, une balise, une zone ou un texte pour le supprimer aussitôt. Les pays ne sont pas concernés.",
};

/** Outil Sélection en vue globe : le glisser fait tourner le globe au lieu de déplacer la vue. */
export const HINT_SELECT_GLOBE =
  "Cliquez sur un pays, un lien, une zone, une balise, un point ou un texte pour ouvrir sa fiche. Molette : zoom, glisser : faire tourner le globe.";

/** Texte d'aide d'un outil selon la vue de la carte. */
export function toolHint(tool: Tool, globe: boolean): string {
  return globe && tool === "select" ? HINT_SELECT_GLOBE : HINTS[tool];
}

export const HINT_OUTSIDE = "Cliquez à l’intérieur de la carte.";
export const HINT_LASSO_TOO_SHORT = "Contour trop court : dessinez une forme fermée plus grande.";
export const HINT_NO_COUNTRY_ERASE = "Les pays ne peuvent pas être supprimés avec la gomme.";
/** Limite du schéma (MAX_ITEMS) atteinte : l'élément n'est pas ajouté, pour que la carte reste lisible. */
export const HINT_FULL = "Nombre maximal d’éléments de ce type atteint : supprimez-en avant d’en ajouter.";
/** Plafond des sommets de zones et de flux de la carte (MAX_TOTAL_PATH_POINTS) atteint. */
export const HINT_PATHS_FULL =
  "Nombre maximal de points de tracé atteint : supprimez des zones ou des flux avant d’en ajouter.";
export const HINT_FLUX_ERASED = "Flux supprimé.";
export const HINT_ERASED = `Élément supprimé. ${HINTS.gomme}`;

export const hintLinkPending = (name: string) =>
  `${name} sélectionné. Choisissez la seconde extrémité (pays, balise, zone ou texte).`;

/** Choix d'un type dans le menu des balises. */
export const hintPingType = (type: PingType) => `${PING_LABELS[type]} : cliquez sur la carte pour la poser.`;
