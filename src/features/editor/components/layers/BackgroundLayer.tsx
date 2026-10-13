import { memo, useMemo } from "react";
import { geoGraticule10 } from "d3";
import type { LayerProps } from "./shared";

// Calculé une fois : la vue globe redessine ce calque à chaque image de la rotation.
const GRATICULE = geoGraticule10();

/** Sphère (océan, disque en vue globe, bordé par map-edge) et graticule de 10°, coupé à l'horizon. */
function BackgroundLayer({ path }: Pick<LayerProps, "path">) {
  const sphere = useMemo(() => path({ type: "Sphere" }) ?? "", [path]);
  const graticule = useMemo(() => path(GRATICULE) ?? "", [path]);
  return (
    <g>
      <path d={sphere} className="fill-map-ocean stroke-map-edge" strokeWidth={1} />
      <path
        d={graticule}
        className="pointer-events-none fill-none stroke-map-graticule"
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

export default memo(BackgroundLayer);
