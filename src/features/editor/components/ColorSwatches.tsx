"use client";

import type { KeyboardEvent } from "react";
import { FLUX_COLORS } from "@/features/map-doc/types";
import type { FluxColor, MapColor } from "@/features/map-doc/types";
import { nextSwatchIndex, tabbableSwatch } from "@/features/editor/swatchNav";
import { cn } from "@/lib/utils";

/** Colonnes de la grille affichée : pastilles alignées sur la première ligne. */
function columnsOf(items: HTMLElement[]): number {
  const top = items[0]?.offsetTop;
  return items.filter((item) => item.offsetTop === top).length;
}

/**
 * Grille des couleurs nommées de la palette (pinceau flux, couleur d'un pays, d'un lien, d'une fiche ou
 * d'une catégorie), en groupe de boutons radio : une seule tabulation (la couleur choisie, sinon la
 * première), puis les flèches choisissent la voisine. Chaque pastille porte le nom de sa couleur
 * (infobulle et lecteurs d'écran) ; la couleur choisie est entourée, la pastille focalisée aussi, d'un
 * anneau plus large et de la couleur d'accent.
 */
export default function ColorSwatches({
  value,
  onChange,
  label,
  className,
}: {
  /** Couleur choisie (une couleur hexadécimale ou aucune : aucune pastille n'est entourée). */
  value: MapColor | null | undefined;
  onChange: (color: FluxColor) => void;
  /** Nom du groupe pour les lecteurs d'écran. */
  label: string;
  className?: string;
}) {
  const tabbable = tabbableSwatch(FLUX_COLORS.findIndex((c) => c.id === value));

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
    const index = items.indexOf(e.target as HTMLElement);
    if (index < 0) return;
    const next = nextSwatchIndex(index, e.key, items.length, columnsOf(items));
    if (next === null) return;
    e.preventDefault();
    items[next].focus();
    if (next !== index) onChange(FLUX_COLORS[next].id);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid grid-cols-[repeat(auto-fill,minmax(26px,1fr))] gap-1.5", className)}
      onKeyDown={onKeyDown}
    >
      {FLUX_COLORS.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          title={c.label}
          aria-label={c.label}
          aria-checked={value === c.id}
          tabIndex={i === tabbable ? 0 : -1}
          className="aspect-square min-h-[26px] cursor-pointer rounded-full border border-swatch-edge outline-offset-2 hover:scale-110 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-acc aria-checked:outline-2 aria-checked:outline-ink aria-checked:focus-visible:outline-3 aria-checked:focus-visible:outline-acc motion-reduce:hover:scale-100"
          style={{ background: `var(${c.token})` }}
          onClick={() => onChange(c.id)}
        />
      ))}
    </div>
  );
}

/** Nom d'une couleur de la carte : celui de la palette, sinon son code hexadécimal. */
export function colorName(color: MapColor | null | undefined): string {
  if (!color) return "Aucune";
  return FLUX_COLORS.find((c) => c.id === color)?.label ?? color;
}
