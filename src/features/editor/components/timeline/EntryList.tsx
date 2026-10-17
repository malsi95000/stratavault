"use client";

import type { MapDoc } from "@/features/map-doc/types";
import type { Entry } from "@/features/timeline/entries";
import { entryContext, entryDate, entryTitle } from "@/features/timeline/labels";
import { entryColor } from "./entryColor";

/** Au-delà, la liste est tronquée (une carte peut porter des milliers de fiches). */
export const LIST_LIMIT = 100;

/** Liste de fiches cliquables (groupe de la frise, fiches sans date) : chacune ouvre sa fiche. */
export default function EntryList({
  doc,
  entries,
  currentKey,
  onOpen,
}: {
  doc: MapDoc;
  entries: readonly Entry[];
  currentKey: string | null;
  onOpen: (entry: Entry) => void;
}) {
  const shown = entries.slice(0, LIST_LIMIT);
  return (
    <>
      <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
        {shown.map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              aria-current={entry.key === currentKey || undefined}
              className="flex w-full cursor-pointer items-start gap-2 rounded border border-transparent px-2 py-1.5 text-left hover:border-line hover:bg-hover focus-visible:outline-2 focus-visible:outline-acc aria-current:border-ink"
              onClick={() => onOpen(entry)}
            >
              <span
                aria-hidden="true"
                className="mt-1 size-2.5 shrink-0 rounded-full border border-swatch-edge"
                style={{ background: entryColor(entry) }}
              />
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">{entryTitle(doc, entry)}</span>
                <span className="block truncate text-[11px] text-mute">
                  {entryDate(entry)} · {entryContext(doc, entry)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {entries.length > shown.length && (
        <p className="m-0 mt-1 text-[12px] text-mute">… et {entries.length - shown.length} autres.</p>
      )}
    </>
  );
}
