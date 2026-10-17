"use client";

import { erasedFicheCount } from "@/features/map-doc/ops";
import { makeElementRef, makeRef } from "@/features/map-doc/refs";
import { useEditorStore } from "@/features/editor/store";
import { DateField, DeleteButton, NotesField, TitleField } from "./fields";
import ExtraFichesList from "./ExtraFichesList";
import FicheHeader from "./FicheHeader";
import Relations from "./Relations";
import { deleteConfirm } from "./texts";

/** Fiche d'une zone tracée au lasso. */
export default function ZoneFiche({ id }: { id: string }) {
  const doc = useEditorStore((s) => s.doc);
  const updateFiche = useEditorStore((s) => s.updateFiche);
  const close = useEditorStore((s) => s.close);
  const erase = useEditorStore((s) => s.erase);
  const zone = doc.zones.find((z) => z.id === id);
  if (!zone) return null;

  return (
    <>
      <FicheHeader title={zone.title || "Zone"} subtitle="Fiche de zone" />
      <TitleField
        placeholder="Zone d’influence, couloir maritime…"
        value={zone.title}
        onChange={(title) => updateFiche("z", id, { title })}
      />
      <DateField value={zone.date ?? ""} onChange={(date) => updateFiche("z", id, { date })} />
      <NotesField
        placeholder="Informations sur cette zone…"
        value={zone.note}
        onChange={(note) => updateFiche("z", id, { note })}
      />
      <ExtraFichesList owner={makeElementRef("z", id)} />
      <Relations doc={doc} of={makeRef("z", id)} />
      <DeleteButton
        label="Supprimer cette zone"
        confirmText={() => deleteConfirm("z", erasedFicheCount(doc, "z", id))}
        onConfirm={() => {
          close();
          erase("z", id);
        }}
      />
    </>
  );
}
