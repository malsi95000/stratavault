// Contours des continents sur un planisphère en Winkel tripel (la projection de l'éditeur), avec son
// graticule, très simplifiés : terres de Natural Earth au 1:110 000 000 (world-atlas), comme la carte.
import { geoGraticule, type GeoPermissibleObjects } from "d3";
import { geoWinkel3 } from "d3-geo-projection";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import landTopology from "world-atlas/land-110m.json";
import { linePath, ringPath } from "@/features/bank/preview/pathData";
import { projectShapes } from "@/features/bank/preview/project";
import type { BackdropLayer } from "./types";

export type CoastlineOptions = {
  width: number;
  height: number;
  /** Marge autour de la sphère (unités du dessin). */
  margin: number;
};

const topology = landTopology as unknown as Topology<{ land: GeometryCollection }>;

/** Terres émergées (GeoJSON) tirées du TopoJSON de world-atlas. */
export const land = (): GeoPermissibleObjects => feature(topology, topology.objects.land);

export function coastlineLayers({ width, height, margin }: CoastlineOptions): BackdropLayer[] {
  const projection = geoWinkel3().fitExtent(
    [
      [margin, margin],
      [width - margin, height - margin],
    ],
    { type: "Sphere" },
  );
  const coasts = projectShapes(projection, land());
  const graticule = projectShapes(projection, geoGraticule().step([20, 20])());
  const sphere = projectShapes(projection, { type: "Sphere" });
  return [
    { tone: "line", d: graticule.lines.map((line) => linePath(line, { tolerance: 1 })).join(""), dash: "2 6" },
    { tone: "line", d: sphere.rings.map((ring) => ringPath(ring, { tolerance: 1 })).join("") },
    { tone: "strong", d: coasts.rings.map((ring) => ringPath(ring, { tolerance: 1.6, minArea: 40 })).join("") },
  ];
}
