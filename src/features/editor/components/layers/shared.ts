// Éléments communs aux calques SVG de la carte.
import type { CSSProperties } from "react";
import type { GeoPath, GeoPermissibleObjects, GeoProjection } from "d3";

export type LayerProps = {
  projection: GeoProjection;
  path: GeoPath<unknown, GeoPermissibleObjects>;
};

/**
 * Calques des zones et des flux : leurs tracés, déjà densifiés et bornés (editor/shapeBudget.ts),
 * sont projetés SANS rééchantillonnage (projection.precision(0)), pour que leur coût reste borné.
 */
export type ShapeLayerProps = {
  shapePath: GeoPath<unknown, GeoPermissibleObjects>;
};

/**
 * Contre-échelle : l'élément garde sa taille à l'écran quel que soit le zoom. --k est mis à jour
 * sur le <svg> par le zoom, sans re-rendu React. L'élément ne doit pas porter d'attribut transform.
 */
export const COUNTER_SCALE: CSSProperties = { transform: "scale(calc(1 / var(--k, 1)))" };

