"use client";

import { useRef } from "react";
import { returnFocusTarget } from "@/components/dialogs/useCloseAutoFocus";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorStore } from "@/features/editor/store";
import HelpButton from "../help/HelpButton";
import CategoryRow from "./CategoryRow";
import { leaveFieldOnEscape } from "./dialogFocus";
import NewCategoryForm from "./NewCategoryForm";
import { CATEGORIES_DESCRIPTION, CATEGORIES_TITLE } from "./texts";

/**
 * Petit panneau des catégories de la carte : créer, renommer, changer la couleur, supprimer. Ouvert
 * depuis la barre du haut ou le champ « Catégorie » d'une fiche.
 */
export default function CategoriesDialog() {
  const open = useEditorStore((s) => s.categoriesOpen);
  const setOpen = useEditorStore((s) => s.setCategoriesOpen);
  const categories = useEditorStore((s) => s.doc.categories);
  // Ouverte par code (barre du haut, champ « Catégorie ») : Radix ne connaît pas le déclencheur. On le
  // mémorise à l'ouverture (avant que le focus n'entre dans la fenêtre) pour lui rendre le focus.
  const opener = useRef<Element | null>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* data-focus-scope : quand une ligne supprimée emporte le bouton qui avait le focus, le titre
          (data-focus-fallback) le reprend, et la fenêtre ouverte garde le focus (returnFocusTarget). */}
      <DialogContent
        data-focus-scope=""
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 sm:max-w-lg"
        onOpenAutoFocus={() => {
          opener.current = document.activeElement;
        }}
        onEscapeKeyDown={() => leaveFieldOnEscape(document.activeElement)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const trigger = opener.current;
          returnFocusTarget({ trigger, scope: trigger?.closest("[data-focus-scope]") ?? null })?.focus();
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle tabIndex={-1} data-focus-fallback="" className="brut text-xl">
              {CATEGORIES_TITLE}
            </DialogTitle>
            <HelpButton topic="categories" side="bottom" align="start" />
          </div>
          <DialogDescription>{CATEGORIES_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 overflow-y-auto px-1">
          {categories.length === 0 ? (
            <p className="m-0 text-[13px] text-mute">Aucune catégorie pour l’instant.</p>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {categories.map((c) => (
                <CategoryRow key={c.id} category={c} />
              ))}
            </ul>
          )}
        </div>
        <NewCategoryForm />
      </DialogContent>
    </Dialog>
  );
}
