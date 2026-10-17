"use client";

import { XIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { compileFilter, isFilterActive, normalizeFilter, toggled } from "@/features/filters/filter";
import { categoryOptions, colorOptions } from "@/features/filters/options";
import { categoryLabel, colorLabel, matchCountLabel } from "@/features/filters/summary";
import { colorCss } from "@/features/map-doc/types";
import { ENTRY_KINDS, ENTRY_KIND_LABELS, collectEntries } from "@/features/timeline/entries";
import { useEditorStore } from "@/features/editor/store";
import HelpButton from "../help/HelpButton";
import { useSettled } from "../useSettled";
import { focusFiltersButton } from "./FiltersButton";
import PeriodFields from "./PeriodFields";
import ToggleChips from "./ToggleChips";

export const FILTERS_PANEL_ID = "editor-filters-panel";

/** Délai avant d'annoncer le nombre de fiches retenues : une saisie n'annonce que son résultat. */
const ANNOUNCE_DELAY_MS = 700;

/**
 * Panneau des filtres (EDI-08), posé sur la carte sans la masquer : chaque choix s'applique aussitôt
 * à la carte (planisphère, globe) et à la frise. Période, couleurs et catégories portées par les
 * fiches, types d'éléments ; « Réinitialiser » vide tout. Échap ou « Fermer » le referment (le filtre
 * reste appliqué) et rendent le focus au bouton « Filtres ».
 */
export default function FiltersPanel() {
  const open = useEditorStore((s) => s.filtersOpen);
  const setOpen = useEditorStore((s) => s.setFiltersOpen);
  const doc = useEditorStore((s) => (s.filtersOpen ? s.doc : null));
  const rawFilter = useEditorStore((s) => s.filter);
  const setFilter = useEditorStore((s) => s.setFilter);
  const resetFilter = useEditorStore((s) => s.resetFilter);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // À l'ouverture, le focus entre dans le panneau (sur son titre).
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  const entries = useMemo(() => (doc ? collectEntries(doc) : []), [doc]);
  const filter = normalizeFilter(rawFilter, doc?.categories ?? []);
  const matches = compileFilter(filter);
  const count = matchCountLabel(matches ? entries.filter(matches).length : entries.length, entries.length);
  const announced = useSettled(count, ANNOUNCE_DELAY_MS);
  if (!open || !doc) return null;
  // Une période illisible n'est pas un critère actif, mais « Réinitialiser » doit pouvoir l'effacer.
  const hasInput = isFilterActive(filter) || filter.from.trim() !== "" || filter.to.trim() !== "";

  const close = () => {
    setOpen(false);
    focusFiltersButton();
  };

  return (
    // Fenêtre non modale : la carte reste utilisable pendant le choix des filtres. role="dialog" écarte
    // aussi les raccourcis de l'éditeur (Échap y ferme le panneau, pas la fiche).
    <section
      id={FILTERS_PANEL_ID}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${FILTERS_PANEL_ID}-title`}
      className="absolute top-16 left-[72px] z-5 max-h-[calc(100dvh-9rem)] w-[min(340px,calc(100%-84px))] overflow-y-auto rounded-[6px] border border-line bg-panel p-4 shadow-[0_12px_30px_var(--color-flyout-shadow)] max-lg:top-[4.75rem]"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        close();
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id={`${FILTERS_PANEL_ID}-title`} ref={headingRef} tabIndex={-1} className="brut m-0 text-lg outline-none">
          Filtres
        </h2>
        <div className="flex items-center gap-1">
          <HelpButton topic="filtres" side="bottom" align="end" />
          <Button variant="ghost" size="icon-sm" aria-label="Fermer les filtres" onClick={close}>
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p className="m-0 mt-1 text-[13px] text-mute">
        Appliqués à la carte et à la frise. Un élément reste affiché si l’une de ses fiches correspond.
      </p>
      <p aria-hidden="true" className="m-0 mt-2 text-[13px] text-ink">
        {count}
      </p>
      {/* Annoncé une fois la saisie arrêtée, pas à chaque frappe. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announced}
      </p>

      <PeriodFields filter={filter} onChange={setFilter} />

      <ToggleChips
        legend="Couleurs"
        chips={colorOptions(entries, filter).map(({ value, count }) => ({
          value,
          count,
          label: colorLabel(value),
          swatch: value === null ? "transparent" : colorCss(value),
        }))}
        selected={filter.colors}
        onToggle={(value) => setFilter({ colors: toggled(filter.colors, value) })}
        empty="Aucune fiche sur cette carte."
      />

      <ToggleChips
        legend="Catégories"
        chips={categoryOptions(entries, doc.categories).map(({ value, count }) => {
          const color = doc.categories.find((c) => c.id === value)?.color;
          return { value, count, label: categoryLabel(value, doc.categories), swatch: color ? colorCss(color) : undefined };
        })}
        selected={filter.categories}
        onToggle={(value) => setFilter({ categories: toggled(filter.categories, value) })}
      />

      <ToggleChips
        legend="Types d’éléments"
        chips={ENTRY_KINDS.map((kind) => ({ value: kind, label: ENTRY_KIND_LABELS[kind] }))}
        selected={filter.kinds}
        onToggle={(value) => setFilter({ kinds: toggled(filter.kinds, value) })}
      />

      <div className="mt-4 flex justify-between gap-2 border-t border-line pt-3">
        <Button
          variant="panel"
          size="panel"
          disabled={!hasInput}
          onClick={() => {
            // Le bouton se désactive : le focus revient au titre du panneau.
            resetFilter();
            headingRef.current?.focus();
          }}
        >
          Réinitialiser
        </Button>
        <Button variant="panel" size="panel" onClick={close}>
          Fermer
        </Button>
      </div>
    </section>
  );
}
