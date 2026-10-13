// d3-geo-projection ne publie pas de types : on déclare ce qu'on utilise.
declare module "d3-geo-projection" {
  import type { GeoProjection } from "d3-geo";

  export function geoWinkel3(): GeoProjection;
}
