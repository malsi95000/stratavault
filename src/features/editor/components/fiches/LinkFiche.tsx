"use client";

import { erasedFicheCount } from "@/features/map-doc/ops";
import { makeElementRef, nameOfRef } from "@/features/map-doc/refs";
import { useEditorStore } from "@/features/editor/store";
import { DateField, DeleteButton, NotesField, TitleField } from "./fields";
import ExtraFichesList from "./ExtraFichesList";
import FicheHeader from "./FicheHeader";
import { LinkEnds } from "./Relations";
import StyleFields from "./StyleFields";
import { deleteConfirm } from "./texts";

/** Fiche relationnelle d'un lien. */
export default function LinkFiche({ id }: { id: string }) {
  const doc = useEditorStore((s) => s.doc);
  const updateFiche = useEditorStore((s) => s.updateFiche);
  const close = useEditorStore((s) => s.close);
  const erase = useEditorStore((s) => s.erase);
  const link = doc.links.find((l) => l.id === id);
  if (!link) return null;

  return (
    <>
      <FicheHeader title={`${nameOfRef(doc, link.a)} – ${nameOfRef(doc, link.b)}`} subtitle="Fiche relationnelle" />
      <TitleField
        label="Nature de la relation"
        placeholder="Alliance, tension, accord commercial…"
        value={link.title}
        onChange={(title) => updateFiche("l", id, { title })}
      />
      <DateField value={link.date ?? ""} onChange={(date) => updateFiche("l", id, { date })} />
      <NotesField
        placeholder="Contexte, dates, enjeux…"
        value={link.note}
        onChange={(note) => updateFiche("l", id, { note })}
      />
      <StyleFields of={makeElementRef("l", id)} />
      <ExtraFichesList owner={makeElementRef("l", id)} />
      <LinkEnds doc={doc} a={link.a} b={link.b} />
      <DeleteButton
        label="Supprimer ce lien"
        confirmText={() => deleteConfirm("l", erasedFicheCount(doc, "l", id))}
        onConfirm={() => {
          close();
          erase("l", id);
        }}
      />
    </>
  );
}
