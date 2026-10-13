import { geoDistance } from "d3";
import { describe, expect, it } from "vitest";
import type { LonLat } from "@/lib/geo";
import { globeView, isOccluded, routePath, toLonLat, toViewSpace, visibleRuns } from "./globe3d";
import {
  ARC_LAYER_BUDGET,
  ARC_MAX_ALTITUDE,
  FLUX_ALTITUDE,
  FLUX_LAYER_BUDGET,
  FLUX_MAX_STEP_DEG,
  FLUX_MIN_STEP_DEG,
  FLUX_ROUTE_BUDGET,
  FLUX_SMOOTHING_BUDGET,
  arcAltitude,
  arcRoute,
  arcSegmentCap,
  densifyRoute,
  fluxBudgets,
  fluxRoute,
  smoothRoute,
  thinRoute,
} from "./globeRoutes";
import { makeProjection, rotationCenteredOn } from "./projection";

const PARIS: LonLat = [2.35, 48.86];
const NEW_YORK: LonLat = [-74, 40.71];
const TOKYO: LonLat = [139.69, 35.69];
const degrees = (a: LonLat, b: LonLat) => (geoDistance(a, b) * 180) / Math.PI;

describe("arcs aériens des liens", () => {
  it("altitude proportionnelle à la distance, bornée", () => {
    expect(arcAltitude(0)).toBe(0);
    expect(arcAltitude(0.5)).toBeCloseTo(2 * arcAltitude(0.25), 12);
    expect(arcAltitude(geoDistance(PARIS, NEW_YORK))).toBeGreaterThan(0.1);
    expect(arcAltitude(Math.PI)).toBe(ARC_MAX_ALTITUDE);
  });

  it("part du sol, culmine à mi-parcours (profil sin(πt)) et revient au sol", () => {
    const route = arcRoute(PARIS, NEW_YORK);
    const peak = arcAltitude(geoDistance(PARIS, NEW_YORK));
    expect(route[0].r).toBe(1);
    expect(route[route.length - 1].r).toBeCloseTo(1, 12);
    const mid = route[Math.floor(route.length / 2)];
    expect(mid.r).toBeCloseTo(1 + peak, 2);
    expect(Math.max(...route.map((p) => p.r))).toBeCloseTo(1 + peak, 2);
    const quarter = route[Math.round((route.length - 1) / 4)];
    expect(quarter.r - 1).toBeCloseTo(peak * Math.sin(Math.PI / 4), 2);
  });

  it("suit le grand cercle entre les deux ancres", () => {
    const route = arcRoute(PARIS, TOKYO);
    const first = toLonLat(route[0].v);
    const last = toLonLat(route[route.length - 1].v);
    expect(degrees(first, PARIS)).toBeLessThan(1e-6);
    expect(degrees(last, TOKYO)).toBeLessThan(1e-6);
    // Chaque point est sur le grand cercle : d(P, X) + d(X, T) = d(P, T).
    for (const p of route) {
      const ll = toLonLat(p.v);
      expect(degrees(PARIS, ll) + degrees(ll, TOKYO)).toBeCloseTo(degrees(PARIS, TOKYO), 6);
    }
    // Pas de 2° au plus.
    for (let i = 1; i < route.length; i++) expect(degrees(toLonLat(route[i - 1].v), toLonLat(route[i].v))).toBeLessThanOrEqual(2.0001);
  });

  it("rien pour des extrémités confondues ou antipodales", () => {
    expect(arcRoute(PARIS, PARIS)).toEqual([]);
    expect(arcRoute([0, 0], [180, 0])).toEqual([]);
  });

  it("un arc haut reste visible au-delà de l'horizon, là où son ombre au sol est cachée", () => {
    // Tokyo est à ~99° du centre du globe : la fin du grand cercle au sol est cachée, pas celle de l'arc.
    const view = globeView(makeProjection(1280, 800, "globe", rotationCenteredOn([-40, 45])));
    const route = arcRoute(PARIS, TOKYO);
    const air = route.map((p) => toViewSpace(p, view));
    const ground = route.map((p) => toViewSpace({ v: p.v, r: 1 }, view));
    const visibleCount = (points: typeof air) => visibleRuns(points).reduce((n, run) => n + run.length, 0);
    expect(ground.some(isOccluded)).toBe(true);
    expect(visibleCount(air)).toBeGreaterThan(visibleCount(ground));
    expect(routePath(route, view)).not.toBe("");
  });
});

