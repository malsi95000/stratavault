"use client";

import type { ReactNode } from "react";

export type Chip<T> = { value: T; label: string; count?: number; swatch?: string };

/**
 * Groupe de cases à cocher présentées en pastilles (boutons à bascule) : plusieurs valeurs peuvent être
 * retenues ; aucune retenue, le critère ne filtre rien.
 */
export default function ToggleChips<T>({
  legend,
  chips,
  selected,
  onToggle,
  empty,
}: {
  legend: string;
  chips: readonly Chip<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  /** Texte affiché quand il n'y a rien à choisir. */
  empty?: ReactNode;
}) {
  return (
    <fieldset className="m-0 mt-3.5 min-w-0 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[13px] text-mute">{legend}</legend>
      {chips.length === 0 ? (
        <p className="m-0 text-[13px] text-mute">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={String(chip.value)}
              type="button"
              aria-pressed={selected.includes(chip.value)}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-field px-2.5 py-1 text-[13px] text-ink hover:border-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc aria-pressed:border-acc aria-pressed:bg-acc aria-pressed:text-on-acc"
              onClick={() => onToggle(chip.value)}
            >
              {chip.swatch !== undefined && (
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full border border-swatch-edge"
                  style={{ background: chip.swatch }}
                />
              )}
              {chip.label}
              {chip.count !== undefined && <span className="opacity-75">({chip.count})</span>}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
