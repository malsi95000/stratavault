"use client";

import { useState } from "react";
import { BTN } from "@/features/editor/components/fiches/styles";
import { frenchDate } from "@/features/editor/components/fiches/format";
import type { Selection } from "@/features/map-doc/types";
import { cn } from "@/lib/utils";
import {
  COUNTRY_FICHE_NOTE,
  FLUX_FICHE_NOTE,
  OWN_ITEM,
  OWN_ITEM_PENDING,
  REPORT_BUTTON,
  contributedBy,
} from "../messages";
import type { CollectiveSession } from "../session/collectiveSession";
import BlockAuthorButton from "./BlockAuthorButton";
import ReportDialog from "./ReportDialog";

type Props = {
  session: CollectiveSession;
  userId: string;
  selection: Selection;
  /** Version de ce que la session connaît (relue à chaque changement). */
  version: number;
};

/**
 * En tête de la fiche d'un élément de la carte collective : son auteur (nom affiché, que d'autres
 * membres peuvent porter, et identifiant public, unique) et sa date d'ajout, et les boutons « Signaler » et « Bloquer l'auteur » pour l'élément d'un autre membre. Pays : leurs fiches ne se
 * modifient pas ici.
 */
export default function ContributionInfo({ session, userId, selection }: Props) {
  const [reporting, setReporting] = useState(false);
  if (selection.k === "c") return <p className="mt-0 mb-3 text-[13px] text-mute">{COUNTRY_FICHE_NOTE}</p>;
  const authorship = session.authorship(selection.k, selection.id);
  if (!authorship) return null;
  const date = authorship.createdAt ? frenchDate(authorship.createdAt.slice(0, 10)) : "";
  const label = authorship.mine
    ? authorship.createdAt
      ? OWN_ITEM
      : OWN_ITEM_PENDING
    : contributedBy(authorship.authorName, authorship.authorHandle);

  return (
    <div className="mb-3 grid gap-1.5 border-b border-line pb-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-ink">
          {label}
          {date && <span className="text-mute"> · {date}</span>}
        </span>
        {!authorship.mine && (
          <button type="button" className={cn(BTN, "px-2 py-1 text-[13px]")} onClick={() => setReporting(true)}>
            {REPORT_BUTTON}
          </button>
        )}
        {!authorship.mine && (
          <BlockAuthorButton
            userId={userId}
            itemId={selection.id}
            authorHandle={authorship.authorHandle}
            onBlocked={() => session.reload()}
          />
        )}
      </div>
      {selection.k === "flux" && <p className="m-0 text-mute">{FLUX_FICHE_NOTE}</p>}
      {reporting && <ReportDialog userId={userId} itemId={selection.id} open={reporting} onOpenChange={setReporting} />}
    </div>
  );
}