describe("flux sur le globe", () => {
  it("thinRoute retire les tremblements, garde les extrémités", () => {
    const shaky: LonLat[] = [[0, 0], [0.01, 0], [0.02, 0.01], [1, 0], [1.01, 0], [2, 0]];
    expect(thinRoute(shaky, 0.05)).toEqual([[0, 0], [1, 0], [2, 0]]);
    expect(thinRoute([[0, 0], [0.01, 0]], 0.05)).toEqual([[0, 0], [0.01, 0]]);
  });

  it("un flux tracé au zoom 40 garde ses détails (le pinceau y enregistre un point tous les ~0,012°)", () => {
    const wiggle: LonLat[] = Array.from({ length: 200 }, (_, i) => [i * 0.012, i % 2 ? 0.006 : 0]);
    expect(thinRoute(wiggle, FLUX_MIN_STEP_DEG)).toHaveLength(wiggle.length);
  });

  it("smoothRoute (Chaikin) arrondit les angles, garde les extrémités et double les points", () => {
    const corner: LonLat[] = [[0, 0], [10, 0], [10, 10]];
    const once = smoothRoute(corner, 1);
    expect(once).toHaveLength(2 * (corner.length - 1) + 2);
    expect(once[0]).toEqual([0, 0]);
    expect(once[once.length - 1]).toEqual([10, 10]);
    // Le sommet anguleux (10, 0) disparaît : le point le plus proche en est à plus de 1°.
    expect(Math.min(...once.map((p) => degrees(p, [10, 0])))).toBeGreaterThan(1);
    expect(smoothRoute(corner, 2)).toHaveLength(2 * (once.length - 1) + 2);
    // Un segment seul reste tel quel.
    expect(smoothRoute([[0, 0], [5, 5]], 2)).toEqual([[0, 0], [5, 5]]);
  });

  it("densifyRoute ajoute des points le long du grand cercle, sans pas de plus de maxStep", () => {
    const dense = densifyRoute([PARIS, NEW_YORK], 1);
    expect(dense.length).toBeGreaterThan(degrees(PARIS, NEW_YORK));
    for (let i = 1; i < dense.length; i++) expect(degrees(dense[i - 1], dense[i])).toBeLessThanOrEqual(1.0001);
    for (const p of dense) expect(degrees(PARIS, p) + degrees(p, NEW_YORK)).toBeCloseTo(degrees(PARIS, NEW_YORK), 6);
    expect(dense[0]).toEqual(PARIS);
    expect(dense[dense.length - 1]).toEqual(NEW_YORK);
  });

  it("fluxRoute : lissé, densifié, légèrement surélevé", () => {
    const route = fluxRoute([[0, 0], [20, 0], [20, 20]]);
    expect(route.every((p) => p.r === 1 + FLUX_ALTITUDE)).toBe(true);
    for (let i = 1; i < route.length; i++) {
      expect(degrees(toLonLat(route[i - 1].v), toLonLat(route[i].v))).toBeLessThanOrEqual(FLUX_MAX_STEP_DEG + 1e-6);
    }
    expect(degrees(toLonLat(route[0].v), [0, 0])).toBeLessThan(1e-6);
    expect(degrees(toLonLat(route[route.length - 1].v), [20, 20])).toBeLessThan(1e-6);
  });

  it("un très long trait n'est pas lissé au-delà du budget de points", () => {
    const long: LonLat[] = Array.from({ length: FLUX_SMOOTHING_BUDGET }, (_, i) => [(i % 3000) * 0.1 - 150, Math.floor(i / 3000)]);
    expect(fluxRoute(long).length).toBeLessThanOrEqual(FLUX_SMOOTHING_BUDGET * 1.1);
  });

  it("un trait hostile (allers-retours d'un bout à l'autre du globe) ne multiplie pas ses points", () => {
    // 20 000 points (MAX_PATH_POINTS) : sans plafond, plus de 3,5 millions de points de route.
    const hostile: LonLat[] = Array.from({ length: 20_000 }, (_, i) => (i % 2 ? [179, 1] : [0, 0]));
    expect(fluxRoute(hostile).length).toBeLessThanOrEqual(hostile.length);
    const shorter = hostile.slice(0, 2_000);
    expect(fluxRoute(shorter).length).toBeLessThanOrEqual(FLUX_ROUTE_BUDGET);
  });

  it("densifyRoute : le pas s'élargit pour rester dans le budget, sinon il ne dépasse pas maxStep", () => {
    const line: LonLat[] = [[0, 0], [90, 0], [180, 0.5], [270, 0]];
    expect(densifyRoute(line, 1, 100).length).toBeLessThanOrEqual(100);
    const dense = densifyRoute(line, 1);
    expect(dense.length).toBeGreaterThan(260);
    for (let i = 1; i < dense.length; i++) expect(degrees(dense[i - 1], dense[i])).toBeLessThanOrEqual(1 + 1e-6);
  });
});

describe("budget de points de toute la carte (fichier importé hostile)", () => {
  it("une carte courante garde le budget par flux : rien n'est recalculé quand un autre flux change", () => {
    const strokes = Array.from({ length: 20 }, (_, i) =>
      Array.from({ length: 500 }, (_, j): LonLat => [-60 + j * 0.2, -40 + i * 4 + Math.sin(j / 10)]),
    );
    expect(fluxBudgets(strokes)).toEqual(strokes.map(() => FLUX_ROUTE_BUDGET));
  });

  it("des milliers de longs traits ne dépassent pas FLUX_LAYER_BUDGET points en tout", () => {
    // ~250 Ko de JSON : 5 000 traits de 3 points d'un bout à l'autre du globe (≈ 1,7 million de points sans plafond global).
    const strokes = Array.from({ length: 5000 }, (): LonLat[] => [
      [-179, 0],
      [0, 0.5],
      [179, 0],
    ]);
    const budgets = fluxBudgets(strokes);
    const total = strokes.reduce((sum, points, i) => sum + fluxRoute(points, budgets[i]).length, 0);
    expect(total).toBeLessThanOrEqual(FLUX_LAYER_BUDGET);
    // Chaque trait garde au moins ses points d'origine.
    expect(fluxRoute(strokes[0], budgets[0]).length).toBeGreaterThanOrEqual(3);
  });

  it("des milliers de liens réduisent le nombre de segments de chaque arc", () => {
    expect(arcSegmentCap(300)).toBe(90);
    expect(arcRoute([-100, 10], [100, 10], arcSegmentCap(300))).toEqual(arcRoute([-100, 10], [100, 10]));
    const count = 20_000;
    const cap = arcSegmentCap(count);
    expect(cap).toBe(2);
    const route = arcRoute([-100, 10], [100, 10], cap);
    expect(route).toHaveLength(3);
    // Le sommet de l'arc reste à mi-parcours.
    expect(route[1].r).toBeGreaterThan(1);
    expect(arcSegmentCap(1000) * 1000).toBeLessThanOrEqual(ARC_LAYER_BUDGET);
  });
});
