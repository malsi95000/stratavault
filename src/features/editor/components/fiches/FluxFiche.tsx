"use client";

import { findFlux } from "@/features/map-doc/ops";
import { useEditorStore } from "@/features/editor/store";
import { DateField, NotesField, TitleField } from "./fields";
import FicheHeader from "./FicheHeader";
import { fluxDefaultTitle } from "./texts";

/** Fiche technique d'un flux, partagée par tous les traits de la même couleur. */
export default function FluxFiche({ id }: { id: string }) {
  const doc = useEditorStore((s) => s.doc);
  const updateFluxFiche = useEditorStore((s) => s.updateFluxFiche);
  const found = findFlux(doc, id);
  if (!found) return null;
  const { color } = found;
  const fiche = doc.fluxFiches[color] ?? {};
  const fallback = fluxDefaultTitle(color);

  return (
    <>
      <FicheHeader title={fiche.title || fallback} subtitle="Fiche technique partagée par couleur" />
      <TitleField
        placeholder={fallback}
        value={fiche.title ?? ""}
        onChange={(title) => updateFluxFiche(color, { title })}
      />
      <DateField value={fiche.date ?? ""} onChange={(date) => updateFluxFiche(color, { date })} />
      <NotesField
        placeholder="Informations, analyse, légende…"
        value={fiche.note ?? ""}
        onChange={(note) => updateFluxFiche(color, { note })}
      />
    </>
  );
}
