"use client";

import { PlusIcon } from "lucide-react";
import { findCategory } from "@/features/map-doc/categories";
import { extraFichesOf } from "@/features/map-doc/fiches";
import { MAX_FICHES_PER_ELEMENT, MAX_TOTAL_FICHES, isFicheFull } from "@/features/map-doc/limits";
import { colorCss } from "@/features/map-doc/types";
import type { ElementRef, ExtraFiche, MapDoc } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import { cn } from "@/lib/utils";
import { extraFicheTitle, frenchDate } from "./format";
import { BTN, H3 } from "./styles";

/** Pastille de couleur d'une fiche : sa couleur, sinon celle de sa catégorie, sinon un rond vide. */
function FicheDot({ doc, fiche }: { doc: MapDoc; fiche: ExtraFiche }) {
  const color = fiche.color ?? (fiche.category ? findCategory(doc, fiche.category)?.color : undefined);
  return (
    <span
      aria-hidden="true"
      className={cn("mt-1 inline-block size-2.5 shrink-0 rounded-full", !color && "border border-mute")}
      style={color ? { background: colorCss(color) } : undefined}
    />
  );
}

/**
 * « Fiches » : fiches supplémentaires d'un élément (pays, lien…), chacune ouverte d'un clic, et le
 * bouton « Nouvelle fiche ».
 */
export default function ExtraFichesList({ owner }: { owner: ElementRef }) {
  const doc = useEditorStore((s) => s.doc);
  const openExtraFiche = useEditorStore((s) => s.openExtraFiche);
  const addExtraFiche = useEditorStore((s) => s.addExtraFiche);
  const fiches = extraFichesOf(doc, owner);
  const full = isFicheFull(doc, owner);

  return (
    <section aria-label="Fiches supplémentaires">
      <h3 className={H3}>Fiches</h3>
      {fiches.length > 0 && (
        <ul className="m-0 mb-1.5 grid list-none gap-1 p-0">
          {fiches.map((fiche) => {
            const category = fiche.category ? findCategory(doc, fiche.category) : undefined;
            const details = [frenchDate(fiche.date), category?.label].filter(Boolean).join(" · ");
            return (
              <li key={fiche.id}>
                <button
                  type="button"
                  className={cn(BTN, "flex w-full items-start gap-2 text-left")}
                  data-fiche-button={fiche.id}
                  onClick={() => openExtraFiche(fiche.id)}
                >
                  <FicheDot doc={doc} fiche={fiche} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{extraFicheTitle(fiche)}</span>
                    {details && <span className="block truncate text-xs text-mute">{details}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className={cn(BTN, "inline-flex items-center gap-1.5")}
        disabled={full}
        onClick={() => addExtraFiche(owner)}
      >
        <PlusIcon aria-hidden="true" className="size-4" />
        Nouvelle fiche
      </button>
      {full && (
        <p className="mt-1.5 mb-0 text-xs text-mute">
          Nombre maximal de fiches atteint ({MAX_FICHES_PER_ELEMENT} par élément, {MAX_TOTAL_FICHES.toLocaleString("fr-FR")} par carte).
        </p>
      )}
    </section>
  );
}
