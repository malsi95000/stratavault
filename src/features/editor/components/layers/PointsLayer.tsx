import { memo, useMemo } from "react";
import { useEditorStore } from "@/features/editor/store";
import { selectVisibility } from "@/features/editor/storeFilters";
import { pointProjector } from "@/features/editor/projection";
import { COUNTER_SCALE, shown } from "./shared";
import type { LayerProps } from "./shared";

/** Points discrets (villes, lieux), taille constante à l'écran. */
function PointsLayer({ projection }: Pick<LayerProps, "projection">) {
  const points = useEditorStore((s) => s.doc.points);
  const selected = useEditorStore((s) => (s.selection?.k === "o" ? s.selection.id : null));
  const pending = useEditorStore((s) => s.pending);
  const visibility = useEditorStore(selectVisibility);
  const placed = useMemo(
    () => {
      // Points de la face cachée du globe, et points écartés par le filtre : non rendus.
      const toScreen = pointProjector(projection);
      return points.flatMap((p) => {
        if (!shown(visibility, "o", p.id, selected)) return [];
        const xy = toScreen(p.ll);
        return xy ? [{ id: p.id, title: p.title, x: xy[0], y: xy[1] }] : [];
      });
    },
    [points, projection, visibility, selected],
  );
  return (
    <g>
      {placed.map((p) => {
        const sel = p.id === selected;
        // Extrémité d'un lien en cours : contour blanc épais (le point est déjà de la couleur d'accent).
        const pend = pending === `o:${p.id}`;
        return (
          <g key={p.id} transform={`translate(${p.x},${p.y})`}>
            <g data-k="o" data-id={p.id} aria-label={p.title || "Point"} className="cursor-pointer" style={COUNTER_SCALE}>
              <circle
                r={5}
                className={`${sel ? "fill-white" : "fill-acc"} ${pend || sel ? "stroke-white" : "stroke-pin-outline"}`}
                strokeWidth={pend ? 2.6 : sel ? 2 : 1.1}
              />
            </g>
          </g>
        );
      })}
    </g>
  );
}

export default memo(PointsLayer);
