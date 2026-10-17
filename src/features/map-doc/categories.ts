// Catégories de la carte (format v2) : fonctions pures. Supprimer une catégorie retire ses
// références (fiches supplémentaires et styles) : le document reste cohérent et se relit toujours.
import { MAX_CATEGORIES, MAX_CATEGORY_LABEL_LENGTH } from "./limits";
import { FLUX_COLOR_IDS, isMapColor } from "./palette";
import { cut, uid } from "./primitives";
import type { Added } from "./primitives";
import { compactStyle } from "./schemaV2";
import type { Category, ExtraFiche, FluxColor, MapColor, MapDoc } from "./types";

/** Nom donné à une catégorie dont le nom saisi est vide. */
export const DEFAULT_CATEGORY_LABEL = "Catégorie sans nom";

/** Nom de catégorie : espaces retirés aux extrémités, coupé à la borne, jamais vide. */
function labelOf(label: string): string {
  return cut(label.trim(), MAX_CATEGORY_LABEL_LENGTH).trim() || DEFAULT_CATEGORY_LABEL;
}

export function findCategory(doc: MapDoc, id: string): Category | undefined {
  return doc.categories.find((c) => c.id === id);
}

/** Ajoute une catégorie ; null si la couleur est invalide, le plafond atteint ou l'identifiant pris. */
export function addCategory(doc: MapDoc, label: string, color: MapColor, id: string = uid()): Added | null {
  if (!isMapColor(color) || doc.categories.length >= MAX_CATEGORIES || findCategory(doc, id)) return null;
  const category: Category = { id, label: labelOf(label), color };
  return { doc: { ...doc, categories: [...doc.categories, category] }, id };
}

/** Renomme une catégorie ou change sa couleur (couleur invalide ignorée). */
export function updateCategory(doc: MapDoc, id: string, fields: { label?: string; color?: MapColor }): MapDoc {
  if (!findCategory(doc, id)) return doc;
  const categories = doc.categories.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c };
    if (fields.label !== undefined) next.label = labelOf(fields.label);
    if (fields.color !== undefined && isMapColor(fields.color)) next.color = fields.color;
    return next;
  });
  return { ...doc, categories };
}

/** Supprime une catégorie et ses références : les fiches et éléments concernés n'ont plus de catégorie. */
export function removeCategory(doc: MapDoc, id: string): MapDoc {
  if (!findCategory(doc, id)) return doc;
  const withoutCategory = (f: ExtraFiche): ExtraFiche => {
    if (f.category !== id) return f;
    const next = { ...f };
    delete next.category;
    return next;
  };
  const fiches: MapDoc["fiches"] = {};
  for (const [owner, list] of Object.entries(doc.fiches)) {
    if (list) fiches[owner as keyof MapDoc["fiches"]] = list.map(withoutCategory);
  }
  const styles: MapDoc["styles"] = {};
  for (const [ref, style] of Object.entries(doc.styles)) {
    if (!style) continue;
    const next = compactStyle(style.category === id ? { color: style.color } : style);
    if (next) styles[ref as keyof MapDoc["styles"]] = next;
  }
  return { ...doc, categories: doc.categories.filter((c) => c.id !== id), fiches, styles };
}

/** Nombre d'éléments (styles) et de fiches supplémentaires qui portent la catégorie `id`. */
export function categoryUsage(doc: MapDoc, id: string): number {
  let count = 0;
  for (const style of Object.values(doc.styles)) if (style?.category === id) count++;
  for (const list of Object.values(doc.fiches)) for (const fiche of list ?? []) if (fiche.category === id) count++;
  return count;
}

/** Couleur proposée pour une nouvelle catégorie : la première de la palette qu'aucune catégorie n'a encore. */
export function nextCategoryColor(doc: MapDoc): FluxColor {
  const used = new Set<string>(doc.categories.map((c) => c.color));
  return FLUX_COLOR_IDS.find((color) => !used.has(color)) ?? FLUX_COLOR_IDS[0];
}
