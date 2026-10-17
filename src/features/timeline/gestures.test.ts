import { describe, expect, it } from "vitest";
import { DRAG_THRESHOLD, WHEEL_LINE_PX, WHEEL_ZOOM, dragViewport, wheelToViewport } from "./gestures";
import type { WheelInput } from "./gestures";
import { FULL_VIEW, MIN_SPAN, panViewport, zoomViewport } from "./viewport";

const view = { start: 1900, end: 2000 };
const wheel = (patch: Partial<WheelInput>): WheelInput => ({ deltaX: 0, deltaY: 0, deltaMode: 0, shiftKey: false, ...patch });
const span = (v: { start: number; end: number }) => v.end - v.start;

describe("molette sur la frise", () => {
  it("molette verticale : zoom autour du pointeur, la date sous le pointeur ne bouge pas", () => {
    const next = wheelToViewport(view, wheel({ deltaY: -100 }), 1000, 0.25)!;
    expect(next).toEqual(zoomViewport(view, Math.exp(100 * WHEEL_ZOOM), 0.25));
    expect(span(next)).toBeLessThan(100);
    // Date sous le pointeur (au quart de la largeur) : 1925, avant comme après.
    expect(next.start + span(next) * 0.25).toBeCloseTo(1925, 9);
    // Vers le bas : dézoom.
    expect(span(wheelToViewport(view, wheel({ deltaY: 100 }), 1000, 0.5)!)).toBeGreaterThan(100);
  });

  it("défilement horizontal ou Maj + molette : déplacement", () => {
    expect(wheelToViewport(view, wheel({ deltaX: 100, deltaY: 10 }), 1000, 0.5)).toEqual(panViewport(view, 0.1));
    expect(wheelToViewport(view, wheel({ deltaY: -100, shiftKey: true }), 1000, 0.5)).toEqual(panViewport(view, -0.1));
    // Maj avec un défilement seulement horizontal (certaines souris).
    expect(wheelToViewport(view, wheel({ deltaX: 50, shiftKey: true }), 1000, 0.5)).toEqual(panViewport(view, 0.05));
  });

  it("défilement en lignes ramené en pixels", () => {
    expect(wheelToViewport(view, wheel({ deltaX: 3, deltaMode: 1 }), 1000, 0.5)).toEqual(
      panViewport(view, (3 * WHEEL_LINE_PX) / 1000),
    );
    expect(wheelToViewport(view, wheel({ deltaY: -3, deltaMode: 1 }), 1000, 0.5)).toEqual(
      zoomViewport(view, Math.exp(3 * WHEEL_LINE_PX * WHEEL_ZOOM), 0.5),
    );
  });

  it("zoom sans effet (maximal ou toute la frise) : laissé à la page, qui peut défiler", () => {
    const tight = { start: 1914, end: 1914 + MIN_SPAN };
    expect(wheelToViewport(tight, wheel({ deltaY: -100 }), 1000, 0.5)).toBeNull();
    expect(wheelToViewport(FULL_VIEW, wheel({ deltaY: 100 }), 1000, 0.5)).toBeNull();
    // Dans l'autre sens, la vue change.
    expect(wheelToViewport(tight, wheel({ deltaY: 100 }), 1000, 0.5)).not.toBeNull();
    expect(wheelToViewport(view, wheel({}), 1000, 0.5)).toBeNull();
    expect(wheelToViewport(view, wheel({ deltaY: -100 }), 0, 0.5)).toBeNull();
  });

  it("déplacement bloqué au bord : gardé par la frise (pas de « page précédente »)", () => {
    expect(wheelToViewport(FULL_VIEW, wheel({ deltaX: -100 }), 1000, 0.5)).toEqual(FULL_VIEW);
  });
});

describe("glisser sur la frise", () => {
  const start = { x: 500, view, moved: false };

  it("reste un clic sous le seuil, puis la vue suit le pointeur", () => {
    expect(dragViewport(start, 500 + DRAG_THRESHOLD - 1, 1000)).toBeNull();
    // Vers la droite : on remonte le temps.
    expect(dragViewport(start, 600, 1000)).toEqual(panViewport(view, -0.1));
    // Déjà un glisser : même un petit écart déplace la vue.
    expect(dragViewport({ ...start, moved: true }, 501, 1000)).toEqual(panViewport(view, -0.001));
    expect(dragViewport(start, 600, 0)).toBeNull();
  });
});
