"use client";

import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { dialogs } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findCategory } from "@/features/map-doc/categories";
import { MAX_CATEGORY_LABEL_LENGTH } from "@/features/map-doc/limits";
import { colorCss } from "@/features/map-doc/types";
import type { Category } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import { colorName } from "../ColorSwatches";
import ColorField from "../fiches/ColorField";
import { removeCategoryConfirm } from "./texts";

/**
 * Touche qui enregistre le nom saisi sans quitter le champ : Entrée. Échap ferme la fenêtre, qui fait
 * d'abord quitter le champ (leaveFieldOnEscape) : le nom est alors enregistré par onBlur.
 */
export const commitsLabel = (key: string) => key === "Enter";

/** Une catégorie de la carte : couleur (palette dépliable), nom (enregistré en quittant le champ) et suppression. */
export default function CategoryRow({ category }: { category: Category }) {
  const updateCategory = useEditorStore((s) => s.updateCategory);
  const removeCategory = useEditorStore((s) => s.removeCategory);
  const [draft, setDraft] = useState(category.label);
  const [picking, setPicking] = useState(false);

  // Le nom est enregistré à la sortie du champ (ou Entrée) : l'enregistrer à chaque frappe retirerait
  // l'espace tapé en fin de saisie. Le champ reprend ensuite le nom tel qu'il a été enregistré.
  function commit() {
    if (draft === category.label) return;
    updateCategory(category.id, { label: draft });
    setDraft(findCategory(useEditorStore.getState().doc, category.id)?.label ?? draft);
  }

  async function remove() {
    const ok = await dialogs.confirm(removeCategoryConfirm(useEditorStore.getState().doc, category), {
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (ok) removeCategory(category.id);
  }

  return (
    <li className="grid gap-2 rounded-md border border-line p-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={picking}
          aria-label={`Couleur de la catégorie ${category.label} : ${colorName(category.color)}`}
          title="Changer la couleur"
          className="size-7 shrink-0 cursor-pointer rounded-full border border-swatch-edge outline-offset-2 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-acc aria-expanded:outline-2 aria-expanded:outline-ink aria-expanded:focus-visible:outline-3 aria-expanded:focus-visible:outline-acc"
          style={{ background: colorCss(category.color) }}
          onClick={() => setPicking((p) => !p)}
        />
        <Input
          aria-label="Nom de la catégorie"
          maxLength={MAX_CATEGORY_LABEL_LENGTH}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (commitsLabel(e.key)) commit();
          }}
        />
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Supprimer la catégorie ${category.label}`} onClick={remove}>
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>
      {picking && (
        <ColorField
          allowNone={false}
          value={category.color}
          onChange={(color) => {
            if (color) updateCategory(category.id, { color });
          }}
        />
      )}
    </li>
  );
}
