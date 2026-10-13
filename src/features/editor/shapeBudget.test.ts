import { geoDistance, geoPath } from "d3";
import { describe, expect, it } from "vitest";
import type { LonLat } from "@/lib/geo";
import { makeProjection, rotationCenteredOn } from "./projection";
import {
  FLAT_FLUX_LAYER_BUDGET,
  MIN_LINE_POINTS,
  MIN_RING_POINTS,
  SHAPE_STEP_DEG,
  ZONE_LAYER_BUDGET,
  decimate,
  fitShape,
  naturalShapeSize,
  shapeBudgets,
} from "./shapeBudget";

const degrees = (a: LonLat, b: LonLat) => (geoDistance(a, b) * 180) / Math.PI;
/** Nombre de sommets d'un tracé SVG (commandes M et L). */
const vertices = (d: string | null) => (d ?? "").match(/[ML]/g)?.length ?? 0;

/** Zone tracée à main levée : un point tous les ~0,3°. */
const handDrawnRing = (cx: number, cy: number, r: number): LonLat[] => {
  const ring = Array.from({ length: 120 }, (_, i): LonLat => {
    const a = (i / 120) * 2 * Math.PI;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  return [...ring, ring[0]];
};

/** Zone hostile : allers-retours d'un bout à l'autre du globe. */
const hostileRing = (count: number): LonLat[] => {
  const ring = Array.from({ length: count }, (_, i): LonLat => (i % 2 ? [170, (i % 80) - 40] : [0, 40 - (i % 80)]));
  return [...ring, ring[0]];
};

describe("budget de rendu des zones et des flux", () => {
  it("decimate garde les extrémités et au plus `max` points", () => {
    const line = Array.from({ length: 1000 }, (_, i): LonLat => [i / 10, 0]);
    const kept = decimate(line, 50);
    expect(kept).toHaveLength(50);
    expect(kept[0]).toBe(line[0]);
    expect(kept[49]).toBe(line[999]);
    expect(decimate(line, 2000)).toBe(line);
  });

  it("carte réaliste : rien n'est allégé, le tracé suit les grands cercles au pas de 1°", () => {
    const rings = Array.from({ length: 40 }, (_, i) => handDrawnRing(-150 + i * 7, 10, 3));
    const budgets = shapeBudgets(rings, ZONE_LAYER_BUDGET, MIN_RING_POINTS);
    expect(budgets).toEqual(rings.map(naturalShapeSize));
    const fitted = fitShape(rings[0], budgets[0], MIN_RING_POINTS);
    // Tous les points tracés sont gardés, dans l'ordre ; l'anneau reste fermé.
    expect(fitted.filter((p) => rings[0].includes(p))).toEqual(rings[0]);
    expect(fitted[0]).toEqual(fitted[fitted.length - 1]);
    // Un long côté est densifié le long du grand cercle.
    const long = fitShape([[0, 0], [40, 0]], naturalShapeSize([[0, 0], [40, 0]]), MIN_LINE_POINTS);
    for (let i = 1; i < long.length; i++) expect(degrees(long[i - 1], long[i])).toBeLessThanOrEqual(SHAPE_STEP_DEG + 1e-9);
  });

  it("zones hostiles : le nombre total de points ne dépasse pas ZONE_LAYER_BUDGET", () => {
    // 200 zones de 2 000 allers-retours : sans plafond, des millions de points à chaque image du globe.
    const rings = Array.from({ length: 200 }, () => hostileRing(2000));
    const budgets = shapeBudgets(rings, ZONE_LAYER_BUDGET, MIN_RING_POINTS);
    const fitted = rings.map((ring, i) => fitShape(ring, budgets[i], MIN_RING_POINTS));
    const total = fitted.reduce((sum, ring) => sum + ring.length, 0);
    expect(total).toBeLessThanOrEqual(ZONE_LAYER_BUDGET);
    for (const ring of fitted) {
      expect(ring.length).toBeGreaterThanOrEqual(MIN_RING_POINTS);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
  });

  it("des milliers de zones gardent chacune un anneau fermé, même au-delà du budget", () => {
    const rings = Array.from({ length: 20_000 }, () => hostileRing(10));
    const budgets = shapeBudgets(rings, ZONE_LAYER_BUDGET, MIN_RING_POINTS);
    expect(Math.min(...budgets)).toBe(MIN_RING_POINTS);
    const ring = fitShape(rings[0], budgets[0], MIN_RING_POINTS);
    expect(ring).toHaveLength(MIN_RING_POINTS);
  });

  it("projection sans rééchantillonnage : le tracé projeté reste borné, en planisphère comme en globe", () => {
    const hostile = hostileRing(20_000);
    const budget = shapeBudgets([hostile], FLAT_FLUX_LAYER_BUDGET, MIN_LINE_POINTS)[0];
    expect(budget).toBeLessThanOrEqual(FLAT_FLUX_LAYER_BUDGET);
    const fitted = fitShape(hostile, budget, MIN_LINE_POINTS);
    for (const view of ["planisphere", "globe"] as const) {
      const rotation = view === "globe" ? rotationCenteredOn([0, 0]) : undefined;
      const resampled = geoPath(makeProjection(1280, 800, view, rotation));
      const bounded = geoPath(makeProjection(1280, 800, view, rotation, { resample: false }));
      const d = bounded({ type: "LineString", coordinates: fitted });
      // Coupe à l'antiméridien ou à l'horizon : au plus deux sommets de plus par segment.
      expect(vertices(d)).toBeLessThanOrEqual(3 * fitted.length);
      // Sans budget, geoPath rééchantillonne chaque segment : bien plus de sommets.
      expect(vertices(resampled({ type: "LineString", coordinates: hostile }))).toBeGreaterThan(vertices(d));
    }
  });

  it("projection sans rééchantillonnage : même cadrage que la projection de la carte", () => {
    const sampled = makeProjection(1280, 800, "globe", [20, -10]);
    const unsampled = makeProjection(1280, 800, "globe", [20, -10], { resample: false });
    expect(unsampled.scale()).toBe(sampled.scale());
    expect(unsampled.translate()).toEqual(sampled.translate());
    expect(unsampled([2.35, 48.85])).toEqual(sampled([2.35, 48.85]));
    expect(unsampled.precision()).toBe(0);
    expect(sampled.precision()).toBeGreaterThan(0);
  });
});
