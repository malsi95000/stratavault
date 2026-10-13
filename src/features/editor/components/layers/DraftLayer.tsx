import { memo, useMemo } from "react";
import { DEFAULT_FLUX_OPACITY, FLUX_TOKENS, FLUX_WIDTH_FACTOR } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import type { LayerProps } from "./shared";

/** Tracé en cours (store : drawing) : contour du lasso, ou trait du pinceau flux. */
function DraftLayer({ path }: Pick<LayerProps, "path">) {
  const draft = useEditorStore((s) => s.drawing);
  const d = useMemo(
    () => (draft && draft.points.length > 1 ? path({ type: "LineString", coordinates: draft.points.map((p) => [p[0], p[1]]) }) : null),
    [draft, path],
  );
  if (!draft || !d) return null;
  if (draft.kind === "lasso") {
    return (
      <path
        d={d}
        className="pointer-events-none fill-map-zone-draft stroke-acc [stroke-dasharray:4_3]"
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  return (
    <path
      d={d}
      className="pointer-events-none fill-none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={draft.width * FLUX_WIDTH_FACTOR}
      style={{ stroke: `var(${FLUX_TOKENS[draft.color]})`, strokeOpacity: DEFAULT_FLUX_OPACITY }}
    />
  );
}

export default memo(DraftLayer);
