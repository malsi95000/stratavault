"use client";

import { ArrowLeftIcon } from "lucide-react";
import { findExtraFiche } from "@/features/map-doc/fiches";
import { nameOfElement, parseElementRef } from "@/features/map-doc/refs";
import { MAX_TITLE_LENGTH } from "@/features/map-doc/types";
import type { ElementRef } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import { cn } from "@/lib/utils";
import CategoryField from "./CategoryField";
import ColorField from "./ColorField";
import CountryMiniMap from "./CountryMiniMap";
import { DateField, DeleteButton, NotesField, TitleField } from "./fields";
import FicheHeader from "./FicheHeader";
import { extraFicheTitle } from "./format";
import { BTN } from "./styles";
import { DELETE_EXTRA_FICHE_CONFIRM } from "./texts";

/**
 * Fiche supplémentaire d'un élément (pays, lien…), ouverte à la place de sa fiche principale : titre,
 * date, notes, couleur, catégorie et suppression (avec confirmation).
 */
export default function ExtraFicheView({ owner, ficheId }: { owner: ElementRef; ficheId: string }) {
  const doc = useEditorStore((s) => s.doc);
  const updateExtraFiche = useEditorStore((s) => s.updateExtraFiche);
  const removeExtraFiche = useEditorStore((s) => s.removeExtraFiche);
  const openExtraFiche = useEditorStore((s) => s.openExtraFiche);
  const found = findExtraFiche(doc, ficheId);
  if (!found || found.owner !== owner) return null;
  const { fiche } = found;
  const parts = parseElementRef(owner);

  return (
    <>
      <FicheHeader title={extraFicheTitle(fiche)} subtitle={`Fiche de ${nameOfElement(doc, owner)}`} />
      {/* Fiche d'un pays : sa mini-carte reste dans le coin, comme sur la fiche principale. */}
      <div className="flex items-start justify-between gap-3">
        <button type="button" className={cn(BTN, "inline-flex items-center gap-1.5 text-[13px]")} onClick={() => openExtraFiche(null)}>
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Fiche principale
        </button>
        {parts?.k === "c" && <CountryMiniMap code={parts.id} />}
      </div>
      <TitleField
        placeholder="Événement, analyse, source…"
        maxLength={MAX_TITLE_LENGTH}
        value={fiche.title}
        onChange={(title) => updateExtraFiche(ficheId, { title })}
      />
      <DateField value={fiche.date ?? ""} onChange={(date) => updateExtraFiche(ficheId, { date })} />
      <NotesField
        placeholder="Informations, analyses, sources…"
        value={fiche.note}
        onChange={(note) => updateExtraFiche(ficheId, { note })}
      />
      <CategoryField value={fiche.category} onChange={(category) => updateExtraFiche(ficheId, { category })} />
      <ColorField
        value={fiche.color}
        emptyLabel={fiche.category ? "Celle de la catégorie" : "Aucune"}
        onChange={(color) => updateExtraFiche(ficheId, { color })}
      />
      <DeleteButton
        label="Supprimer cette fiche"
        confirmText={DELETE_EXTRA_FICHE_CONFIRM}
        onConfirm={() => removeExtraFiche(ficheId)}
      />
    </>
  );
}
