// Textes affichés pour une fiche de la frise : titre, élément porteur, date, description complète.
import { nameOfElement } from "@/features/map-doc/refs";
import type { MapDoc } from "@/features/map-doc/types";
import { formatFicheDate } from "./dates";
import type { FicheDate } from "./dates";
import type { Entry, EntryKind } from "./entries";

const KIND_SINGULAR: Record<EntryKind, string> = {
  c: "Pays",
  l: "Lien",
  p: "Balise",
  o: "Point",
  z: "Zone",
  t: "Texte",
  flux: "Flux",
};

/** Titre de la fiche ; un lien sans titre prend le nom de ses deux extrémités. */
export function entryTitle(doc: MapDoc, entry: Entry): string {
  if (entry.title) return entry.title;
  return entry.ref ? nameOfElement(doc, entry.ref) : KIND_SINGULAR[entry.kind];
}

/**
 * Élément qui porte la fiche : « Lien · France – Allemagne », « Fiche de France » (fiche
 * supplémentaire), « Pays » (fiche principale d'un pays, dont le titre est déjà le nom).
 */
export function entryContext(doc: MapDoc, entry: Entry): string {
  const name = entry.ref ? nameOfElement(doc, entry.ref) : "";
  if (!entry.main) return `Fiche de ${name || KIND_SINGULAR[entry.kind]}`;
  const title = entryTitle(doc, entry);
  return name && name !== title ? `${KIND_SINGULAR[entry.kind]} · ${name}` : KIND_SINGULAR[entry.kind];
}

/** Date écrite en français, ou la saisie telle quelle si elle est illisible, ou « Sans date ». */
export function entryDate(entry: Entry): string {
  if (entry.when) return formatFicheDate(entry.when);
  return entry.date.trim() || "Sans date";
}

/** Période d'un groupe de fiches triées : « 1914 », « 1914 – 1916 », « août 1914 – nov. 1918 ». */
export function rangeLabel(first: FicheDate, last: FicheDate): string {
  const a = formatFicheDate(first);
  const b = formatFicheDate(last);
  return a === b ? a : `${a} – ${b}`;
}

/** Description complète (infobulle, lecteurs d'écran) : titre, date, élément, catégorie. */
export function entryDescription(doc: MapDoc, entry: Entry): string {
  const category = entry.category ? doc.categories.find((c) => c.id === entry.category)?.label : undefined;
  return [entryTitle(doc, entry), entryDate(entry), entryContext(doc, entry), category && `Catégorie : ${category}`]
    .filter(Boolean)
    .join(" — ");
}

/** Textes d'une fiche, calculés une fois (un zoom ou un déplacement ne les recalcule pas). */
export type EntryLabels = { title: string; date: string; context: string; description: string };

export function entryLabels(doc: MapDoc, entry: Entry): EntryLabels {
  return {
    title: entryTitle(doc, entry),
    date: entryDate(entry),
    context: entryContext(doc, entry),
    description: entryDescription(doc, entry),
  };
}

/** Textes de chaque fiche, par clé. */
export const labelsByKey = (doc: MapDoc, entries: readonly Entry[]): ReadonlyMap<string, EntryLabels> =>
  new Map(entries.map((e) => [e.key, entryLabels(doc, e)]));

/** Années visibles sur la frise : « 1914 – 1918 », ou « 1916 » si la vue tient dans une année. */
export function viewportLabel(view: { start: number; end: number }): string {
  const first = Math.floor(view.start);
  // Fin exclue : une vue qui s'arrête au 1er janvier 1919 montre 1918 au plus.
  const last = Math.max(first, Math.ceil(view.end) - 1);
  return first === last ? String(first) : `${first} – ${last}`;
}
