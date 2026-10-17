"use client";

import { erasedFicheCount } from "@/features/map-doc/ops";
import { fmtLL } from "@/lib/geo";
import { makeElementRef, makeRef } from "@/features/map-doc/refs";
import { PING_LABELS, PING_TYPES, isPingType } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import { DateField, DeleteButton, Facts, NotesField, TitleField } from "./fields";
import ExtraFichesList from "./ExtraFichesList";
import FicheHeader from "./FicheHeader";
import Relations from "./Relations";
import { FIELD, LABEL } from "./styles";
import { deleteConfirm } from "./texts";

/** Fiche d'une balise : catégorie (modifiable), position, titre, date, notes et relations. */
export default function PingFiche({ id }: { id: string }) {
  const doc = useEditorStore((s) => s.doc);
  const updateFiche = useEditorStore((s) => s.updateFiche);
  const changePingType = useEditorStore((s) => s.changePingType);
  const close = useEditorStore((s) => s.close);
  const erase = useEditorStore((s) => s.erase);
  const ping = doc.pings.find((p) => p.id === id);
  if (!ping) return null;
  const label = PING_LABELS[ping.type];

  return (
    <>
      <FicheHeader title={ping.title || label} subtitle="Fiche balise" />
      <Facts
        items={[
          ["Catégorie", label],
          ["Position", fmtLL(ping.ll)],
        ]}
      />
      <label className={LABEL}>
        Catégorie
        <select
          className={FIELD}
          value={ping.type}
          onChange={(e) => {
            if (isPingType(e.target.value)) changePingType(id, e.target.value);
          }}
        >
          {PING_TYPES.map((t) => (
            <option key={t} value={t}>
              {PING_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <TitleField
        placeholder="Détroit, base navale, incident…"
        value={ping.title}
        onChange={(title) => updateFiche("p", id, { title })}
      />
      <DateField value={ping.date ?? ""} onChange={(date) => updateFiche("p", id, { date })} />
      <NotesField
        placeholder="Informations sur ce point…"
        value={ping.note}
        onChange={(note) => updateFiche("p", id, { note })}
      />
      <ExtraFichesList owner={makeElementRef("p", id)} />
      <Relations doc={doc} of={makeRef("p", id)} />
      <DeleteButton
        label="Supprimer cette balise"
        confirmText={() => deleteConfirm("p", erasedFicheCount(doc, "p", id))}
        onConfirm={() => {
          close();
          erase("p", id);
        }}
      />
    </>
  );
}
