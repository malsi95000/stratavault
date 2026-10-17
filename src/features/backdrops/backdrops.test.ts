import { describe, expect, it } from "vitest";
import type { Pt } from "@/features/bank/preview/pathData";
import { contourLayers, contourThresholds, splitAtBorder } from "./contours";
import { circlePoints, dialTicks } from "./globe";
import { between, seededRandom } from "./random";
import { strataLines } from "./strata";
import { randomHills, sampleTerrain } from "./terrain";
import { BACKDROP_HEIGHT, BACKDROP_VARIANTS, BACKDROP_WIDTH } from "./types";
import { backdropLayers } from "./variants";

/** Tracé compact attendu : suites de « M x y l dx dy … » éventuellement fermées par « z ». */
const PATH = /^(M-?\d+[ -]\d+l[-\d ]+z?)+$/;

/** Points absolus d'un tracé « M … l … » (pour vérifier où il se trouve). */
function absolutePoints(d: string): Pt[] {
  const points: Pt[] = [];
  for (const [, start, rest] of d.matchAll(/M([-\d ]+?)l([-\d ]+)z?/g)) {
    const numbers = (text: string) => text.match(/-?\d+/g)!.map(Number);
    let [x, y] = numbers(start);
    points.push([x, y]);
    const deltas = numbers(rest);
    for (let i = 0; i < deltas.length; i += 2) {
      x += deltas[i];
      y += deltas[i + 1];
      points.push([x, y]);
    }
  }
  return points;
}

describe("hasard à graine", () => {
  it("donne toujours la même suite pour une même graine, dans [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const values = Array.from({ length: 200 }, () => a());
    expect(Array.from({ length: 200 }, () => b())).toEqual(values);
    for (const v of values) expect(v >= 0 && v < 1).toBe(true);
    expect(seededRandom(43)()).not.toBe(values[0]);
  });

  it("tire entre deux bornes", () => {
    const random = seededRandom(1);
    for (let i = 0; i < 100; i++) {
      const v = between(random, -3, 5);
      expect(v >= -3 && v < 5).toBe(true);
    }
  });
});

describe("courbes de niveau", () => {
  it("place les paliers à intervalles réguliers, sans les extrêmes", () => {
    expect(contourThresholds([0, 10, 4], 4)).toEqual([2, 4, 6, 8]);
  });

  it("garde entier un anneau qui ne touche pas le bord", () => {
    const ring: Pt[] = [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]];
    expect(splitAtBorder(ring, 10, 10)).toEqual([{ closed: true, points: ring.slice(0, -1) }]);
  });

  it("retire les morceaux d'anneau posés sur le bord du dessin", () => {
    // Anneau refermé par d3-contour le long du bord gauche (x = 0) : seule la courbe intérieure reste.
    const ring: Pt[] = [[0, 2], [3, 2], [4, 5], [3, 8], [0, 8], [0, 5], [0, 2]];
    const parts = splitAtBorder(ring, 10, 10);
    expect(parts).toEqual([{ closed: false, points: [[0, 2], [3, 2], [4, 5], [3, 8], [0, 8]] }]);
    for (const part of parts) {
      for (let i = 1; i < part.points.length; i++) {
        const [a, b] = [part.points[i - 1], part.points[i]];
        expect(a[0] === 0 && b[0] === 0, "segment le long du bord").toBe(false);
      }
    }
  });

  it("tracent des courbes ordinaires et des courbes maîtresses dans le cadre", () => {
    const grid = sampleTerrain(randomHills({ seed: 3, count: 4, radius: [0.1, 0.2] }), 40, 25, 0.625);
    const [minor, major] = contourLayers(grid, { width: 800, height: 500, levels: 9, majorEvery: 3, tolerance: 1 });
    expect(minor.tone).toBe("line");
    expect(major.tone).toBe("strong");
    for (const layer of [minor, major]) {
      expect(layer.d).toMatch(PATH);
      for (const [x, y] of absolutePoints(layer.d)) {
        expect(x >= 0 && x <= 800 && y >= 0 && y <= 500, `${x},${y}`).toBe(true);
      }
    }
  });
});

describe("strates", () => {
  it("ne se croisent jamais et couvrent tout le dessin", () => {
    const options = { seed: 5, width: 1600, height: 1000, count: 26, majorEvery: 5 };
    const lines = strataLines(options);
    for (let k = 1; k < lines.length; k++) {
      expect(lines[k].rank).toBe(lines[k - 1].rank + 1);
      lines[k].points.forEach(([, y], i) => expect(y).toBeGreaterThan(lines[k - 1].points[i][1]));
    }
    // Aucune bande vide en haut ni en bas : une strate passe toujours au-dessus de 0 et sous la hauteur.
    lines[0].points.forEach(([, y]) => expect(y).toBeLessThanOrEqual(0));
    lines.at(-1)!.points.forEach(([, y]) => expect(y).toBeGreaterThanOrEqual(1000));
  });
});

describe("globe", () => {
  it("referme le cercle et gradue la couronne tous les 5°", () => {
    const circle = circlePoints([100, 100], 50, 36);
    expect(circle).toHaveLength(37);
    expect(circle[0][0]).toBeCloseTo(circle[36][0]);
    expect(circle[0][1]).toBeCloseTo(circle[36][1]);
    expect(dialTicks([100, 100], 50).match(/M/g)).toHaveLength(72);
  });
});

describe("fonds de page", () => {
  it("chaque fond a des tracés valides, sans calque vide, dans un budget de taille", () => {
    for (const variant of BACKDROP_VARIANTS) {
      const layers = backdropLayers(variant);
      expect(layers.length, variant).toBeGreaterThan(1);
      const size = layers.reduce((sum, layer) => sum + layer.d.length, 0);
      // Le tracé est écrit dans la page : il doit rester léger (environ 12 Ko pour le plus gros).
      expect(size, variant).toBeLessThan(20_000);
      for (const layer of layers) {
        expect(layer.d, variant).toMatch(PATH);
        if (layer.dash) expect(layer.dash).toMatch(/^\d+ \d+$/);
      }
    }
  });

  it("restent autour du dessin (globe et strates débordent, de moitié au plus)", () => {
    for (const variant of BACKDROP_VARIANTS) {
      for (const layer of backdropLayers(variant)) {
        for (const [x, y] of absolutePoints(layer.d)) {
          expect(x >= -BACKDROP_WIDTH / 2 && x <= BACKDROP_WIDTH * 1.5, `${variant} x=${x}`).toBe(true);
          expect(y >= -BACKDROP_HEIGHT / 2 && y <= BACKDROP_HEIGHT * 1.5, `${variant} y=${y}`).toBe(true);
        }
      }
    }
  });

  it("sont tous différents, et identiques d'un appel à l'autre", () => {
    const signatures = BACKDROP_VARIANTS.map((variant) => backdropLayers(variant).map((l) => l.d).join("|"));
    expect(new Set(signatures).size).toBe(BACKDROP_VARIANTS.length);
    expect(BACKDROP_VARIANTS.map((variant) => backdropLayers(variant).map((l) => l.d).join("|"))).toEqual(signatures);
    // Recalcul complet (hors cache) : même relief pour une même graine.
    const grid = () => sampleTerrain(randomHills({ seed: 21, count: 9, radius: [0.06, 0.16] }), 32, 20, 0.625);
    expect(grid().values).toEqual(grid().values);
  });
});
