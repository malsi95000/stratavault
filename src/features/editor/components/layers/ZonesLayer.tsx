import { memo, useMemo } from "react";
import { MIN_RING_POINTS, ZONE_LAYER_BUDGET, fitShape, shapeBudgets } from "@/features/editor/shapeBudget";
import { useEditorStore } from "@/features/editor/store";
import { selectVisibility } from "@/features/editor/storeFilters";
import { shown } from "./shared";
import type { ShapeLayerProps } from "./shared";

/**
 * Zones tracées au lasso (anneaux déjà orientés sur la plus petite surface, voir normalizeRing).
 * Anneaux préparés une fois (densifiés, bornés par ZONE_LAYER_BUDGET) : seule leur projection suit
 * la rotation du globe.
 */
function ZonesLayer({ shapePath }: ShapeLayerProps) {
  const zones = useEditorStore((s) => s.doc.zones);
  const selected = useEditorStore((s) => (s.selection?.k === "z" ? s.selection.id : null));
  const pending = useEditorStore((s) => s.pending);
  const visibility = useEditorStore(selectVisibility);
  const rings = useMemo(() => {
    const budgets = shapeBudgets(
      zones.map((z) => z.ring),
      ZONE_LAYER_BUDGET,
      MIN_RING_POINTS,
    );
    return zones.map((z, i) => ({ id: z.id, ring: fitShape(z.ring, budgets[i], MIN_RING_POINTS) }));
  }, [zones]);
  const shapes = useMemo(
    () =>
      // Zones écartées par le filtre : non rendues.
      rings.flatMap((z) =>
        shown(visibility, "z", z.id, selected)
          ? [{ id: z.id, d: shapePath({ type: "Polygon", coordinates: [z.ring] }) ?? "" }]
          : [],
      ),
    [rings, shapePath, visibility, selected],
  );
  return (
    <g>
      {shapes.map((z) => {
        const sel = z.id === selected;
        const pend = pending === `z:${z.id}`;
        // « En attente » l'emporte sur la sélection pour le contour ; le remplissage reste celui de la sélection.
        const fill = sel ? "fill-map-zone-selected" : "fill-map-zone";
        const stroke = pend ? "stroke-white [stroke-dasharray:5_3]" : sel ? "stroke-white" : "stroke-acc";
        return (
          <path
            key={z.id}
            d={z.d}
            data-k="z"
            data-id={z.id}
            className={`cursor-pointer ${fill} ${stroke}`}
            strokeWidth={sel || pend ? 2.4 : 1.6}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

export default memo(ZonesLayer);
