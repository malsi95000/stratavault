// Fond de carte de l'aperçu, tiré du fond de l'éditeur (world-atlas) : terres fusionnées, géométrie
// et point d'ancrage de chaque pays. Calculé une fois par fond de carte chargé.
import { merge } from "topojson-client";
import type { MultiPolygon, Polygon } from "topojson-specification";
import { countryAnchorFor } from "@/features/editor/world";
import type { World } from "@/features/editor/world";
import type { PreviewWorld } from "./previewSvg";

const cache = new WeakMap<World, PreviewWorld>();

export function previewWorldOf(world: World): PreviewWorld {
  const cached = cache.get(world);
  if (cached) return cached;
  const { topology } = world;
  // Seules les surfaces se fusionnent (les géométries vides sont ignorées par merge).
  const surfaces = topology.objects.countries.geometries.filter(
    (g): g is Polygon<{ name: string }> | MultiPolygon<{ name: string }> => g.type === "Polygon" || g.type === "MultiPolygon",
  );
  const preview: PreviewWorld = {
    land: merge(topology, surfaces),
    featureByCode: world.featureByCode,
    countryAnchor: countryAnchorFor(world),
  };
  cache.set(world, preview);
  return preview;
}
