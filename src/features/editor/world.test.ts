import { readFileSync } from "node:fs";
import { zoomIdentity } from "d3";
import { describe, expect, it } from "vitest";
import { COUNTRIES, countryByCode } from "@/data/countries";
import { clientToLL, makeProjection, screenToLL } from "./projection";
import { CAPITAL_MARKS, buildWorld, countryAnchorFor, hoverLabel, isWorldTopology } from "./world";

const json: unknown = JSON.parse(
  readFileSync(new URL("../../../public/data/countries-50m.json", import.meta.url), "utf8"),
);

describe("fond de carte", () => {
  if (!isWorldTopology(json)) throw new Error("countries-50m.json illisible");
  const world = buildWorld(json);
  const anchor = countryAnchorFor(world);

  it("associe les 241 géométries à une entité, chacune une seule fois", () => {
    expect(world.shapes).toHaveLength(241);
    expect(world.shapes.filter((s) => s.country === null)).toEqual([]);
    expect(world.featureByCode.size).toBe(241);
  });

  it("rend cliquables les entités demandées", () => {
    for (const code of ["TWN", "XKX", "GRL", "ESH", "XSO", "XNC", "ATA", "XSI", "XAC"]) {
      expect(world.featureByCode.has(code), code).toBe(true);
    }
    // Sans géométrie : cliquables par leur capitale.
    for (const code of ["TUV", "XAB", "XOS", "XTR"]) {
      expect(world.featureByCode.has(code), code).toBe(false);
      expect(CAPITAL_MARKS.some((m) => m.code === code), code).toBe(true);
    }
  });

  it("place un point pour chaque capitale de chaque entité", () => {
    const total = COUNTRIES.reduce((n, c) => n + c.capitals.length, 0);
    expect(CAPITAL_MARKS).toHaveLength(total);
    expect(new Set(CAPITAL_MARKS.map((m) => m.key)).size).toBe(total);
    // Toute entité a une géométrie ou au moins une capitale.
    for (const c of COUNTRIES) expect(world.featureByCode.has(c.code) || c.capitals.length > 0, c.code).toBe(true);
  });

  it("ancre une entité sur sa capitale, sinon sur le centroïde de sa géométrie", () => {
    expect(anchor("FRA")).toEqual(countryByCode.get("FRA")!.capitals[0].ll);
    expect(anchor("XAB")).toEqual(countryByCode.get("XAB")!.capitals[0].ll);
    for (const code of ["ATA", "XSI", "HMD", "XAC"]) {
      const ll = anchor(code);
      expect(ll, code).not.toBeNull();
      expect(Math.abs(ll![0])).toBeLessThanOrEqual(180);
      expect(Math.abs(ll![1])).toBeLessThanOrEqual(90);
    }
    expect(anchor("ZZZ")).toBeNull();
  });

  it("formate l'infobulle", () => {
    expect(hoverLabel(countryByCode.get("ZAF")!)).toBe("Afrique du Sud, Pretoria / Bloemfontein / Le Cap");
    expect(hoverLabel(countryByCode.get("ATA")!)).toBe("Antarctique — Antarctique");
    expect(hoverLabel(countryByCode.get("XSI")!)).toBe("Glacier de Siachen — Territoire disputé");
  });

  it("refuse un fichier qui n'est pas une topologie de pays", () => {
    expect(isWorldTopology(null)).toBe(false);
    expect(isWorldTopology({ type: "Topology", arcs: [], objects: {} })).toBe(false);
    expect(isWorldTopology({ type: "FeatureCollection" })).toBe(false);
  });
});

describe("projection", () => {
  const proj = makeProjection(1200, 800);

  it("retrouve [lon, lat] depuis l'écran, avec ou sans zoom", () => {
    const paris: [number, number] = [2.35, 48.86];
    const [x, y] = proj(paris)!;
    expect(screenToLL(proj, zoomIdentity, x, y)).toEqual(paris);
    const t = zoomIdentity.translate(-300, -120).scale(4);
    const [sx, sy] = t.apply([x, y]);
    const ll = screenToLL(proj, t, sx, sy)!;
    expect(ll[0]).toBeCloseTo(paris[0], 3);
    expect(ll[1]).toBeCloseTo(paris[1], 3);
  });

  it("renvoie null hors de la sphère", () => {
    expect(screenToLL(proj, zoomIdentity, 2, 2)).toBeNull();
    expect(screenToLL(proj, zoomIdentity, 1199, 799)).toBeNull();
    // Au zoom, le coin de l'écran reste hors du globe s'il correspond à un point hors de la sphère.
    const t = zoomIdentity.translate(0, 0).scale(2);
    expect(screenToLL(proj, t, 4, 4)).toBeNull();
  });

  it("accepte la mer : un clic en plein océan donne des coordonnées", () => {
    const pacific: [number, number] = [-140, 0];
    const [x, y] = proj(pacific)!;
    expect(screenToLL(proj, zoomIdentity, x, y)).toEqual(pacific);
  });

  it("tient compte de la position du <svg> dans la page", () => {
    const paris: [number, number] = [2.35, 48.86];
    const [x, y] = proj(paris)!;
    expect(clientToLL(proj, zoomIdentity, { left: 30, top: 50 }, x + 30, y + 50)).toEqual(paris);
    expect(clientToLL(proj, zoomIdentity, { left: 30, top: 50 }, 31, 51)).toBeNull();
  });
});
