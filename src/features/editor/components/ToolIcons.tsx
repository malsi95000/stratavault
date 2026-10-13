// Icônes de la barre d'outils et du menu des balises (SVG de la bêta, lignes 335-389).
import type { ReactNode } from "react";
import type { PingType } from "@/features/map-doc/types";
import type { Tool } from "@/features/editor/hints";

/** Icônes des outils : trait courant (couleur, épaisseur et jointures fixées par le bouton). */
export const TOOL_ICONS: Record<Tool, ReactNode> = {
  select: <path d="M5 3l14 8-6.5 1.8L9.5 19z" />,
  link: (
    <>
      <path d="M4 20l1-5L16 4l4 4L9 19z" />
      <path d="M14 6l4 4" />
    </>
  ),
  ping: (
    <>
      <path d="M12 21s-6-6.2-6-11a6 6 0 0112 0c0 4.8-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  flux: <path d="M4 18c3-8 6 1 9-7s5 1 7-5" />,
  lasso: (
    <>
      <path d="M12 3C6 3 3 7 4.5 11c1 3-2 3-1 6.5C4.3 20.5 8 21 10 19c1.3-1.3 2 .5 4-.5 3-1.5 3.5-4.5 2-7" />
      <circle cx="16.5" cy="16.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  texte: <path d="M5 5h14M12 5v14" />,
  gomme: (
    <>
      <path d="M16 3l5 5-9.5 9.5H6L3 14z" />
      <path d="M6 21h14" />
    </>
  ),
  point: <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />,
};

/** Icônes du menu des balises, aux couleurs de chaque type. */
export function PingTypeIcon({ type }: { type: PingType }) {
  switch (type) {
    case "maritime":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="fill-none stroke-ping-maritime" strokeLinecap="round">
          <path d="M3 15c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
          <path d="M3 10.5c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
        </svg>
      );
    case "entreprises":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="fill-ping-entreprises">
          <path d="M2 21V9l4 2.6V9l4 2.6V7l4 2.6V4l6 4v13z" />
        </svg>
      );
    case "armes":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="fill-ping-armes">
          <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
        </svg>
      );
    case "strategique":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="fill-none stroke-ping-strategique">
          <circle cx="12" cy="12" r="6.5" />
          <circle cx="12" cy="12" r="2" className="fill-ping-strategique stroke-none" />
        </svg>
      );
    case "crise":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <g className="fill-pin-outline">
            <path d="M4.1 3.1 5.8 1.5l9.6 9.6-1.7 1.7z" />
            <path d="m13.7 11.1 1.7-1.7 2.1 2.1-1.7 1.7z" />
            <path d="m15.8 13.2 1.7-1.7 2.4 2.4-1.7 1.7z" />
            <path d="m5.8 1.5 1.3-.3 9.1 9.1-.8.8z" />
            <path d="M19.9 3.1 18.2 1.5 8.6 11.1l1.7 1.7z" />
            <path d="m10.3 11.1-1.7-1.7-2.1 2.1 1.7 1.7z" />
            <path d="m8.2 13.2-1.7-1.7-2.4 2.4 1.7 1.7z" />
            <path d="m18.2 1.5-1.3-.3-9.1 9.1.8.8z" />
            <circle cx="16.95" cy="12.55" r=".7" className="fill-ping-crise" />
            <circle cx="7.05" cy="12.55" r=".7" className="fill-ping-crise" />
          </g>
        </svg>
      );
    case "base-militaire":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="fill-none stroke-current" strokeWidth={2}>
          <circle cx="12" cy="10" r="7" />
          <path d="M12 6v9m0 0-3-3m3 3 3-3" />
        </svg>
      );
  }
}
