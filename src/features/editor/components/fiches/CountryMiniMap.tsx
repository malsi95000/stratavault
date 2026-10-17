"use client";

import { useMemo } from "react";
import { displayColor, styleOf } from "@/features/map-doc/styles";
import { colorCss } from "@/features/map-doc/types";
import { miniMap } from "@/features/editor/miniMap";
import { useEditorStore } from "@/features/editor/store";
import { loadedWorld } from "@/features/editor/world";

/**
 * Mini-carte du pays ouvert, dans le coin de sa fiche : sa silhouette (à sa couleur sur la carte, sinon
 * couleur d'accent), ses voisins et un graticule. Purement décorative : ignorée des lecteurs d'écran.
 */
export default function CountryMiniMap({ code }: { code: string }) {
  // Le fond de carte est chargé avant qu'un pays puisse être ouvert (absent au rendu serveur).
  const world = loadedWorld();
  const map = useMemo(() => (world ? miniMap(world, code) : null), [world, code]);
  const color = useEditorStore((s) => displayColor(styleOf(s.doc, `c:${code}`), s.doc.categories));
  if (!map) return null;
  const fill = color ? colorCss(color) : "var(--color-acc)";

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${map.width} ${map.height}`}
      width={map.width}
      height={map.height}
      className="shrink-0 rounded border border-line bg-map-ocean"
    >
      <path d={map.graticule} className="fill-none stroke-map-graticule" strokeWidth={0.6} />
      <path d={map.context} className="fill-map-country stroke-map-border [stroke-linejoin:round]" strokeWidth={0.5} />
      <path d={map.country} className="stroke-ink [stroke-linejoin:round]" strokeWidth={0.7} style={{ fill }} />
      {map.marker && (
        <circle cx={map.marker[0]} cy={map.marker[1]} r={3.5} className="stroke-ink" strokeWidth={1} style={{ fill }} />
      )}
    </svg>
  );
}
