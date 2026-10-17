"use client";

import type { CSSProperties } from "react";
import type { Group } from "@/features/timeline/layout";
import { rangeLabel } from "@/features/timeline/labels";
import type { EntryLabels } from "@/features/timeline/labels";
import { cn } from "@/lib/utils";
import { entryColor } from "./entryColor";

const CARD =
  "absolute flex cursor-pointer flex-col justify-center overflow-hidden rounded border border-line border-l-4 bg-panel px-2 py-1 text-left " +
  "hover:border-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc";

/** Couleurs distinctes des fiches d'un groupe (cinq au plus), pour ses pastilles. */
function groupColors(group: Group): string[] {
  return [...new Set(group.entries.map(entryColor))].slice(0, 5);
}

/**
 * Étiquette d'un groupe posée sur sa ligne : une fiche (titre, date, élément) l'ouvre ; plusieurs fiches
 * (« 4 fiches », période, pastilles de couleur) affichent leur liste sous la frise.
 */
export default function TimelineCard({
  labels,
  group,
  style,
  current,
  expanded,
  onActivate,
}: {
  /** Textes de l'unique fiche du groupe (calculés une fois par fiche, voir labelsByKey). */
  labels: EntryLabels | undefined;
  group: Group;
  style: CSSProperties;
  /** La fiche (ou l'une des fiches du groupe) est ouverte dans le panneau. */
  current: boolean;
  /** La liste de ce groupe est affichée sous la frise. */
  expanded: boolean;
  /** Ouvre la fiche, ou affiche la liste du groupe. */
  onActivate: () => void;
}) {
  const ring = current || expanded ? "ring-2 ring-ink" : "";
  if (group.entries.length === 1 && labels) {
    const entry = group.entries[0];
    return (
      <button
        type="button"
        data-entry={entry.key}
        title={labels.description}
        aria-label={labels.description}
        aria-current={current || undefined}
        className={cn(CARD, ring)}
        style={{ ...style, borderLeftColor: entryColor(entry) }}
        onClick={onActivate}
      >
        <span className="truncate text-[13px] leading-tight font-semibold text-ink">{labels.title}</span>
        <span className="truncate text-[11px] leading-tight text-mute">
          {labels.date} · {labels.context}
        </span>
      </button>
    );
  }
  const first = group.entries[0].when;
  const last = group.entries[group.entries.length - 1].when;
  const label = `${group.entries.length} fiches, ${rangeLabel(first, last)}`;
  return (
    <button
      type="button"
      data-entry={group.key}
      title={`${label} : afficher la liste`}
      aria-label={`${label} : afficher la liste`}
      aria-expanded={expanded}
      className={cn(CARD, "border-l-acc", ring)}
      style={style}
      onClick={onActivate}
    >
      <span className="flex items-center gap-1.5 text-[13px] leading-tight font-semibold text-ink">
        {group.entries.length} fiches
        <span aria-hidden="true" className="flex gap-0.5">
          {groupColors(group).map((c) => (
            <span key={c} className="size-2 rounded-full" style={{ background: c }} />
          ))}
        </span>
      </span>
      <span className="truncate text-[11px] leading-tight text-mute">{rangeLabel(first, last)}</span>
    </button>
  );
}
