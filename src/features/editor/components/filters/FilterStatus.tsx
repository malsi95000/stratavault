"use client";

import { FunnelIcon, XIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { normalizeFilter } from "@/features/filters/filter";
import { filterSummary } from "@/features/filters/summary";
import { useEditorStore } from "@/features/editor/store";
import { cn } from "@/lib/utils";
import { focusFiltersButton } from "./FiltersButton";

/**
 * État des filtres, visible tant qu'un critère est renseigné (au-dessus de la carte, ou en tête de la
 * frise) : les critères, « Modifier » (ouvre le panneau) et « Réinitialiser ». Ce n'est pas une
 * région annoncée : elle changerait à chaque frappe dans la période ; le nombre de fiches retenues est
 * annoncé par le panneau, une fois la saisie arrêtée.
 */
export default function FilterStatus({ className, style }: { className?: string; style?: CSSProperties }) {
  const filter = useEditorStore((s) => s.filter);
  const categories = useEditorStore((s) => s.doc.categories);
  const setFiltersOpen = useEditorStore((s) => s.setFiltersOpen);
  const resetFilter = useEditorStore((s) => s.resetFilter);
  const parts = filterSummary(normalizeFilter(filter, categories), categories);
  if (parts.length === 0) return null;
  return (
    <div
      className={cn(
        "flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded border border-acc/60 bg-panel px-3 py-1.5 text-[13px]",
        className,
      )}
      style={style}
    >
      <span className="flex items-center gap-1.5 font-semibold text-acc">
        <FunnelIcon aria-hidden="true" className="size-3.5" />
        Filtres actifs
      </span>
      {parts.map((part) => (
        <span key={part} className="text-ink">
          {part}
        </span>
      ))}
      <span className="flex gap-1.5">
        <Button variant="panel" size="xs" onClick={() => setFiltersOpen(true)}>
          Modifier
        </Button>
        <Button
          variant="panel"
          size="xs"
          onClick={() => {
            // Le bandeau disparaît avec le bouton cliqué : le focus revient au bouton « Filtres ».
            resetFilter();
            focusFiltersButton();
          }}
        >
          <XIcon aria-hidden="true" />
          Réinitialiser
        </Button>
      </span>
    </div>
  );
}
