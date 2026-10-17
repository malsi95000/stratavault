// Textes de la fenêtre des catégories.
import { categoryUsage } from "@/features/map-doc/categories";
import type { Category, MapDoc } from "@/features/map-doc/types";

export const CATEGORIES_TITLE = "Catégories de la carte";
export const CATEGORIES_DESCRIPTION =
  "Une catégorie donne un nom et une couleur communs à des pays, des liens ou des fiches. La couleur propre d’un élément l’emporte sur celle de sa catégorie.";

/** Confirmation avant de supprimer une catégorie : les éléments et fiches qui la portent n'en ont plus. */
export function deleteCategoryConfirm(label: string, usage: number): string {
  const question = `Supprimer la catégorie «\u00a0${label}\u00a0» ?`;
  if (usage === 0) return question;
  if (usage === 1) return `${question} L’élément ou la fiche qui la porte n’aura plus de catégorie.`;
  return `${question} Les ${usage} éléments ou fiches qui la portent n’auront plus de catégorie.`;
}

/** Confirmation avant de supprimer une catégorie de la carte, avec le nombre d'éléments et fiches qui la portent. */
export function removeCategoryConfirm(doc: MapDoc, category: Category): string {
  return deleteCategoryConfirm(category.label, categoryUsage(doc, category.id));
}
