// Filtres de la carte et de la frise (EDI-08) : période, couleurs, catégories et types d'éléments.
// Fonctions pures. Une fiche passe le filtre si elle remplit chaque critère renseigné ; dans un même
// critère, une seule valeur cochée suffit (rouge OU bleu). Un critère vide ne filtre rien.
import type { Category, MapColor } from "@/features/map-doc/types";
import { endOf, parseFicheDate } from "@/features/timeline/dates";
import type { Entry, EntryKind } from "@/features/timeline/entries";

export type Filter = {
  /** Début de la période (AAAA, AAAA-MM ou AAAA-MM-JJ), vide : sans borne. */
  from: string;
  /** Fin de la période, incluse (« 1918 » va jusqu'au 31 décembre 1918), vide : sans borne. */
  to: string;
  /** Couleurs retenues ; null : les fiches sans couleur. */
  colors: readonly (MapColor | null)[];
  /** Catégories retenues (identifiants) ; null : les fiches sans catégorie. */
  categories: readonly (string | null)[];
  kinds: readonly EntryKind[];
};

export const EMPTY_FILTER: Filter = { from: "", to: "", colors: [], categories: [], kinds: [] };

/** Période lue : bornes en années décimales (null : sans borne) et bornes illisibles, ignorées. */
export type Period = { start: number | null; end: number | null; invalid: ("from" | "to")[] };

export function periodOf(filter: Pick<Filter, "from" | "to">): Period {
  const invalid: Period["invalid"] = [];
  const read = (text: string, which: "from" | "to") => {
    if (!text.trim()) return null;
    const date = parseFicheDate(text);
    if (!date) invalid.push(which);
    return date;
  };
  const from = read(filter.from, "from");
  const to = read(filter.to, "to");
  return { start: from ? from.value : null, end: to ? endOf(to) : null, invalid };
}

/** Retire les catégories qui n'existent plus dans la carte (supprimées depuis le choix du filtre). */
export function normalizeFilter(filter: Filter, categories: readonly Category[]): Filter {
  const known = filter.categories.filter((id) => id === null || categories.some((c) => c.id === id));
  return known.length === filter.categories.length ? filter : { ...filter, categories: known };
}

/** Nombre de critères renseignés (une période illisible ne compte pas). */
export function activeCriteria(filter: Filter): number {
  const period = periodOf(filter);
  const hasPeriod = period.start !== null || period.end !== null;
  return [hasPeriod, filter.colors.length > 0, filter.categories.length > 0, filter.kinds.length > 0].filter(Boolean).length;
}

export const isFilterActive = (filter: Filter) => activeCriteria(filter) > 0;

/** Prédicat du filtre ; null si aucun critère n'est renseigné (tout est visible). */
export function compileFilter(filter: Filter): ((entry: Entry) => boolean) | null {
  if (!isFilterActive(filter)) return null;
  const { start, end } = periodOf(filter);
  // Période à l'envers (fin avant le début) : aucune fiche, même une moins précise que les bornes
  // (« 1916 » chevaucherait « juin 1916 → mars 1916 »).
  if (start !== null && end !== null && end <= start) return () => false;
  const colors = new Set(filter.colors);
  const categories = new Set(filter.categories);
  const kinds = new Set(filter.kinds);
  return (entry) => {
    if (kinds.size > 0 && !kinds.has(entry.kind)) return false;
    if (colors.size > 0 && !colors.has(entry.color)) return false;
    if (categories.size > 0 && !categories.has(entry.category)) return false;
    if (start === null && end === null) return true;
    // Une fiche sans date ne peut pas être dans une période ; une date couvre toute sa durée
    // (une fiche « 1916 » est dans la période « juin 1916 – 1918 »).
    const when = entry.when;
    if (!when) return false;
    return (start === null || endOf(when) > start) && (end === null || when.value < end);
  };
}

/** Ajoute la valeur à la liste, ou l'en retire si elle y est déjà. */
export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
