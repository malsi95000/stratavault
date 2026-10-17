// Textes de l'état des filtres, affiché au-dessus de la carte et de la frise tant qu'un filtre est actif.
import { FLUX_LABELS, isFluxColor } from "@/features/map-doc/palette";
import type { Category, MapColor } from "@/features/map-doc/types";
import { ENTRY_KIND_LABELS } from "@/features/timeline/entries";
import { periodOf } from "./filter";
import type { Filter } from "./filter";

/** Nom d'une couleur de filtre : celui de la palette, le code hexadécimal, ou « Sans couleur ». */
export function colorLabel(color: MapColor | null): string {
  if (color === null) return "Sans couleur";
  return isFluxColor(color) ? FLUX_LABELS[color] : color;
}

/** Nom d'une catégorie de filtre, ou « Sans catégorie ». */
export function categoryLabel(id: string | null, categories: readonly Category[]): string {
  if (id === null) return "Sans catégorie";
  return categories.find((c) => c.id === id)?.label ?? "Catégorie supprimée";
}

/** Période écrite : « 1914 – 1918 », « depuis 1914 », « jusqu'à 1918 » ; vide sans borne lisible. */
export function periodLabel(filter: Pick<Filter, "from" | "to">): string {
  const { start, end } = periodOf(filter);
  const from = start === null ? "" : filter.from.trim();
  const to = end === null ? "" : filter.to.trim();
  if (from && to) return `${from} – ${to}`;
  if (from) return `depuis ${from}`;
  if (to) return `jusqu’à ${to}`;
  return "";
}

/** Une ligne par critère renseigné : « Période : 1914 – 1918 », « Couleurs : Rouge, Bleu »… */
export function filterSummary(filter: Filter, categories: readonly Category[]): string[] {
  const parts: string[] = [];
  const period = periodLabel(filter);
  if (period) parts.push(`Période : ${period}`);
  if (filter.colors.length > 0) parts.push(`Couleurs : ${filter.colors.map(colorLabel).join(", ")}`);
  if (filter.categories.length > 0) {
    parts.push(`Catégories : ${filter.categories.map((id) => categoryLabel(id, categories)).join(", ")}`);
  }
  if (filter.kinds.length > 0) parts.push(`Types : ${filter.kinds.map((k) => ENTRY_KIND_LABELS[k]).join(", ")}`);
  return parts;
}

/** Bilan du filtre : « 12 fiches sur 40 », « Aucune fiche ne correspond ». */
export function matchCountLabel(matching: number, total: number): string {
  if (total === 0) return "Aucune fiche sur cette carte";
  if (matching === 0) return "Aucune fiche ne correspond";
  return `${matching} ${matching > 1 ? "fiches" : "fiche"} sur ${total}`;
}
