"use client";

import { HINT_FRISE, toolHint } from "@/features/editor/hints";
import { useEditorStore } from "@/features/editor/store";
import { useViewStore } from "@/features/editor/viewStore";

/** Barre d'aide en bas : message ponctuel, sinon le texte de l'outil courant (selon la vue), ou celui de la frise. */
export default function Hint({ className = "" }: { className?: string }) {
  const view = useViewStore((s) => s.view);
  const text = useEditorStore((s) => s.hint ?? (view === "frise" ? HINT_FRISE : toolHint(s.tool, view === "globe")));
  return (
    <div
      aria-live="polite"
      className={`max-w-[calc(100vw-120px)] rounded border border-line bg-panel px-3.5 py-[7px] text-center text-mute max-sm:text-[13px] ${className}`}
    >
      {text}
    </div>
  );
}
