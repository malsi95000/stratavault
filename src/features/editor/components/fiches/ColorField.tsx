"use client";

import { useId } from "react";
import { HEX_COLOR_PATTERN, parseMapColor } from "@/features/map-doc/types";
import type { MapColor } from "@/features/map-doc/types";
import { cn } from "@/lib/utils";
import ColorSwatches, { colorName } from "../ColorSwatches";
import { BTN, LABEL } from "./styles";

/** Valeur proposée par le sélecteur « Autre couleur » quand la couleur choisie est un jeton ou aucune. */
const CUSTOM_DEFAULT = "#808080";

/**
 * Couleur d'un pays, d'un lien ou d'une fiche : une couleur de la palette, une autre couleur au choix
 * (#rrggbb), ou aucune (couleur par défaut, ou celle de la catégorie).
 */
export default function ColorField({
  value,
  onChange,
  emptyLabel = "Aucune",
  allowNone = true,
}: {
  value: MapColor | undefined;
  onChange: (color: MapColor | null) => void;
  /** Libellé du bouton qui retire la couleur. */
  emptyLabel?: string;
  /** Faux : une couleur est obligatoire (catégorie), pas de bouton pour la retirer. */
  allowNone?: boolean;
}) {
  const customId = useId();
  const custom = value && HEX_COLOR_PATTERN.test(value) ? value : undefined;
  return (
    <fieldset className="m-0 mt-3.5 border-0 p-0">
      <legend className={cn(LABEL, "mt-0 mb-1.5 p-0")}>
        Couleur : <span className="text-ink">{value ? colorName(value) : emptyLabel}</span>
      </legend>
      <ColorSwatches label="Couleurs de la palette" value={value} onChange={onChange} />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
        {allowNone && (
          <button type="button" className={cn(BTN, "px-2 py-1 text-[13px] aria-pressed:border-acc")} aria-pressed={!value} onClick={() => onChange(null)}>
            {emptyLabel}
          </button>
        )}
        <label htmlFor={customId} className="flex cursor-pointer items-center gap-1.5 text-mute">
          <input
            id={customId}
            type="color"
            className="h-7 w-9 cursor-pointer rounded border border-line bg-field p-0.5"
            value={custom ?? CUSTOM_DEFAULT}
            onChange={(e) => {
              const color = parseMapColor(e.target.value);
              if (color) onChange(color);
            }}
          />
          Autre couleur{custom ? ` (${custom})` : "…"}
        </label>
      </div>
    </fieldset>
  );
}
