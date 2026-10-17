import { memo, useMemo } from "react";
import { DEFAULT_TEXT_SIZE } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import { selectVisibility } from "@/features/editor/storeFilters";
import { pointProjector } from "@/features/editor/projection";
import { shown } from "./shared";
import type { LayerProps } from "./shared";

/** Petits titres ancrés sur la carte ; ils grossissent avec le zoom (comme la bêta 1.6+). */
function TextsLayer({ projection }: Pick<LayerProps, "projection">) {
  const texts = useEditorStore((s) => s.doc.texts);
  const selected = useEditorStore((s) => (s.selection?.k === "t" ? s.selection.id : null));
  const pending = useEditorStore((s) => s.pending);
  const visibility = useEditorStore(selectVisibility);
  const placed = useMemo(
    () => {
      // Points de la face cachée du globe, et textes écartés par le filtre : non rendus.
      const toScreen = pointProjector(projection);
      return texts.flatMap((t) => {
        if (!shown(visibility, "t", t.id, selected)) return [];
        const xy = toScreen(t.ll);
        return xy ? [{ id: t.id, title: t.title, size: t.size ?? DEFAULT_TEXT_SIZE, x: xy[0], y: xy[1] }] : [];
      });
    },
    [texts, projection, visibility, selected],
  );
  return (
    <g>
      {placed.map((t) => {
        const sel = t.id === selected;
        const pend = pending === `t:${t.id}`;
        // Sans titre : italique, graisse 500, même sélectionné (seule la couleur passe au blanc).
        const font = t.title ? "font-semibold" : "font-medium italic";
        const fill = sel ? "fill-white" : t.title ? "fill-ink" : "fill-mute";
        return (
          <g key={t.id} transform={`translate(${t.x},${t.y})`} data-k="t" data-id={t.id} className="cursor-pointer">
            <circle r={2.6} className={`${sel || pend ? "fill-white" : "fill-acc"} stroke-bg`} strokeWidth={1} />
            <text
              x={7}
              y={4}
              className={`font-sans ${font} ${fill} stroke-bg [paint-order:stroke]`}
              strokeWidth={3}
              strokeLinejoin="round"
              style={{ fontSize: `${t.size}px`, lineHeight: 1 }}
            >
              {t.title || "(sans titre)"}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default memo(TextsLayer);
