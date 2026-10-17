"use client";

import { styleOf } from "@/features/map-doc/styles";
import type { ElementRef } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import CategoryField from "./CategoryField";
import ColorField from "./ColorField";
import { H3 } from "./styles";

/**
 * Couleur et catégorie d'un pays ou d'un lien, rendues sur la carte (remplissage du pays, couleur du
 * lien) en planisphère comme en globe. Sans couleur propre, l'élément prend celle de sa catégorie.
 */
export default function StyleFields({ of }: { of: ElementRef }) {
  const style = useEditorStore((s) => styleOf(s.doc, of));
  const setElementStyle = useEditorStore((s) => s.setElementStyle);
  return (
    <section aria-label="Apparence sur la carte">
      <h3 className={H3}>Sur la carte</h3>
      <CategoryField value={style?.category} onChange={(category) => setElementStyle(of, { category })} />
      <ColorField
        value={style?.color}
        emptyLabel={style?.category ? "Celle de la catégorie" : "Par défaut"}
        onChange={(color) => setElementStyle(of, { color })}
      />
    </section>
  );
}
