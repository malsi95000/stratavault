"use client";

import type { KeyboardEvent } from "react";
import { COVER_ICONS } from "@/features/maps/cover";
import type { CoverIcon } from "@/features/maps/cover";
import { nextSwatchIndex, tabbableSwatch } from "@/features/editor/swatchNav";
import { COVER_ICON_DEFS } from "../../cover/coverIcons";

/** Colonnes de la grille (classe grid-cols-5 ci-dessous) : haut et bas changent de ligne. */
const COLUMNS = 5;

/**
 * Icônes du logo, en groupe de boutons radio comme les pastilles de couleur : une seule tabulation
 * (l'icône choisie), puis les flèches, Début et Fin choisissent la voisine.
 */
export default function IconGrid({ value, onChange }: { value: CoverIcon; onChange: (icon: CoverIcon) => void }) {
  const tabbable = tabbableSwatch(COVER_ICONS.indexOf(value));

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
    const index = items.indexOf(e.target as HTMLElement);
    if (index < 0) return;
    const next = nextSwatchIndex(index, e.key, items.length, COLUMNS);
    if (next === null) return;
    e.preventDefault();
    items[next].focus();
    if (next !== index) onChange(COVER_ICONS[next]);
  }

  return (
    <div role="radiogroup" aria-label="Icône du logo" className="grid grid-cols-5 gap-1.5" onKeyDown={onKeyDown}>
      {COVER_ICONS.map((icon, i) => {
        const { Icon, label } = COVER_ICON_DEFS[icon];
        return (
          <button
            key={icon}
            type="button"
            role="radio"
            title={label}
            aria-label={label}
            aria-checked={value === icon}
            tabIndex={i === tabbable ? 0 : -1}
            className="grid h-9 cursor-pointer place-items-center rounded-[6px] border border-line bg-bg text-ink outline-offset-2 hover:border-mute focus-visible:outline-3 focus-visible:outline-acc aria-checked:border-acc aria-checked:bg-acc aria-checked:text-on-acc"
            onClick={() => onChange(icon)}
          >
            <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </button>
        );
      })}
    </div>
  );
}
