// Choix proposés par le panneau des filtres : les couleurs réellement portées par les fiches de la
// carte (une palette de 22 couleurs plus les couleurs libres serait illisible), toutes les catégories.
import { FLUX_COLOR_IDS } from "@/features/map-doc/palette";
import type { Category, MapColor } from "@/features/map-doc/types";
import type { Entry } from "@/features/timeline/entries";
import type { Filter } from "./filter";

export type Option<T> = { value: T; count: number };

/**
 * Couleurs des fiches, dans l'ordre de la palette puis des codes hexadécimaux, et « Sans couleur » en
 * dernier. Une couleur cochée qui n'est plus portée par aucune fiche reste proposée (pour la décocher).
 */
export function colorOptions(entries: readonly Entry[], filter: Filter): Option<MapColor | null>[] {
  const counts = new Map<MapColor | null, number>();
  for (const e of entries) counts.set(e.color, (counts.get(e.color) ?? 0) + 1);
  for (const c of filter.colors) if (!counts.has(c)) counts.set(c, 0);
  const rank = (c: MapColor | null) => {
    if (c === null) return Infinity;
    const i = (FLUX_COLOR_IDS as readonly string[]).indexOf(c);
    return i < 0 ? FLUX_COLOR_IDS.length : i;
  };
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => rank(a.value) - rank(b.value) || String(a.value).localeCompare(String(b.value)));
}

/** Catégories de la carte (dans son ordre), puis « Sans catégorie ». */
export function categoryOptions(entries: readonly Entry[], categories: readonly Category[]): Option<string | null>[] {
  const counts = new Map<string | null, number>();
  for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  return [...categories.map((c) => c.id), null].map((value) => ({ value, count: counts.get(value) ?? 0 }));
}
