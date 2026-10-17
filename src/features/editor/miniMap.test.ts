import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MINI_MAP_HEIGHT, MINI_MAP_WIDTH, boxNear, miniMap } from "./miniMap";
import { buildWorld, isWorldTopology } from "./world";

const json: unknown = JSON.parse(readFileSync(new URL("../../../public/data/countries-50m.json", import.meta.url), "utf8"));
if (!isWorldTopology(json)) throw new Error("countries-50m.json illisible");
const world = buildWorld(json);

/** Coordonnées de tous les sommets d'un tracé SVG. */
const coordinates = (d: string) => [...d.matchAll(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)].map((m) => Number(m[0]));

describe("mini-carte d'un pays", () => {
  it("France : le territoire principal remplit le cadre, voisins et graticule autour, rien n'en déborde", () => {
    const map = miniMap(world, "FRA")!;
    expect(map).toMatchObject({ width: MINI_MAP_WIDTH, height: MINI_MAP_HEIGHT, marker: null });
    for (const d of [map.country, map.context, map.graticule]) expect(d).toMatch(/^M/);
    for (const v of coordinates(`${map.country} ${map.context}`)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(MINI_MAP_WIDTH);
    }
    // La Guyane (même entité) est hors cadre : le cadrage suit la métropole, pas tout le pays.
    const xs = coordinates(map.country).filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(MINI_MAP_WIDTH / 3);
  });

  it("un micro-État reste entouré de ses voisins ; une entité sans géométrie est marquée à sa capitale", () => {
    const monaco = miniMap(world, "MCO")!;
    expect(monaco.country).toMatch(/^M/);
    expect(monaco.context.length).toBeGreaterThan(0);
    const tuvalu = miniMap(world, "TUV")!;
    expect(tuvalu.country).toBe("");
    expect(tuvalu.marker).not.toBeNull();
    const [x, y] = tuvalu.marker!;
    expect(Math.abs(x - MINI_MAP_WIDTH / 2)).toBeLessThan(1);
    expect(Math.abs(y - MINI_MAP_HEIGHT / 2)).toBeLessThan(1);
    expect(miniMap(world, "ZZZ")).toBeNull();
  });

  it("pays à cheval sur l'antiméridien (Fidji, Russie) : tracé valide", () => {
    for (const code of ["FJI", "RUS"]) {
      const map = miniMap(world, code)!;
      expect(map.country, code).toMatch(/^M/);
      expect(map.country, code).not.toContain("NaN");
    }
  });

  it("voisinage : latitudes, longitudes modulo 360° et pôles", () => {
    expect(boxNear([0, 40, 10, 50], [5, 45], 2)).toBe(true);
    expect(boxNear([0, 10, 10, 20], [5, 45], 5)).toBe(false);
    expect(boxNear([-180, 60, -170, 70], [178, 65], 6)).toBe(true);
    expect(boxNear([100, 80, 120, 85], [-60, 85], 6)).toBe(true);
    expect(boxNear([100, 0, 120, 10], [-60, 5], 6)).toBe(false);
  });
});
