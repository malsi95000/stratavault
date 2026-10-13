import { memo, useMemo } from "react";
import { CAPITAL_MARKS } from "@/features/editor/world";
import { pointProjector } from "@/features/editor/projection";
import type { LayerProps } from "./shared";

/**
 * Un point par capitale de chaque entité (Tuvalu, Abkhazie, Ossétie du Sud et Transnistrie n'existent
 * sur la carte que par ce point). Rayon 2,4 px à l'écran (propriété CSS r divisée par --k, sans transform
 * qui ferait redessiner chaque point comme une image pendant le zoom), zone de clic élargie par un trait transparent.
 */
function CapitalsLayer({ projection }: Pick<LayerProps, "projection">) {
  const marks = useMemo(
    () => {
      // Points de la face cachée du globe : non rendus.
      const toScreen = pointProjector(projection);
      return CAPITAL_MARKS.flatMap((m) => {
        const xy = toScreen(m.ll);
        return xy ? [{ ...m, x: xy[0], y: xy[1] }] : [];
      });
    },
    [projection],
  );
  return (
    <g>
      {marks.map((m) => (
        <circle
          key={m.key}
          cx={m.x}
          cy={m.y}
          r={2.4}
          data-k="c"
          data-id={m.code}
          className="cursor-pointer fill-map-capital stroke-transparent [pointer-events:all] [r:calc(2.4px/var(--k,1))]"
          strokeWidth={8}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

export default memo(CapitalsLayer);
