// État de l'éditeur, partie « filtres » (EDI-08) : le filtre courant, appliqué à la carte et à la frise,
// et l'ouverture de son panneau. Combiné à store.ts. Le filtre n'est pas enregistré avec la carte : il
// repart à vide à chaque ouverture d'une carte.
import { EMPTY_FILTER } from "@/features/filters/filter";
import type { Filter } from "@/features/filters/filter";
import { visibilitySelector } from "@/features/filters/visibility";
import type { Visibility } from "@/features/filters/visibility";
import type { MapDoc } from "@/features/map-doc/types";

export type FiltersSlice = {
  filter: Filter;
  /** Panneau des filtres ouvert. */
  filtersOpen: boolean;
  /** Change un ou plusieurs critères (les autres sont gardés). */
  setFilter: (patch: Partial<Filter>) => void;
  /** Vide tous les critères : tout redevient visible. */
  resetFilter: () => void;
  setFiltersOpen: (open: boolean) => void;
};

type Host = FiltersSlice & { doc: MapDoc };

export function filtersSlice(patch: (partial: Partial<Host>) => void, get: () => Host): FiltersSlice {
  return {
    filter: EMPTY_FILTER,
    filtersOpen: false,
    setFilter: (fields) => patch({ filter: { ...get().filter, ...fields } }),
    resetFilter: () => patch({ filter: EMPTY_FILTER }),
    setFiltersOpen: (filtersOpen) => patch({ filtersOpen }),
  };
}

const visibility = visibilitySelector();

/**
 * Éléments de la carte qui passent le filtre (null : aucun filtre, tout est affiché). Même objet tant
 * que la carte et le filtre ne changent pas : utilisable directement comme sélecteur du store.
 */
export const selectVisibility = (s: { doc: MapDoc; filter: Filter }): Visibility | null => visibility(s.doc, s.filter);
