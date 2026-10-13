"use client";

import { useImperativeHandle, useRef } from "react";
import type { Ref } from "react";

export type TooltipHandle = {
  show: (text: string, clientX: number, clientY: number) => void;
  hide: () => void;
};

/**
 * Infobulle de survol. Elle est pilotée directement (textContent, position) pour ne provoquer
 * aucun re-rendu React pendant les déplacements de la souris.
 */
export default function Tooltip({ ref }: { ref: Ref<TooltipHandle> }) {
  const el = useRef<HTMLDivElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      show(text, clientX, clientY) {
        const tip = el.current;
        if (!tip) return;
        if (tip.textContent !== text) tip.textContent = text;
        tip.style.left = `${clientX + 14}px`;
        tip.style.top = `${clientY + 14}px`;
        tip.hidden = false;
      },
      hide() {
        if (el.current) el.current.hidden = true;
      },
    }),
    [],
  );
  return (
    <div
      ref={el}
      hidden
      role="tooltip"
      className="pointer-events-none fixed z-6 max-w-[min(420px,calc(100vw-28px))] rounded-[3px] border border-line bg-tip px-2 py-[3px] text-[13px]"
    />
  );
}
