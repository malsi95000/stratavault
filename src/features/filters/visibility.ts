// Éléments de la carte qui passent le filtre : un élément reste affiché si l'une de ses fiches
// (principale ou supplémentaire) passe le filtre. Calculé une fois par couple (carte, filtre) et
// partagé par tous les calques.
import type { MapDoc } from "@/features/map-doc/types";
import { collectEntries } from "@/features/timeline/entries";
import type { Entry, EntryKind } from "@/features/timeline/entries";
import { compileFilter, normalizeFilter } from "./filter";
import type { Filter } from "./filter";

/** Éléments visibles, par sorte : codes pays, identifiants d'éléments, couleurs de flux. */
export type Visibility = ReadonlyMap<EntryKind, ReadonlySet<string>>;

/** Éléments dont au moins une fiche passe le filtre ; null si le filtre est vide (tout est visible). */
export function visibilityOf(entries: readonly Entry[], filter: Filter): Visibility | null {
  const matches = compileFilter(filter);
  if (!matches) return null;
  const visible = new Map<EntryKind, Set<string>>();
  for (const entry of entries) {
    if (!matches(entry)) continue;
    const owners = visible.get(entry.kind) ?? new Set<string>();
    owners.add(entry.owner);
    visible.set(entry.kind, owners);
  }
  return visible;
}

/** Vrai si l'élément est affiché (toujours vrai sans filtre). */
export function isVisible(visibility: Visibility | null, kind: EntryKind, owner: string): boolean {
  return visibility === null || (visibility.get(kind)?.has(owner) ?? false);
}

/**
 * Sélecteur mémoïsé (une entrée) : le même objet est renvoyé tant que la carte et le filtre ne
 * changent pas, ce qui évite de re-rendre les calques. Sans filtre, la carte n'est même pas parcourue.
 */
export function visibilitySelector(): (doc: MapDoc, filter: Filter) => Visibility | null {
  let last: { doc: MapDoc; filter: Filter; result: Visibility | null } | null = null;
  return (doc, filter) => {
    if (last && last.doc === doc && last.filter === filter) return last.result;
    const normalized = normalizeFilter(filter, doc.categories);
    const result = compileFilter(normalized) ? visibilityOf(collectEntries(doc), normalized) : null;
    last = { doc, filter, result };
    return result;
  };
}
