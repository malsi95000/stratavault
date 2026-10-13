import { describe, expect, it } from "vitest";
import type { LonLat } from "@/lib/geo";
import { globeView, isOccluded, onGround, routePath, toLonLat, toScreen, toVector, toViewSpace, visibleRuns } from "./globe3d";
import type { RoutePoint, Vec3 } from "./globe3d";
import { makeProjection, rotationCenteredOn } from "./projection";

const W = 1280;
const H = 800;
const projection = makeProjection(W, H, "globe", rotationCenteredOn([10, 45]));
const view = globeView(projection);
const at = (ll: LonLat, r = 1): RoutePoint => ({ v: toVector(ll), r });
const screenOf = (ll: LonLat, r = 1) => toScreen(toViewSpace(at(ll, r), view), view);

describe("repère 3D du globe", () => {
  it("vecteurs et [lon, lat] se correspondent", () => {
    expect(toVector([0, 0])).toEqual([1, 0, 0]);
    const [x, y, z] = toVector([90, 0]);
    expect([x, y, z].map((n) => +n.toFixed(12))).toEqual([0, 1, 0]);
    const back = toLonLat(toVector([-73.9, 40.7]));
    expect(back[0]).toBeCloseTo(-73.9, 9);
    expect(back[1]).toBeCloseTo(40.7, 9);
  });

  it("au sol, la projection 3D retrouve exactement celle de d3 (rotation et ajustement compris)", () => {
    for (const ll of [[10, 45], [2.35, 48.86], [37.6, 55.75], [-20, 30], [60, 10]] as LonLat[]) {
      const [x, y] = screenOf(ll);
      const [ex, ey] = projection(ll)!;
      expect(x).toBeCloseTo(ex, 6);
      expect(y).toBeCloseTo(ey, 6);
    }
  });

  it("le centre du globe fait face à l'observateur, l'antipode est derrière", () => {
    const front = toViewSpace(at([10, 45]), view);
    expect(front[2]).toBeCloseTo(1, 9);
    expect(toViewSpace(at([-170, -45]), view)[2]).toBeCloseTo(-1, 9);
  });

  it("un point en altitude s'écarte du centre du disque proportionnellement à son rayon", () => {
    const [cx, cy] = projection.translate();
    const ground = screenOf([40, 45]);
    const high = screenOf([40, 45], 1.2);
    expect(high[0] - cx).toBeCloseTo((ground[0] - cx) * 1.2, 6);
    expect(high[1] - cy).toBeCloseTo((ground[1] - cy) * 1.2, 6);
  });
});

describe("occlusion par la Terre", () => {
  it("caché seulement derrière la Terre ET devant son disque", () => {
    expect(isOccluded([0, 0, 1])).toBe(false); // face visible
    expect(isOccluded([0.5, 0, -0.9])).toBe(true); // derrière, dans le disque
    // Derrière le plan de l'horizon mais en altitude, hors du disque : visible.
    expect(isOccluded([1.1, 0, -0.2])).toBe(false);
    expect(isOccluded([0, 0, 0])).toBe(false); // sur le plan de l'horizon
  });

  it("un point au sol de la face cachée est caché, un point très haut au même endroit peut dépasser", () => {
    // ~97° du centre : au sol derrière l'horizon ; à 1,3 rayon, il dépasse du disque.
    const behind: LonLat = [110, 0];
    const ground = toViewSpace(at(behind), view);
    expect(isOccluded(ground)).toBe(true);
    const lifted = toViewSpace(at(behind, 1.3), view);
    expect(Math.hypot(lifted[0], lifted[1])).toBeGreaterThan(1);
    expect(isOccluded(lifted)).toBe(false);
  });
});

