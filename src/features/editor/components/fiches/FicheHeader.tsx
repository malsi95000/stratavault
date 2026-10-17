"use client";

import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { useEditorStore } from "@/features/editor/store";
import { cn } from "@/lib/utils";
import { BTN } from "./styles";

const ICON_BTN = cn(BTN, "grid size-9 shrink-0 place-items-center p-0 [&_svg]:size-4");

/**
 * En-tête d'une fiche : titre, boutons plein écran et fermeture, et sous-titre. Le titre reçoit le
 * focus quand la fiche s'ouvre à la place d'une autre (Panel.tsx). En plein écran, la barre du haut est
 * masquée : le statut d'enregistrement (conflit, échec…) est repris ici.
 */
export default function FicheHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const close = useEditorStore((s) => s.close);
  const expanded = useEditorStore((s) => s.panelExpanded);
  const setPanelExpanded = useEditorStore((s) => s.setPanelExpanded);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  return (
    <>
      <header className="mb-2 flex items-start gap-2">
        <h2 tabIndex={-1} data-focus-fallback="" className="brut m-0 flex-1 text-[26px] leading-[1.08] tracking-[.01em] break-words">
          {title}
        </h2>
        <button
          type="button"
          className={ICON_BTN}
          aria-pressed={expanded}
          aria-label="Plein écran"
          title={expanded ? "Quitter le plein écran (Échap)" : "Afficher la fiche en plein écran"}
          onClick={() => setPanelExpanded(!expanded)}
        >
          {expanded ? <Minimize2Icon aria-hidden="true" /> : <Maximize2Icon aria-hidden="true" />}
        </button>
        <button type="button" className={cn(BTN, "px-2.5 py-0.5 text-2xl leading-none")} aria-label="Fermer la fiche" onClick={close}>
          ×
        </button>
      </header>
      {expanded && saveStatus && (
        <p role="status" className="mt-0 mb-2 text-[13px] text-mute">
          {saveStatus}
        </p>
      )}
      {subtitle && <p className="mt-0 mb-2.5 text-mute">{subtitle}</p>}
    </>
  );
}
