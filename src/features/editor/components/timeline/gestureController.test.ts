import { describe, expect, it, vi } from "vitest";
import { WHEEL_ZOOM } from "@/features/timeline/gestures";
import { MIN_SPAN, panViewport, zoomViewport } from "@/features/timeline/viewport";
import type { Viewport } from "@/features/timeline/viewport";
import { createGestureController } from "./gestureController";

/** Contrôleur branché sur une vue modifiable et des images déclenchées à la main. */
function setup(initial: Viewport = { start: 1900, end: 2000 }) {
  let view = initial;
  const frames: (() => void)[] = [];
  const onChange = vi.fn((next: Viewport) => {
    view = next;
  });
  const cancelFrame = vi.fn();
  const gestures = createGestureController({
    getView: () => view,
    onChange,
    requestFrame: (callback) => frames.push(callback),
    cancelFrame,
  });
  const nextFrame = () => frames.splice(0).forEach((f) => f());
  return { gestures, onChange, cancelFrame, frames, nextFrame };
}
const wheel = (deltaY: number, deltaX = 0) => ({ deltaX, deltaY, deltaMode: 0, shiftKey: false });
const click = () => ({ stopPropagation: vi.fn(), preventDefault: vi.fn() });

describe("gestes de la frise", () => {
  it("molette : une seule vue transmise par image, les crans de la même image s'enchaînent", () => {
    const { gestures, onChange, frames, nextFrame } = setup();
    expect(gestures.wheel(wheel(-100), 1000, 0.5)).toBe(true);
    expect(gestures.wheel(wheel(-100), 1000, 0.5)).toBe(true);
    expect(frames).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
    nextFrame();
    const once = zoomViewport({ start: 1900, end: 2000 }, Math.exp(100 * WHEEL_ZOOM), 0.5);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(zoomViewport(once, Math.exp(100 * WHEEL_ZOOM), 0.5));
  });

  it("molette sans effet au zoom maximal : laissée à la page, rien n'est transmis", () => {
    const { gestures, frames } = setup({ start: 1914, end: 1914 + MIN_SPAN });
    expect(gestures.wheel(wheel(-100), 1000, 0.5)).toBe(false);
    expect(frames).toHaveLength(0);
  });

  it("glisser : déplace la vue, capture le pointeur une fois, et le clic qui suit est annulé", () => {
    const { gestures, onChange, nextFrame } = setup();
    const capture = vi.fn();
    gestures.pointerDown({ pointerId: 1, clientX: 500, isPrimary: true, button: 0 });
    gestures.pointerMove({ pointerId: 1, clientX: 502 }, 1000, capture);
    expect(capture).not.toHaveBeenCalled();
    gestures.pointerMove({ pointerId: 1, clientX: 550 }, 1000, capture);
    gestures.pointerMove({ pointerId: 1, clientX: 600 }, 1000, capture);
    expect(capture).toHaveBeenCalledTimes(1);
    nextFrame();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(panViewport({ start: 1900, end: 2000 }, -0.1));
    // Un autre pointeur ne termine pas le glisser.
    gestures.pointerUp({ pointerId: 2 });
    gestures.pointerUp({ pointerId: 1 });
    const after = click();
    gestures.clickCapture(after);
    expect(after.stopPropagation).toHaveBeenCalled();
    expect(after.preventDefault).toHaveBeenCalled();
    // Le clic suivant passe.
    const next = click();
    gestures.clickCapture(next);
    expect(next.stopPropagation).not.toHaveBeenCalled();
  });

  it("simple clic, bouton secondaire ou appui annulé : le clic passe, la vue ne bouge pas", () => {
    const { gestures, frames } = setup();
    gestures.pointerDown({ pointerId: 1, clientX: 500, isPrimary: true, button: 0 });
    gestures.pointerMove({ pointerId: 1, clientX: 501 }, 1000, vi.fn());
    gestures.pointerUp({ pointerId: 1 });
    const c = click();
    gestures.clickCapture(c);
    expect(c.stopPropagation).not.toHaveBeenCalled();
    gestures.pointerDown({ pointerId: 1, clientX: 500, isPrimary: true, button: 2 });
    gestures.pointerMove({ pointerId: 1, clientX: 700 }, 1000, vi.fn());
    gestures.pointerDown({ pointerId: 3, clientX: 500, isPrimary: true, button: 0 });
    gestures.pointerCancel();
    gestures.pointerMove({ pointerId: 3, clientX: 700 }, 1000, vi.fn());
    expect(frames).toHaveLength(0);
  });

  it("démonté : l'image en attente est annulée", () => {
    const { gestures, cancelFrame, onChange, nextFrame } = setup();
    gestures.wheel(wheel(-100), 1000, 0.5);
    gestures.dispose();
    expect(cancelFrame).toHaveBeenCalledTimes(1);
    nextFrame();
    expect(onChange).not.toHaveBeenCalled();
  });
});
