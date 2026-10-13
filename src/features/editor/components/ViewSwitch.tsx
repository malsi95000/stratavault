"use client";

import { GlobeIcon, MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MapView } from "@/features/editor/projection";
import { useViewStore } from "@/features/editor/viewStore";

const VIEWS: readonly { view: MapView; label: string; title: string; Icon: typeof MapIcon }[] = [
  { view: "planisphere", label: "Planisphère", title: "Planisphère : le monde à plat (projection Winkel tripel)", Icon: MapIcon },
  { view: "globe", label: "Globe", title: "Globe : glissez pour le faire tourner, molette pour zoomer", Icon: GlobeIcon },
];

/**
 * Choix de la vue de la carte, mémorisé dans ce navigateur. Dans un conteneur étroit (BottomBar, panneau
 * ouvert), seules les icônes restent visibles : le libellé reste lu par les lecteurs d'écran.
 */
export default function ViewSwitch() {
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  return (
    <div role="group" aria-label="Vue de la carte" className="flex gap-1">
      {VIEWS.map(({ view: value, label, title, Icon }) => (
        <Button
          key={value}
          type="button"
          variant="panel"
          size="panel"
          aria-pressed={view === value}
          title={title}
          onClick={() => setView(value)}
          className="aria-pressed:border-acc aria-pressed:bg-acc aria-pressed:text-on-acc"
        >
          <Icon aria-hidden="true" />
          <span className="@max-[16.5rem]:sr-only">{label}</span>
        </Button>
      ))}
    </div>
  );
}
