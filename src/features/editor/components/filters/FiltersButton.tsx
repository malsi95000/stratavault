"use client";

import { FunnelIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activeCriteria, normalizeFilter } from "@/features/filters/filter";
import { useEditorStore } from "@/features/editor/store";

/** Identifiant du bouton : le focus y revient à la fermeture du panneau et après « Réinitialiser ». */
export const FILTERS_BUTTON_ID = "editor-filters-button";

/** Rend le focus au bouton « Filtres » (le contrôle qui avait le focus vient de disparaître). */
export function focusFiltersButton() {
  document.getElementById(FILTERS_BUTTON_ID)?.focus();
}

/** « Filtres » (barre du haut) : ouvre ou ferme le panneau des filtres ; le nombre de critères actifs est affiché. */
export default function FiltersButton() {
  const hydrated = useEditorStore((s) => s.hydrated);
  const open = useEditorStore((s) => s.filtersOpen);
  const setOpen = useEditorStore((s) => s.setFiltersOpen);
  const count = useEditorStore((s) => activeCriteria(normalizeFilter(s.filter, s.doc.categories)));
  return (
    <Button
      id={FILTERS_BUTTON_ID}
      variant="panel"
      size="panel"
      disabled={!hydrated}
      aria-expanded={open}
      aria-controls={open ? "editor-filters-panel" : undefined}
      title="Filtres"
      className={count > 0 ? "border-acc" : undefined}
      onClick={() => setOpen(!open)}
    >
      <FunnelIcon aria-hidden="true" />
      {/* Libellé masqué visuellement sous xl (reste le nom accessible) : la barre tient en 1024 px. */}
      <span className="max-xl:sr-only">Filtres</span>
      {count > 0 && (
        <span className="rounded-full bg-acc px-1.5 text-[12px] leading-[18px] font-semibold text-on-acc">
          {count}
          <span className="sr-only"> {count > 1 ? "critères actifs" : "critère actif"}</span>
        </span>
      )}
    </Button>
  );
}
