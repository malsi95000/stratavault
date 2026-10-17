"use client";

import { useEditorStore } from "@/features/editor/store";
import { cn } from "@/lib/utils";
import { BTN, FIELD, LABEL } from "./styles";

/** Catégorie d'un pays, d'un lien ou d'une fiche, choisie parmi celles de la carte (ou aucune). */
export default function CategoryField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (category: string | null) => void;
}) {
  const categories = useEditorStore((s) => s.doc.categories);
  const setCategoriesOpen = useEditorStore((s) => s.setCategoriesOpen);
  return (
    <div className="mt-3.5">
      <label className={cn(LABEL, "mt-0")}>
        Catégorie
        <select className={FIELD} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Aucune</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={cn(BTN, "mt-1.5 px-2 py-1 text-[13px]")} onClick={() => setCategoriesOpen(true)}>
        {categories.length === 0 ? "Créer une catégorie…" : "Gérer les catégories…"}
      </button>
    </div>
  );
}
