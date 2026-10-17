// Globe en projection orthographique (comme la vue Globe de l'éditeur) : contour, graticule, et une
// couronne graduée tous les 5° autour du disque, à la manière d'un cadran.
import { geoGraticule, geoOrthographic } from "d3";
import { linePath, type Pt } from "@/features/bank/preview/pathData";
import { projectShapes } from "@/features/bank/preview/project";
import type { BackdropLayer } from "./types";

export type GlobeOptions = {
  center: Pt;
  radius: number;
  /** Rotation [λ, φ] du globe, en degrés. */
  rotate: readonly [number, number];
  /** Pas du graticule, en degrés. */
  step: number;
};

const SHAPES = { tolerance: 0.8 };

/** Cercle de rayon `r` autour de `center`, en `segments` côtés. */
export function circlePoints(center: Pt, r: number, segments: number): Pt[] {
  return Array.from({ length: segments + 1 }, (_, k) => {
    const a = (2 * Math.PI * k) / segments;
    return [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)] as Pt;
  });
}

/** Graduations de la couronne : un trait tous les 5°, plus long tous les 30°. */
export function dialTicks(center: Pt, r: number): string {
  let d = "";
  for (let deg = 0; deg < 360; deg += 5) {
    const a = (deg * Math.PI) / 180;
    const length = deg % 30 === 0 ? 18 : 7;
    const from: Pt = [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)];
    const to: Pt = [center[0] + (r + length) * Math.cos(a), center[1] + (r + length) * Math.sin(a)];
    d += linePath([from, to], { tolerance: 0 });
  }
  return d;
}

export function globeLayers({ center, radius, rotate, step }: GlobeOptions): BackdropLayer[] {
  const projection = geoOrthographic()
    .rotate([rotate[0], rotate[1]])
    .scale(radius)
    .translate([center[0], center[1]])
    .clipAngle(90);
  const lines = projectShapes(projection, geoGraticule().step([step, step])());
  return [
    { tone: "line", d: lines.lines.map((line) => linePath(line, SHAPES)).join("") },
    { tone: "strong", d: linePath(circlePoints(center, radius, 180), SHAPES) },
    { tone: "line", d: linePath(circlePoints(center, radius + 26, 180), SHAPES), dash: "2 7" },
    { tone: "accent", d: dialTicks(center, radius + 34) },
  ];
}
