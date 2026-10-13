"use client";

import { countryByCode, STATUS_LABELS } from "@/data/countries";
import { makeRef } from "@/features/map-doc/refs";
import { useEditorStore } from "@/features/editor/store";
import { DateField, NotesField } from "./fields";
import FicheHeader from "./FicheHeader";
import Relations from "./Relations";

/** Fiche pays : statut, souveraineté, capitales, région, date, notes et relations tracées. */
export default function CountryFiche({ code }: { code: string }) {
  const country = countryByCode.get(code);
  const doc = useEditorStore((s) => s.doc);
  const setCountryNote = useEditorStore((s) => s.setCountryNote);
  const setCountryDate = useEditorStore((s) => s.setCountryDate);
  if (!country) return null;

  const sovereign = country.sovereign ? countryByCode.get(country.sovereign) : undefined;

  return (
    <>
      <FicheHeader title={country.name} subtitle="Fiche pays" />
      <dl className="my-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-mute">Statut</dt>
        <dd className="m-0">{STATUS_LABELS[country.status]}</dd>
        {sovereign && (
          <>
            <dt className="text-mute">Souveraineté</dt>
            <dd className="m-0">{sovereign.name}</dd>
          </>
        )}
        <dt className="text-mute">{country.capitals.length > 1 ? "Capitales" : "Capitale"}</dt>
        <dd className="m-0">{country.capitals.length > 0 ? country.capitals.map((c) => c.name).join(", ") : "Aucune"}</dd>
        <dt className="text-mute">Région</dt>
        <dd className="m-0">{country.region}</dd>
      </dl>
      {country.note && <p className="my-2.5 text-[13px] text-mute">{country.note}</p>}

      <DateField value={doc.dates[code] ?? ""} onChange={(date) => setCountryDate(code, date)} />
      <NotesField
        placeholder="Informations, analyses, sources…"
        value={doc.notes[code] ?? ""}
        onChange={(note) => setCountryNote(code, note)}
      />
      <Relations doc={doc} of={makeRef("c", code)} />
    </>
  );
}
