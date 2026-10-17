"use client";

import { Fragment } from "react";
import { dialogs } from "@/components/dialogs";
import { cn } from "@/lib/utils";
import { MAX_NOTE_LENGTH } from "@/features/map-doc/types";
import { BTN, FIELD, LABEL } from "./styles";

/** Champ titre d'une fiche (« Titre », « Nature de la relation », « Titre affiché »). */
export function TitleField({
  label = "Titre",
  value,
  placeholder,
  maxLength = 80,
  onChange,
}: {
  label?: string;
  value: string;
  placeholder: string;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className={LABEL}>
      {label}
      <input
        type="text"
        className={FIELD}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function DateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className={LABEL}>
      Date
      <input type="date" className={FIELD} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function NotesField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={LABEL}>
      Notes
      <textarea
        className={`${FIELD} min-h-[200px] resize-y in-data-[expanded=true]:min-h-[45vh]`}
        placeholder={placeholder}
        maxLength={MAX_NOTE_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/**
 * Bouton de suppression : demande confirmation (texte de la bêta) avant d'agir. Le texte peut être
 * calculé au clic (nombre de fiches supplémentaires emportées, par exemple).
 */
export function DeleteButton({
  label,
  confirmText,
  onConfirm,
}: {
  label: string;
  confirmText: string | (() => string);
  onConfirm: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(BTN, "mt-[18px] border-danger-line text-danger hover:border-danger")}
      onClick={async () => {
        const text = typeof confirmText === "function" ? confirmText() : confirmText;
        if (await dialogs.confirm(text, { confirmLabel: "Supprimer", destructive: true })) onConfirm();
      }}
    >
      {label}
    </button>
  );
}

/** Liste de définitions en tête de fiche (Position, Catégorie…). */
export function Facts({ items }: { items: readonly [string, string][] }) {
  return (
    <dl className="my-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {items.map(([term, value]) => (
        <Fragment key={term}>
          <dt className="text-mute">{term}</dt>
          <dd className="m-0">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
