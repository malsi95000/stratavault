import { describe, expect, it } from "vitest";
import type { LonLat } from "@/features/map-doc/types";
import { FLUX_MIN_STEP_PX, LASSO_MIN_STEP_PX, appendTracePoint, extendDraft, startDraft } from "./drawing";
import type { Draft } from "./drawing";
import { makeProjection } from "./projection";

// Projection fictive : 1° = 1 px.
const flat = (ll: LonLat): [number, number] => [ll[0], ll[1]];

describe("échantillonnage des tracés", () => {
  it("ajoute le premier point sans condition", () => {
    expect(appendTracePoint([], [3, 4], flat, 1, LASSO_MIN_STEP_PX)).toEqual([[3, 4]]);
  });

  it("ignore un point à moins de 6 px à l'écran et renvoie le même tableau", () => {
    const pts: LonLat[] = [[0, 0]];
    expect(appendTracePoint(pts, [3, 4], flat, 1, LASSO_MIN_STEP_PX)).toBe(pts);
    expect(appendTracePoint(pts, [6, 0], flat, 1, LASSO_MIN_STEP_PX)).toEqual([[0, 0], [6, 0]]);
  });

  it("tient compte du zoom courant", () => {
    const pts: LonLat[] = [[0, 0]];
    // 3 px sans zoom, 6 px à l'écran au zoom 2.
    expect(appendTracePoint(pts, [3, 0], flat, 2, LASSO_MIN_STEP_PX)).toHaveLength(2);
    expect(appendTracePoint(pts, [3, 0], flat, 1.5, LASSO_MIN_STEP_PX)).toBe(pts);
  });

  it("ignore un point non représentable", () => {
    const pts: LonLat[] = [[0, 0]];
    expect(appendTracePoint(pts, [9, 9], () => null, 1, LASSO_MIN_STEP_PX)).toBe(pts);
  });

  it("fonctionne avec la projection de la carte", () => {
    const projection = makeProjection(1280, 800);
    const project = (ll: LonLat) => projection(ll);
    const pts: LonLat[] = [[2, 48]];
    // Deux dixièmes de degré : moins de 6 px sans zoom, bien plus au zoom 40.
    expect(appendTracePoint(pts, [2.2, 48], project, 1, LASSO_MIN_STEP_PX)).toBe(pts);
    expect(appendTracePoint(pts, [2.2, 48], project, 40, LASSO_MIN_STEP_PX)).toHaveLength(2);
  });
});

describe("brouillon du lasso et du pinceau flux", () => {
  it("ne démarre un tracé qu'avec le lasso ou le pinceau, dans la couleur et l'épaisseur courantes", () => {
    expect(startDraft("lasso", [1, 2], "rouge", 9)).toEqual({ kind: "lasso", points: [[1, 2]] });
    expect(startDraft("flux", [1, 2], "rouge", 9)).toEqual({ kind: "flux", points: [[1, 2]], color: "rouge", width: 9 });
    for (const tool of ["select", "link", "ping", "point", "texte", "gomme"] as const) {
      expect(startDraft(tool, [1, 2], "rouge", 9)).toBeNull();
    }
  });

  it("flux : ajoute un point dès 3 px d'écart à l'écran, en gardant couleur et épaisseur", () => {
    expect(FLUX_MIN_STEP_PX).toBe(3);
    const flux: Draft = { kind: "flux", points: [[0, 0]], color: "vert", width: 2 };
    expect(extendDraft(flux, [2, 2], flat, 1)).toBe(flux);
    expect(extendDraft(flux, [3, 0], flat, 1)).toEqual({ kind: "flux", points: [[0, 0], [3, 0]], color: "vert", width: 2 });
    // 1,5 px sans zoom, 3 px au zoom 2.
    expect(extendDraft(flux, [1.5, 0], flat, 2).points).toHaveLength(2);
  });

  it("lasso : garde le seuil de 6 px", () => {
    const lasso: Draft = { kind: "lasso", points: [[0, 0]] };
    expect(extendDraft(lasso, [3, 0], flat, 1)).toBe(lasso);
    expect(extendDraft(lasso, [6, 0], flat, 1)).toEqual({ kind: "lasso", points: [[0, 0], [6, 0]] });
  });
});
