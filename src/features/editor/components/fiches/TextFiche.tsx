"use client";

import { makeRef } from "@/features/map-doc/refs";
import { useEditorStore } from "@/features/editor/store";
import { DateField, DeleteButton, NotesField, TitleField } from "./fields";
import FicheHeader from "./FicheHeader";
import Relations from "./Relations";
import { DELETE_CONFIRM } from "./texts";

/** Fiche d'un petit titre posé sur la carte. */
export default function TextFiche({ id }: { id: string }) {
  const doc = useEditorStore((s) => s.doc);
  const updateFiche = useEditorStore((s) => s.updateFiche);
  const close = useEditorStore((s) => s.close);
  const erase = useEditorStore((s) => s.erase);
  const text = doc.texts.find((t) => t.id === id);
  if (!text) return null;

  return (
    <>
      <FicheHeader title={text.title || "Texte"} subtitle="Petit titre sur la carte" />
      <TitleField
        label="Titre affiché"
        maxLength={60}
        placeholder="Route de la soie, Ligne Maginot…"
        value={text.title}
        onChange={(title) => updateFiche("t", id, { title })}
      />
      <DateField value={text.date ?? ""} onChange={(date) => updateFiche("t", id, { date })} />
      <NotesField
        placeholder="Informations complémentaires…"
        value={text.note}
        onChange={(note) => updateFiche("t", id, { note })}
      />
      <Relations doc={doc} of={makeRef("t", id)} />
      <DeleteButton
        label="Supprimer ce texte"
        confirmText={DELETE_CONFIRM.t}
        onConfirm={() => {
          close();
          erase("t", id);
        }}
      />
    </>
  );
}
