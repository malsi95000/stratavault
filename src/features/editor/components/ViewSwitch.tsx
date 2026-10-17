"use client";

import { ChartGanttIcon, GlobeIcon, MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/features/editor/store";
import { useViewStore } from "@/features/editor/viewStore";
import type { EditorView } from "@/features/editor/viewStore";
import HelpButton from "./help/HelpButton";

const VIEWS: readonly { view: EditorView; label: string; title: string; Icon: typeof MapIcon }[] = [
  { view: "planisphere", label: "Planisphère", title: "Planisphère : le monde à plat (projection Winkel tripel)", Icon: MapIcon },
  { view: "globe", label: "Globe", title: "Globe : glissez pour le faire tourner, molette pour zoomer", Icon: GlobeIcon },
  { view: "frise", label: "Frise", title: "Frise : les fiches datées rangées de 1800 à 2100", Icon: ChartGanttIcon },
];

/** Change de vue ; vers la frise, le lien en cours (première extrémité choisie sur la carte) est annulé. */
function choose(view: EditorView) {
  if (view === "frise") useEditorStore.getState().cancelPending();
  useViewStore.getState().setView(view);
}

/**
 * Choix de la vue (planisphère, globe, frise), mémorisé dans ce navigateur. Dans un conteneur étroit
 * (BottomBar, panneau ouvert), seules les icônes restent visibles : le libellé reste lu par les lecteurs d'écran.
 * Le « ? » voisin affiche le tutoriel de la vue affichée.
 */
export default function ViewSwitch() {
  const view = useViewStore((s) => s.view);
  return (
    <div className="flex items-center gap-1">
      <div role="group" aria-label="Vue" className="flex gap-1">
        {VIEWS.map(({ view: value, label, title, Icon }) => (
          <Button
            key={value}
            type="button"
            variant="panel"
            size="panel"
            aria-pressed={view === value}
            title={title}
            onClick={() => choose(value)}
            className="aria-pressed:border-acc aria-pressed:bg-acc aria-pressed:text-on-acc"
          >
            <Icon aria-hidden="true" />
            <span className="@max-[19rem]:sr-only">{label}</span>
          </Button>
        ))}
      </div>
      {/* Tutoriel de la vue affichée (EDI-10) : planisphère, globe ou frise. */}
      <HelpButton topic={view} side="top" align="end" />
    </div>
  );
}
