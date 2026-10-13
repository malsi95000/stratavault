"use client";

import { fmtLL } from "@/lib/geo";
import { makeRef } from "@/features/map-doc/refs";
import { useEditorStore } from "@/features/editor/store";
import { DateField, DeleteButton, Facts, NotesField, TitleField } from "./fields";
import FicheHeader from "./FicheHeader";
import Relations from "./Relations";
import { DELETE_CONFIRM } from "./texts";

/** Fiche d'un point discret (ville, lieu). */
export default function PointFiche({ id }: { id: string }) {
  const doc = useEditorStore((s) => s.doc);
  const updateFiche = useEditorStore((s) => s.updateFiche);
  const close = useEditorStore((s) => s.close);
  const erase = useEditorStore((s) => s.erase);
  const point = doc.points.find((p) => p.id === id);
  if (!point) return null;

  return (
    <>
      <FicheHeader title={point.title || "Point"} subtitle="Fiche point" />
      <Facts items={[["Position", fmtLL(point.ll)]]} />
      <TitleField
        placeholder="Ville, lieu ou repère…"
        value={point.title}
        onChange={(title) => updateFiche("o", id, { title })}
      />
      <DateField value={point.date ?? ""} onChange={(date) => updateFiche("o", id, { date })} />
      <NotesField
        placeholder="Informations sur ce point…"
        value={point.note}
        onChange={(note) => updateFiche("o", id, { note })}
      />
      <Relations doc={doc} of={makeRef("o", id)} />
      <DeleteButton
        label="Supprimer ce point"
        confirmText={DELETE_CONFIRM.o}
        onConfirm={() => {
          close();
          erase("o", id);
        }}
      />
    </>
  );
}
