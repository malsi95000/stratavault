// Projection des géométries de l'aperçu : anneaux (surfaces) et lignes à l'écran, coupés et
// rééchantillonnés par d3 comme sur la carte.
import { geoStream } from "d3";
import type { GeoProjection, GeoStream } from "d3";
import type { GeoPermissibleObjects } from "d3";
import type { Pt } from "./pathData";

export type Projected = { rings: Pt[][]; lines: Pt[][] };

/** Anneaux et lignes de `object` une fois projetés (un anneau coupé à l'antiméridien en donne plusieurs). */
export function projectShapes(projection: GeoProjection, object: GeoPermissibleObjects): Projected {
  const out: Projected = { rings: [], lines: [] };
  let inPolygon = false;
  let current: Pt[] = [];
  const sink: GeoStream = {
    point(x, y) {
      if (Number.isFinite(x) && Number.isFinite(y)) current.push([x, y]);
    },
    lineStart() {
      current = [];
    },
    lineEnd() {
      (inPolygon ? out.rings : out.lines).push(current);
    },
    polygonStart() {
      inPolygon = true;
    },
    polygonEnd() {
      inPolygon = false;
    },
    sphere() {},
  };
  geoStream(object, projection.stream(sink));
  return out;
}
