"use client";

import type { ReactNode } from "react";
import { relationsOf } from "@/features/map-doc/ops";
import { nameOfRef, parseRef } from "@/features/map-doc/refs";
import type { MapDoc, Ref } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import { BTN, H3 } from "./styles";

const ROW = `${BTN} w-full text-left`;

/** Bouton qui ouvre la fiche d'une extrémité de lien, sans fermer le panneau. */
function OpenRef({ doc, target, children }: { doc: MapDoc; target: Ref; children?: ReactNode }) {
  const open = useEditorStore((s) => s.open);
  const parts = parseRef(target);
  return (
    <button type="button" className={ROW} disabled={!parts} onClick={() => parts && open(parts.k, parts.id)}>
      {children ?? nameOfRef(doc, target)}
    </button>
  );
}

/** « Relations tracées » : l'autre extrémité de chaque lien rattaché à `of` (bêta, relList). */
export default function Relations({ doc, of }: { doc: MapDoc; of: Ref }) {
  const relations = relationsOf(doc, of);
  return (
    <>
      <h3 className={H3}>Relations tracées</h3>
      <ul className="m-0 grid list-none gap-1 p-0">
        {relations.length === 0 ? (
          <li className="text-mute">Aucune relation pour l’instant.</li>
        ) : (
          relations.map(({ link, other }) => (
            <li key={link.id}>
              <OpenRef doc={doc} target={other}>
                {nameOfRef(doc, other)}
                {link.title ? ` – ${link.title}` : ""}
              </OpenRef>
            </li>
          ))
        )}
      </ul>
    </>
  );
}

/** « Ouvrir la fiche de » : les deux extrémités d'un lien. */
export function LinkEnds({ doc, a, b }: { doc: MapDoc; a: Ref; b: Ref }) {
  return (
    <>
      <h3 className={H3}>Ouvrir la fiche de</h3>
      <ul className="m-0 grid list-none gap-1 p-0">
        <li>
          <OpenRef doc={doc} target={a} />
        </li>
        <li>
          <OpenRef doc={doc} target={b} />
        </li>
      </ul>
    </>
  );
}
