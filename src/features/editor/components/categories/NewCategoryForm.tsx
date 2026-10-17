"use client";

import { PlusIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nextCategoryColor } from "@/features/map-doc/categories";
import { MAX_CATEGORIES, MAX_CATEGORY_LABEL_LENGTH } from "@/features/map-doc/limits";
import type { MapColor } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import ColorField from "../fiches/ColorField";
import { dialogFallback, focusAfterAdd } from "./dialogFocus";

/**
 * Ajout d'une catégorie : nom et couleur (par défaut, la première couleur de la palette encore libre).
 * Après l'ajout, le focus va au champ du nom (le bouton « Ajouter », désactivé, le perdrait), ou au
 * titre de la fenêtre si le plafond est atteint (le formulaire disparaît).
 */
export default function NewCategoryForm() {
  const count = useEditorStore((s) => s.doc.categories.length);
  const suggested = useEditorStore((s) => nextCategoryColor(s.doc));
  const addCategory = useEditorStore((s) => s.addCategory);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<MapColor | null>(null);
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  if (count >= MAX_CATEGORIES) {
    return <p className="m-0 text-[13px] text-mute">Nombre maximal de catégories atteint ({MAX_CATEGORIES}).</p>;
  }

  return (
    <form
      className="grid gap-2 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        const form = e.currentTarget;
        if (addCategory(label, color ?? suggested)) {
          setLabel("");
          setColor(null);
          const countAfter = useEditorStore.getState().doc.categories.length;
          (focusAfterAdd(countAfter) === "name" ? nameRef.current : dialogFallback(form))?.focus();
        }
      }}
    >
      <Label htmlFor={nameId}>Nouvelle catégorie</Label>
      <div className="flex gap-2">
        <Input
          ref={nameRef}
          id={nameId}
          placeholder="Défense, énergie, diplomatie…"
          maxLength={MAX_CATEGORY_LABEL_LENGTH}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button type="submit" disabled={!label.trim()}>
          <PlusIcon aria-hidden="true" />
          Ajouter
        </Button>
      </div>
      <ColorField allowNone={false} value={color ?? suggested} onChange={(c) => c && setColor(c)} />
    </form>
  );
}
