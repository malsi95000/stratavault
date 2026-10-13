// Coût d'une image de rotation du globe : tracés des pays, du graticule, des liens et des flux.
// Cible (§13) : < 16 ms par image pendant un glisser (accepté : < 33 ms), plus la mise à jour du DOM.
// Les durées dépendent de la machine et de la charge (tests lancés en parallèle) : par défaut, seuls les
// gains relatifs sont vérifiés. Avec GLOBE_PERF=1, le test affiche les mesures et vérifie en plus les durées
// absolues : `GLOBE_PERF=1 npx vitest run src/features/editor/globePerformance.test.ts` (PowerShell :
// `$env:GLOBE_PERF=1; npx vitest run …`).
import { readFileSync } from "node:fs";
import { geoGraticule10, geoPath } from "d3";
import type { GeoProjection } from "d3";
import { beforeAll, describe, expect, it } from "vitest";
import { ROUTE_STEP_PX, globeView, onGround, routePath } from "./globe3d";
import { detailLevels, globeGeometries, restEpsilon } from "./globeDetail";
import { arcRoute, fluxRoute } from "./globeRoutes";
import type { DragView } from "./globeDetail";
import { globeRadius, makeProjection } from "./projection";
import { buildWorld, isWorldTopology } from "./world";
import type { CountryFeature } from "./world";
import type { LonLat } from "@/lib/geo";

const json: unknown = JSON.parse(readFileSync(new URL("../../../public/data/countries-50m.json", import.meta.url), "utf8"));
if (!isWorldTopology(json)) throw new Error("countries-50m.json illisible");
const world = buildWorld(json);
const levels = detailLevels(world);
const W = 1440;
const H = 900;
const graticule = geoGraticule10();
const PERF = Boolean(process.env.GLOBE_PERF);
/** Délai des mesures : des dizaines de rendus des 241 pays, plus lents quand toute la suite tourne. */
const TIMEOUT_MS = 60_000;
/** Images mesurées par cas (médiane). */
const FRAMES = 5;

type Pick = (projection: GeoProjection) => readonly (CountryFeature | null)[];
type Frame = (projection: GeoProjection) => void;

const rotations = Array.from({ length: FRAMES }, (_, i) => makeProjection(W, H, "globe", [i * 61 - 180, -20]));

/** Durée médiane (ms) d'une image : nouvelle rotation, puis le travail de l'image. */
function medianFrame(draw: Frame): number {
  const times = rotations.map((projection) => {
    const start = performance.now();
    draw(projection);
    return performance.now() - start;
  });
  return times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
}

/** Image du fond de carte : pays retenus et graticule. */
const countries =
  (pick: Pick): Frame =>
  (projection) => {
    const path = geoPath(projection);
    for (const f of pick(projection)) if (f) path(f);
    path(graticule);
  };

/** Glisser au zoom k, centré sur le milieu de l'écran. */
const dragAt = (k: number): DragView => ({
  k,
  viewport: { x: (W - W / k) / 2, y: (H - H / k) / 2, width: W / k, height: H / k },
});

// Grande carte : 300 liens et 20 flux de 500 points tracés au zoom 1 (un point tous les ~3 px), ombres comprises.
const anchors: LonLat[] = Array.from({ length: 60 }, (_, i) => [((i * 47) % 360) - 180, ((i * 29) % 140) - 70]);
const arcs = Array.from({ length: 300 }, (_, i) => arcRoute(anchors[i % 60], anchors[(i * 7 + 1) % 60]));
const fluxes = Array.from({ length: 20 }, (_, f) =>
  fluxRoute(Array.from({ length: 500 }, (_, i): LonLat => [f * 15 - 150 + i * 0.3, Math.sin(i / 20) * 8 + f])),
);
const routes = [...arcs, ...fluxes].flatMap((route) => [route, onGround(route)]);
const drawRoutes: Frame = (projection) => {
  const view = globeView(projection, ROUTE_STEP_PX);
  for (const route of routes) routePath(route, view);
};

const allCountries = countries(() => world.shapes.map((s) => s.feature));
const dragCountries = (k: number) => countries((p) => globeGeometries(levels, p, dragAt(k)));

describe("fluidité de la rotation du globe", () => {
  // Référence mesurée dans les mêmes conditions : les 241 pays en pleine résolution.
  let full = 0;
  beforeAll(() => {
    allCountries(rotations[0]); // préchauffage
    full = medianFrame(allCountries);
  }, TIMEOUT_MS);

  it(
    "une image de glisser coûte beaucoup moins qu'un rendu en pleine résolution",
    () => {
      const measures: Record<string, number> = {
        "glisser, zoom 1": medianFrame(dragCountries(1)),
        "glisser, zoom 4": medianFrame(dragCountries(4)),
        "glisser, zoom 16": medianFrame(dragCountries(16)),
      };
      if (PERF) {
        measures["repos, zoom 1 : face visible"] = medianFrame(
          countries((p) => globeGeometries(levels, p, null, restEpsilon(globeRadius(W, H), 1))),
        );
        console.table([["pleine résolution, tous les pays", full], ...Object.entries(measures)].map(([cas, ms]) => ({ cas, ms: +(+ms).toFixed(1) })));
      }
      for (const k of [1, 4, 16]) expect(measures[`glisser, zoom ${k}`]).toBeLessThan(full / 2.5);
    },
    TIMEOUT_MS,
  );

  it(
    "une image complète de rotation (pays, graticule, 300 arcs et 20 longs flux) tient dans le budget",
    () => {
      const routesOnly = medianFrame(drawRoutes);
      const total = medianFrame((p) => {
        dragCountries(1)(p);
        drawRoutes(p);
      });
      if (PERF) console.log(`liens et flux : ${routesOnly.toFixed(1)} ms ; image complète : ${total.toFixed(1)} ms`);
      expect(routesOnly).toBeLessThan(full / 3);
      expect(total).toBeLessThan(full / 2);
      if (PERF) expect(total).toBeLessThan(33);
    },
    TIMEOUT_MS,
  );
});
