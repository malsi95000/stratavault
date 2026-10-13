"use client";

import { useEditorStore } from "@/features/editor/store";
import { cn } from "@/lib/utils";
import { BTN } from "./styles";

/** En-tête d'une fiche : titre, bouton de fermeture et sous-titre. */
export default function FicheHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const close = useEditorStore((s) => s.close);
  return (
    <>
      <header className="mb-2 flex items-start gap-2">
        <h2 className="brut m-0 flex-1 text-[26px] leading-[1.08] tracking-[.01em] break-words">{title}</h2>
        <button type="button" className={cn(BTN, "px-2.5 py-0.5 text-2xl leading-none")} aria-label="Fermer la fiche" onClick={close}>
          ×
        </button>
      </header>
      {subtitle && <p className="mt-0 mb-2.5 text-mute">{subtitle}</p>}
    </>
  );
}
