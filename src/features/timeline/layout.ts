// Placement des fiches sur la frise : tri chronologique, regroupement des fiches trop proches à
// l'écran, et rangement des étiquettes sur des lignes superposées. Fonctions pures.
import { compareFicheDates, endOf } from "./dates";
import type { FicheDate } from "./dates";
import type { Entry } from "./entries";
import { inTimeline, toX } from "./viewport";
import type { Viewport } from "./viewport";

/** Fiche datée (sa date est lue). */
export type DatedEntry = Entry & { when: FicheDate };

/** Fiches réparties : sur la frise (triées), datées hors de 1800–2100, sans date (ou date illisible). */
export type Partition = { dated: DatedEntry[]; outside: DatedEntry[]; undated: Entry[] };

export function partitionEntries(entries: readonly Entry[]): Partition {
  const dated: DatedEntry[] = [];
  const outside: DatedEntry[] = [];
  const undated: Entry[] = [];
  for (const e of entries) {
    if (!e.when) undated.push(e);
    else if (inTimeline(e.when.value)) dated.push(e as DatedEntry);
    else outside.push(e as DatedEntry);
  }
  const byDate = (a: DatedEntry, b: DatedEntry) => compareFicheDates(a.when, b.when) || a.key.localeCompare(b.key);
  dated.sort(byDate);
  outside.sort(byDate);
  return { dated, outside, undated };
}

/** Début et fin (exclue) de la période couverte par des fiches triées ; null s'il n'y en a pas. */
export function extentOf(dated: readonly DatedEntry[]): { start: number; end: number } | null {
  if (dated.length === 0) return null;
  return { start: dated[0].when.value, end: dated.reduce((max, e) => Math.max(max, endOf(e.when)), -Infinity) };
}

/** Groupe de fiches affichées au même endroit (une seule fiche le plus souvent). */
export type Group = {
  /** Clé stable : celle de la première fiche. */
  key: string;
  /** Position du repère sur l'axe (pixels), au milieu des fiches regroupées. */
  x: number;
  entries: DatedEntry[];
  /** Ligne de l'étiquette (0 : juste au-dessus de l'axe) ; null : pas de place, seul le repère est affiché. */
  lane: number | null;
  /** Bord gauche de l'étiquette (pixels), décalé pour rester dans la frise. */
  left: number;
};

/**
 * Signature d'un groupe : les clés de ses fiches. Après un zoom ou un filtre, un groupe peut garder la
 * clé de sa première fiche sans avoir les mêmes fiches ; la signature, elle, change.
 */
export const groupSignature = (entries: readonly Pick<Entry, "key">[]) => entries.map((e) => e.key).join(" ");

/** Écart (pixels) en dessous duquel deux fiches voisines sont regroupées. */
export const GROUP_GAP_PX = 18;

/**
 * Regroupe les fiches triées visibles (repère dans la vue : 0 ≤ x ≤ width) dont les repères seraient à
 * moins de `gap` pixels du premier repère du groupe. Une fiche hors de la vue n'est pas placée : son
 * étiquette annoncerait une date absente de l'écran, et elle ne doit pas entraîner hors de la vue une
 * fiche visible regroupée avec elle.
 */
export function groupEntries(
  dated: readonly DatedEntry[],
  view: Viewport,
  width: number,
  gap = GROUP_GAP_PX,
): Omit<Group, "lane" | "left">[] {
  const groups: Omit<Group, "lane" | "left">[] = [];
  let current: { first: number; xs: number[]; entries: DatedEntry[] } | null = null;
  const flush = () => {
    if (!current) return;
    const x = current.xs.reduce((sum, v) => sum + v, 0) / current.xs.length;
    groups.push({ key: current.entries[0].key, x, entries: current.entries });
  };
  for (const entry of dated) {
    const x = toX(view, entry.when.value, width);
    if (x < 0 || x > width) continue;
    if (current && x - current.first < gap) {
      current.xs.push(x);
      current.entries.push(entry);
    } else {
      flush();
      current = { first: x, xs: [x], entries: [entry] };
    }
  }
  flush();
  return groups;
}

/** Fiches dont le repère est avant (`before`) ou après (`after`) la vue. */
export function outsideView(dated: readonly DatedEntry[], view: Viewport): { before: number; after: number } {
  let before = 0;
  let after = 0;
  for (const e of dated) {
    if (e.when.value < view.start) before++;
    else if (e.when.value > view.end) after++;
  }
  return { before, after };
}

/**
 * Range les étiquettes (largeur `labelWidth`, posées à droite de leur repère, décalées vers la gauche
 * au bord droit) sur `lanes` lignes, sans chevauchement : chaque étiquette prend la première ligne
 * libre. Faute de place, elle n'est pas affichée (lane null) : son repère reste cliquable.
 */
export function assignLanes(
  groups: readonly Omit<Group, "lane" | "left">[],
  width: number,
  labelWidth: number,
  lanes: number,
  spacing = 8,
): Group[] {
  const ends: number[] = Array.from({ length: Math.max(0, lanes) }, () => -Infinity);
  return groups.map((g) => {
    const left = Math.max(0, Math.min(g.x, width - labelWidth));
    const lane = ends.findIndex((end) => end <= left);
    if (lane >= 0) ends[lane] = left + labelWidth + spacing;
    return { ...g, lane: lane >= 0 ? lane : null, left };
  });
}

// Géométrie verticale de la frise (pixels) : l'axe en bas, ses graduations dessous, les étiquettes
// rangées en lignes au-dessus.
export const LABEL_WIDTH = 176;
export const LANE_HEIGHT = 46;
/** Hauteur réservée sous l'axe aux libellés des graduations. */
export const TICKS_HEIGHT = 30;
/** Écart entre l'axe et la première ligne d'étiquettes. */
export const AXIS_GAP = 14;
export const MAX_LANES = 8;

/** Nombre de lignes d'étiquettes qui tiennent dans une frise haute de `height` pixels. */
export function laneCount(height: number): number {
  return Math.max(0, Math.min(MAX_LANES, Math.floor((height - TICKS_HEIGHT - AXIS_GAP - 8) / LANE_HEIGHT)));
}
