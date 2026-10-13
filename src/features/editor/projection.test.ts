import { geoDistance } from "d3";
import { zoomIdentity } from "d3";
import { describe, expect, it } from "vitest";
import type { LonLat } from "@/lib/geo";
import {
  dragRotation,
  isPointVisible,
  makeProjection,
  pointProjector,
  rotationCenteredOn,
  screenCenterLL,
  screenToLL,
  viewCenter,
} from "./projection";

const W = 1200;
const H = 800;
const paris: LonLat = [2.35, 48.86];
const sydney: LonLat = [151.21, -33.87];

describe("fabrique de projection", () => {
  it("planisphère : Winkel tripel inchangée, sans coupe ni rotation", () => {
    const winkel = makeProjection(W, H);
    expect(makeProjection(W, H, "planisphere")(paris)).toEqual(winkel(paris));
    expect(winkel.clipAngle() ?? 0).toBe(0);
    expect(winkel.rotate()).toEqual([0, 0, 0]);
  });

  it("globe : orthographique coupée à 90°, tournée, ajustée aux mêmes marges", () => {
    const globe = makeProjection(W, H, "globe", [-10, -45]);
    expect(globe.clipAngle()).toBe(90);
    expect(globe.rotate()).toEqual([-10, -45, 0]);
    // Le disque tient dans la zone utile [[76, 58], [W - 24, H - 48]] : la hauteur limite ici.
    const [cx, cy] = globe.translate();
    const r = globe.scale();
    expect(r).toBeCloseTo((H - 48 - 58) / 2, 5);
    expect(cy - r).toBeCloseTo(58, 5);
    expect(cy + r).toBeCloseTo(H - 48, 5);
    expect(cx).toBeCloseTo((76 + W - 24) / 2, 5);
  });

  it("la rotation n'a pas d'effet sur le planisphère", () => {
    expect(makeProjection(W, H, "planisphere", [90, 30])(paris)).toEqual(makeProjection(W, H)(paris));
  });
});

describe("centre et visibilité", () => {
  it("le centre du globe est [-λ, -φ]", () => {
    const [lon, lat] = viewCenter(makeProjection(W, H, "globe", [-10, -45]));
    expect(lon).toBeCloseTo(10, 6);
    expect(lat).toBeCloseTo(45, 6);
  });

  it("rotationCenteredOn place le point au centre du disque", () => {
    const globe = makeProjection(W, H, "globe", rotationCenteredOn(sydney));
    const [x, y] = globe(sydney)!;
    const [cx, cy] = globe.translate();
    expect(x).toBeCloseTo(cx, 6);
    expect(y).toBeCloseTo(cy, 6);
  });

  it("face cachée : un point à plus de 90° du centre n'est pas visible", () => {
    const globe = makeProjection(W, H, "globe", rotationCenteredOn(paris));
    expect(isPointVisible(globe, paris)).toBe(true);
    expect(isPointVisible(globe, sydney)).toBe(false);
    // Juste avant et juste après l'horizon, sur l'équateur vu depuis [0, 0].
    const equator = makeProjection(W, H, "globe", [0, 0]);
    expect(isPointVisible(equator, [89.9, 0])).toBe(true);
    expect(isPointVisible(equator, [90.1, 0])).toBe(false);
    expect(isPointVisible(equator, [-179, 10])).toBe(false);
  });

  it("le planisphère montre tous les points", () => {
    const winkel = makeProjection(W, H);
    for (const ll of [paris, sydney, [180, 0], [-180, -90]] as LonLat[]) expect(isPointVisible(winkel, ll)).toBe(true);
  });

  it("pointProjector : coordonnées des points visibles, null pour la face cachée", () => {
    const globe = makeProjection(W, H, "globe", rotationCenteredOn(paris));
    const toScreen = pointProjector(globe);
    expect(toScreen(paris)).toEqual(globe(paris));
    expect(toScreen(sydney)).toBeNull();
  });
});

describe("rotation au glisser", () => {
  const radius = 400;

  it("vers la droite, le globe montre l'ouest : λ augmente", () => {
    const [lambda, phi] = dragRotation([0, 0], 100, 0, 1, radius);
    expect(lambda).toBeCloseTo((100 / radius) * (180 / Math.PI), 6);
    expect(phi).toBe(0);
  });

  it("le point saisi au centre suit le pointeur (à l'équateur ; ailleurs, λ tourne autour de l'axe des pôles)", () => {
    const start = rotationCenteredOn([30, 0]);
    const before = makeProjection(W, H, "globe", start);
    const [x, y] = before([30, 0])!;
    const after = makeProjection(W, H, "globe", dragRotation(start, 12, -8, 1, before.scale()));
    const [x2, y2] = after([30, 0])!;
    expect(x2 - x).toBeCloseTo(12, 0);
    expect(y2 - y).toBeCloseTo(-8, 0);
  });

  it("la sensibilité est divisée par le zoom", () => {
    const [l1] = dragRotation([0, 0], 100, 0, 1, radius);
    const [l4] = dragRotation([0, 0], 100, 0, 4, radius);
    expect(l4).toBeCloseTo(l1 / 4, 6);
  });

  it("φ est borné à ±90°, λ reste dans [-180, 180[", () => {
    expect(dragRotation([0, 80], 0, -10_000, 1, radius)[1]).toBe(90);
    expect(dragRotation([0, -80], 0, 10_000, 1, radius)[1]).toBe(-90);
    const [lambda] = dragRotation([170, 0], (40 / 180) * Math.PI * radius, 0, 1, radius);
    expect(lambda).toBeCloseTo(-150, 6);
    expect(rotationCenteredOn([-180, 0])[0]).toBe(-180);
  });
});

describe("écran → [lon, lat] sur le globe", () => {
  const globe = makeProjection(W, H, "globe", rotationCenteredOn(paris));

  it("retrouve un point de la face visible, avec ou sans zoom", () => {
    const [x, y] = globe(paris)!;
    expect(screenToLL(globe, zoomIdentity, x, y)).toEqual(paris);
    const t = zoomIdentity.translate(-500, -300).scale(3);
    const [sx, sy] = t.apply([x, y]);
    const ll = screenToLL(globe, t, sx, sy)!;
    expect(geoDistance(ll, paris)).toBeLessThan(1e-5);
  });

  it("renvoie null hors du disque", () => {
    expect(screenToLL(globe, zoomIdentity, 2, 2)).toBeNull();
    expect(screenToLL(globe, zoomIdentity, W - 2, H / 2)).toBeNull();
  });

  it("centre de l'écran : le point géographique sous le milieu du <svg>", () => {
    const winkel = makeProjection(W, H);
    const center = screenCenterLL(winkel, zoomIdentity, W, H)!;
    const [x, y] = winkel(center)!;
    expect(x).toBeCloseTo(W / 2, 1);
    expect(y).toBeCloseTo(H / 2, 1);
    // Zoom sur l'Europe : le centre de l'écran est proche de Paris.
    const [px, py] = winkel(paris)!;
    const t = zoomIdentity.translate(W / 2 - px * 8, H / 2 - py * 8).scale(8);
    const zoomed = screenCenterLL(winkel, t, W, H)!;
    expect(geoDistance(zoomed, paris)).toBeLessThan(1e-4);
    // Hors de la carte (coin de l'écran au zoom) : null.
    expect(screenCenterLL(winkel, zoomIdentity.scale(20), 40, 40)).toBeNull();
  });
});
