"use client";

import { TagsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/features/editor/store";

/** « Catégories » : ouvre le panneau des catégories de la carte (créer, renommer, couleur, supprimer). */
export default function CategoriesButton() {
  const hydrated = useEditorStore((s) => s.hydrated);
  const setCategoriesOpen = useEditorStore((s) => s.setCategoriesOpen);
  // Avant le chargement, une catégorie créée serait remplacée par la carte enregistrée.
  return (
    <Button variant="panel" size="panel" title="Catégories" disabled={!hydrated} onClick={() => setCategoriesOpen(true)}>
      <TagsIcon aria-hidden="true" />
      {/* Libellé masqué visuellement sous xl (reste le nom accessible) : la barre tient en 1024 px. */}
      <span className="max-xl:sr-only">Catégories</span>
    </Button>
  );
}
