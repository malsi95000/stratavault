// Plafonds d'une carte, partagés par la validation (schema.ts) et les opérations de l'éditeur
// (ops.ts) : un document produit par l'éditeur se relit toujours.
import { MAX_ITEMS, MAX_TOTAL_ITEMS, MAX_TOTAL_PATH_POINTS } from "./types";
import type { MapDoc } from "./types";

/** Traits de flux, toutes couleurs confondues. */
export function fluxCount(doc: MapDoc): number {
  return Object.values(doc.flux).reduce((n, strokes) => n + strokes.length, 0);
}

/** Éléments de toutes les collections (liens, balises, points, zones, textes, traits de flux). */
export function itemCount(doc: MapDoc): number {
  return doc.links.length + doc.pings.length + doc.points.length + doc.zones.length + doc.texts.length + fluxCount(doc);
}

/** Sommets de tous les tracés : anneaux des zones et traits de flux. */
export function pathPointCount(doc: MapDoc): number {
  let count = 0;
  for (const zone of doc.zones) count += zone.ring.length;
  for (const strokes of Object.values(doc.flux)) for (const stroke of strokes) count += stroke.points.length;
  return count;
}

/** Vrai si un élément de plus dans `items` (une collection de `doc`) dépasserait un plafond. */
export const isFull = (doc: MapDoc, items: readonly unknown[]) =>
  items.length >= MAX_ITEMS || itemCount(doc) >= MAX_TOTAL_ITEMS;

/** Vrai si un trait de flux de plus dépasserait un plafond (MAX_ITEMS vaut toutes couleurs confondues). */
export const isFluxFull = (doc: MapDoc) => fluxCount(doc) >= MAX_ITEMS || itemCount(doc) >= MAX_TOTAL_ITEMS;

/** Vrai si `added` sommets de plus (nouvelle zone, nouveau trait) dépasseraient MAX_TOTAL_PATH_POINTS. */
export const lacksPathRoom = (doc: MapDoc, added: number) => pathPointCount(doc) + added > MAX_TOTAL_PATH_POINTS;
