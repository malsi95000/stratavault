import { readFileSync } from "node:fs";
import { geoArea, geoDistance, geoPath, geoStream } from "d3";
import { describe, expect, it } from "vitest";
import type { LonLat } from "@/lib/geo";
import {
  SIMPLIFIED_EPSILONS,
  boundingCap,
  capsOverlap,
  decodeArcs,
  detailLevels,
  globeGeometries,
  hemisphereCap,
  epsilonFor,
  pickLevel,
  restEpsilon,
  toleranceAt,
  simplifyLine,
  visibleCap,
} from "./globeDetail";
import { globeRadius, makeProjection, rotationCenteredOn } from "./projection";
import { buildWorld, isWorldTopology } from "./world";
import type { CountryFeature } from "./world";

const json: unknown = JSON.parse(readFileSync(new URL("../../../public/data/countries-50m.json", import.meta.url), "utf8"));
if (!isWorldTopology(json)) throw new Error("countries-50m.json illisible");
const world = buildWorld(json);
const levels = detailLevels(world);

const W = 1440;
const H = 900;

function pointsOf(features: readonly (CountryFeature | null)[]): number {
  let n = 0;
  const noop = () => {};
  const sink = { point: () => n++, lineStart: noop, lineEnd: noop, polygonStart: noop, polygonEnd: noop, sphere: noop };
  for (const f of features) if (f) geoStream(f, sink);
  return n;
}

describe("simplification des frontières", () => {
  it("Douglas-Peucker garde les extrémités et retire les points alignés", () => {
    const line: LonLat[] = [
      [0, 0],
      [1, 0.001],
      [2, 0],
      [3, 1],
      [4, 0],
    ];
    expect(simplifyLine(line, 0.01)).toEqual([
      [0, 0],
      [2, 0],
      [3, 1],
      [4, 0],
    ]);
    expect(simplifyLine(line, 0)).toEqual(line);
  });

  it("une petite île (arc fermé) garde 4 points dans l'ordre, sans se réduire à un trait", () => {
    const islet: LonLat[] = [
      [0, 0],
      [0.01, 0],
      [0.01, 0.01],
      [0, 0.01],
      [0, 0],
    ];
    expect(simplifyLine(islet, 1)).toEqual([
      [0, 0],
      [0.01, 0],
      [0.01, 0.01],
      [0, 0],
    ]);
    expect(simplifyLine(islet.slice(1), 1)).toHaveLength(2); // arc ouvert : extrémités seules
  });

  it("décode les arcs quantifiés en coordonnées absolues", () => {
    const arcs = decodeArcs(json);
    expect(arcs).toHaveLength(json.arcs.length);
    for (const arc of arcs.slice(0, 50)) {
      for (const [lon, lat] of arc) {
        expect(Math.abs(lon)).toBeLessThanOrEqual(180.001);
        expect(Math.abs(lat)).toBeLessThanOrEqual(90.001);
      }
    }
  });

  it("chaque niveau garde les 241 géométries, dans l'ordre, sans en retourner aucune", () => {
    expect(levels.map((l) => l.epsilon)).toEqual([0, ...SIMPLIFIED_EPSILONS]);
    for (const level of levels) {
      expect(level.features).toHaveLength(241);
      level.features.forEach((f, i) => {
        expect(f.properties.name).toBe(world.shapes[i].name);
        // Une géométrie retournée couvrirait tout le globe (aire > hémisphère).
        expect(geoArea(f)).toBeLessThan(2 * Math.PI);
      });
    }
  });

  it("les versions allégées ont beaucoup moins de points", () => {
    const counts = levels.map((l) => pointsOf(l.features));
    expect(counts[1]).toBeLessThan(counts[0] / 4);
    expect(counts[2]).toBeLessThan(counts[0] / 2);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThan(counts[0]);
  });

  it("pickLevel prend la version la plus légère sous la tolérance", () => {
    expect(pickLevel(levels, 0).epsilon).toBe(0);
    expect(pickLevel(levels, 0.01).epsilon).toBe(0);
    expect(pickLevel(levels, 0.03).epsilon).toBe(0.015);
    expect(pickLevel(levels, 0.1).epsilon).toBe(0.05);
    expect(pickLevel(levels, 5).epsilon).toBe(0.2);
  });
});

