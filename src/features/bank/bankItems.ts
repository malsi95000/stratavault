// Liste de la page « Mon espace stratégique » : tri, date et statistiques de chaque carte (bêta, renderBankPage).
import { statsOf } from "@/features/map-doc/ops";
import { parseMapDoc } from "@/features/map-doc/schema";
import type { StoredMapEntry } from "@/features/storage";

export type BankItem = {
  id: string;
  /** Nom saisi par l'utilisateur, affiché tel quel (React l'échappe). */
  name: string;
  /** Carte ouverte dans l'éditeur : son nom est suivi de « — en cours ». */
  active: boolean;
  /** Date de mise à jour et statistiques : « 03 oct. 2026 — 2 pays annotés · 4 liens · … ». */
  meta: string;
};

/** Statistiques affichées pour une carte que le schéma refuse (elle ne peut pas être ouverte). */
export const UNREADABLE_STATS = "Carte illisible";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };

/** Date d'une carte en français (« 03 oct. 2026 ») ; chaîne vide si la date est invalide. */
export function formatBankDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR", DATE_FORMAT);
}

/** De la carte la plus récemment modifiée à la plus ancienne (dates ISO 8601, comparables comme du texte). */
export function sortByUpdated<T extends { updated: string }>(entries: readonly T[]): T[] {
  // String() : une entrée corrompue (date absente) ne doit pas faire échouer tout le tri.
  return [...entries].sort((a, b) => String(b.updated ?? "").localeCompare(String(a.updated ?? "")));
}

/** Statistiques d'une carte dont le contenu a été lu ; null si elle est illisible. */
function statsFromData(data: unknown): string | null {
  const doc = parseMapDoc(data);
  return doc ? statsOf(doc) : null;
}

export function toBankItem(entry: StoredMapEntry, activeMapId: string | null): BankItem {
  const date = formatBankDate(entry.updated);
  const stats = (entry.stats === undefined ? statsFromData(entry.data) : entry.stats) ?? UNREADABLE_STATS;
  return {
    id: entry.id,
    name: entry.name,
    active: entry.id === activeMapId,
    meta: date ? `${date} — ${stats}` : stats,
  };
}

/** Cartes de la banque prêtes à afficher, triées par date de mise à jour décroissante. */
export function toBankItems(entries: readonly StoredMapEntry[], activeMapId: string | null): BankItem[] {
  return sortByUpdated(entries).map((entry) => toBankItem(entry, activeMapId));
}