describe("découpe en tronçons visibles", () => {
  const ring = (from: number, to: number, r = 1, steps = 36): Vec3[] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
      // Cercle dans le plan X–Z : angle 0 face à l'observateur, 180° derrière.
      return [Math.sin(a) * r, 0, Math.cos(a) * r];
    });

  it("un tracé entièrement visible donne un seul tronçon, intact", () => {
    const points = ring(-60, 60);
    expect(visibleRuns(points)).toEqual([points]);
  });

  it("un tracé entièrement caché ne donne rien", () => {
    expect(visibleRuns(ring(120, 240))).toEqual([]);
  });

  it("au sol, le tronçon s'arrête à l'horizon (Z ≈ 0)", () => {
    const runs = visibleRuns(ring(0, 180));
    expect(runs).toHaveLength(1);
    const end = runs[0][runs[0].length - 1];
    expect(end[2]).toBeGreaterThanOrEqual(0);
    expect(end[2]).toBeLessThan(0.01);
    expect(Math.hypot(...end)).toBeCloseTo(1, 6);
  });

  it("un tracé qui passe derrière puis ressort donne deux tronçons", () => {
    const runs = visibleRuns(ring(60, 300));
    expect(runs).toHaveLength(2);
    // Le second reprend juste après l'horizon.
    expect(runs[1][0][2]).toBeLessThan(0.01);
    expect(runs[1][0][0]).toBeLessThan(0);
  });

  it("en altitude, la partie qui dépasse du disque reste visible au-delà de l'horizon", () => {
    const low = visibleRuns(ring(0, 120, 1));
    const high = visibleRuns(ring(0, 120, 1.3));
    const lastAngle = (runs: Vec3[][]) => {
      const p = runs[0][runs[0].length - 1];
      return (Math.atan2(p[0], p[2]) * 180) / Math.PI;
    };
    expect(lastAngle(low)).toBeCloseTo(90, 0);
    // À 1,3 rayon, le point quitte le disque (sin a > 1/1,3) bien après l'horizon : a ≈ 180 − 50,3.
    expect(high).toHaveLength(1);
    expect(high[0]).toHaveLength(37);
  });
});

describe("tracé SVG", () => {
  it("un seul M pour un tracé visible, coordonnées arrondies au millième (comme geoPath)", () => {
    const d = routePath([at([0, 40]), at([10, 45]), at([20, 50])], view);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/L/g)).toHaveLength(2);
    expect(d).toMatch(/^M-?\d+(\.\d{1,3})?,-?\d+(\.\d{1,3})?L/);
  });

  it("passe derrière la Terre puis en ressort : deux sous-chemins, coupés au bord du disque", () => {
    const front = makeProjection(W, H, "globe", rotationCenteredOn([0, 0]));
    const frontView = globeView(front, 2);
    // Équateur de 60° E à 300° E : visible jusqu'à 90° E, caché, puis visible à nouveau après 270° E.
    const d = routePath(Array.from({ length: 49 }, (_, i) => at([60 + i * 5, 0])), frontView);
    const subpaths = d.split("M").filter(Boolean);
    expect(subpaths).toHaveLength(2);
    const points = (sub: string) => sub.split("L").map((xy) => xy.split(",").map(Number));
    const [cx, cy] = front.translate();
    const edge = (p: number[]) => Math.hypot(p[0] - cx, p[1] - cy) / front.scale();
    const first = points(subpaths[0]);
    const second = points(subpaths[1]);
    // Le premier s'arrête à l'horizon, le second en repart (à l'arrondi près).
    expect(edge(first[first.length - 1])).toBeCloseTo(1, 2);
    expect(edge(second[0])).toBeCloseTo(1, 2);
    expect(first.length).toBeGreaterThan(2);
    expect(second.length).toBeGreaterThan(2);
  });

  it("saute les points à moins de minStep du précédent, mais garde le dernier", () => {
    const dense = globeView(projection, 2);
    // 100 points sur 0,01° : bien moins de 2 px à l'écran.
    const d = routePath(Array.from({ length: 100 }, (_, i) => at([10 + i * 0.0001, 45])), dense);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/L/g)).toHaveLength(1);
    const last = screenOf([10 + 99 * 0.0001, 45]);
    expect(d.endsWith(`L${Math.round(last[0] * 1000) / 1000},${Math.round(last[1] * 1000) / 1000}`)).toBe(true);
  });

  it("vide pour un tracé de la face cachée", () => {
    expect(routePath([at([-170, -45]), at([-160, -40])], view)).toBe("");
  });

  it("onGround pose le tracé au sol sans changer sa direction", () => {
    const route = [at([0, 40], 1.2), at([10, 45], 1.1)];
    expect(onGround(route)).toEqual([at([0, 40]), at([10, 45])]);
  });
});