describe("résolution selon le zoom", () => {
  it("convertit un écart à l'écran en degrés, selon le rayon et le zoom", () => {
    expect(toleranceAt(400, 1, 400 * (Math.PI / 180))).toBeCloseTo(1, 9);
    expect(toleranceAt(400, 4, 1)).toBeCloseTo(toleranceAt(400, 1, 1) / 4, 9);
    expect(epsilonFor(0.01)).toBe(0);
    expect(epsilonFor(0.06)).toBe(0.05);
    expect(epsilonFor(1)).toBe(0.2);
  });

  it("au repos : allégée (invisible) à petite échelle, pleine résolution dès qu'on zoome", () => {
    const radius = globeRadius(W, H);
    expect(radius).toBeCloseTo((H - 106) / 2, 6);
    expect(restEpsilon(radius, 1)).toBe(0.015);
    expect(restEpsilon(radius, 4)).toBe(0);
    expect(restEpsilon(radius, 40)).toBe(0);
  });
});

describe("calottes et tri des pays visibles", () => {
  it("la calotte englobe tous les points de la géométrie", () => {
    const france = world.featureByCode.get("FRA")!;
    const cap = boundingCap(france);
    geoStream(france, {
      point: (x, y) => expect(geoDistance(cap.center, [x, y])).toBeLessThanOrEqual(cap.radius + 1e-9),
      lineStart: () => {},
      lineEnd: () => {},
      polygonStart: () => {},
      polygonEnd: () => {},
      sphere: () => {},
    });
    expect(capsOverlap(cap, { center: [2, 47], radius: 0.01 })).toBe(true);
    expect(capsOverlap(cap, { center: [150, -30], radius: 0.5 })).toBe(false);
  });

  it("au repos : pleine résolution, pays de la face cachée écartés", () => {
    const globe = makeProjection(W, H, "globe", rotationCenteredOn([2, 47]));
    const geometries = globeGeometries(levels, globe, null);
    const byCode = (code: string) => geometries[world.shapes.findIndex((s) => s.country?.code === code)];
    expect(byCode("FRA")).toBe(world.featureByCode.get("FRA"));
    expect(byCode("NZL")).toBeNull();
    // Un pays écarté n'aurait rien dessiné de toute façon.
    const path = geoPath(globe);
    world.shapes.forEach((s, i) => {
      if (geometries[i] === null) expect(path(s.feature) ?? "").toBe("");
    });
  });

  it("pendant un glisser : version allégée selon le zoom, limitée à la zone affichée", () => {
    const globe = makeProjection(W, H, "globe", rotationCenteredOn([2, 47]));
    const whole = { x: 0, y: 0, width: W, height: H };
    const atRest = pointsOf(globeGeometries(levels, globe, null));
    const dragged = pointsOf(globeGeometries(levels, globe, { k: 1, viewport: whole }));
    expect(dragged).toBeLessThan(atRest / 4);

    // Zoom × 8 sur la France : seuls les pays voisins restent.
    const [fx, fy] = globe([2, 47])!;
    const viewport = { x: fx - W / 16, y: fy - H / 16, width: W / 8, height: H / 8 };
    const zoomed = globeGeometries(levels, globe, { k: 8, viewport });
    const kept = zoomed.filter(Boolean).length;
    expect(kept).toBeGreaterThan(3);
    expect(kept).toBeLessThan(60);
    expect(zoomed[world.shapes.findIndex((s) => s.country?.code === "FRA")]).not.toBeNull();
  });

  it("visibleCap : null si le cadrage déborde du disque, sinon une calotte dans la face visible", () => {
    const globe = makeProjection(W, H, "globe", [0, 0]);
    expect(visibleCap(globe, { x: 0, y: 0, width: W, height: H })).toBeNull();
    const [cx, cy] = globe.translate();
    const cap = visibleCap(globe, { x: cx - 20, y: cy - 20, width: 40, height: 40 })!;
    expect(geoDistance(cap.center, [0, 0])).toBeLessThan(1e-6);
    expect(cap.radius).toBeLessThan(0.2);
    expect(hemisphereCap(globe).radius).toBe(Math.PI / 2);
  });
});
