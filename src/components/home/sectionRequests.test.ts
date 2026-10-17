import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROOT } from "@/test/sourceFiles";
import { OPEN_SECTION_EVENT, requestSection } from "./homeNav";
import { PANEL_OPEN_FALLBACK_MS, watchSectionRequests, whenPanelOpened, type SectionWindow } from "./sectionRequests";

/** Fenêtre minimale : une vraie cible d'événements, et des images qui ne passent qu'à la demande. */
function fakeWindow(hash = "") {
  const target = new EventTarget();
  const frames = new Map<number, () => void>();
  let next = 0;
  const win: SectionWindow = {
    location: { hash },
    addEventListener: (type, listener) => target.addEventListener(type, listener),
    removeEventListener: (type, listener) => target.removeEventListener(type, listener),
    requestAnimationFrame: (callback) => {
      frames.set(++next, callback);
      return next;
    },
    cancelAnimationFrame: (handle) => void frames.delete(handle),
  };
  const flushFrames = () => {
    for (const [handle, callback] of [...frames]) {
      frames.delete(handle);
      callback();
    }
  };
  return { win, target, flushFrames };
}

function watch(hash = "") {
  const fake = fakeWindow(hash);
  const opened: string[] = [];
  const stop = watchSectionRequests(fake.win, (id) => opened.push(id));
  return { ...fake, opened, stop };
}

const menuEvent = (detail: unknown) => new CustomEvent(OPEN_SECTION_EVENT, { detail });

describe("ouverture d'un onglet depuis le menu ou l'adresse", () => {
  it("ouvre l'onglet de l'ancre au chargement, une image plus tard (après l'hydratation)", () => {
    const { opened, flushFrames } = watch("#projection");
    expect(opened).toEqual([]);
    flushFrames();
    expect(opened).toEqual(["projection"]);
  });

  it("suit les changements d'ancre et ignore celles qui ne sont pas des onglets", () => {
    const { win, target, opened, flushFrames } = watch("#faq");
    flushFrames();
    win.location.hash = "#limites";
    target.dispatchEvent(new Event("hashchange"));
    win.location.hash = "#accueil";
    target.dispatchEvent(new Event("hashchange"));
    expect(opened).toEqual(["limites"]);
  });

  it("répond au menu à chaque clic, même quand l'adresse ne change pas", () => {
    const { target, opened } = watch("#apropos");
    target.dispatchEvent(menuEvent("apropos"));
    target.dispatchEvent(menuEvent("apropos"));
    target.dispatchEvent(menuEvent("inconnu"));
    target.dispatchEvent(menuEvent(42));
    expect(opened).toEqual(["apropos", "apropos"]);
  });

  it("ne réagit plus après le nettoyage, image en attente comprise", () => {
    const { target, opened, flushFrames, stop } = watch("#projection");
    stop();
    flushFrames();
    target.dispatchEvent(new Event("hashchange"));
    target.dispatchEvent(menuEvent("limites"));
    expect(opened).toEqual([]);
  });

  it("reçoit l'événement envoyé par le menu fixe", () => {
    const fake = fakeWindow();
    const opened: string[] = [];
    vi.stubGlobal("window", fake.target);
    try {
      watchSectionRequests(fake.win, (id) => opened.push(id));
      requestSection("limites");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(opened).toEqual(["limites"]);
  });
});

describe("recalage de la page une fois l'onglet déplié", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const transitionEnd = (propertyName: string) => Object.assign(new Event("transitionend"), { propertyName });

  it("attend la fin du dépliement (hauteur), pas celle d'une autre transition", () => {
    vi.useFakeTimers();
    const panel = new EventTarget();
    const done = vi.fn();
    whenPanelOpened(panel, true, done);
    panel.dispatchEvent(transitionEnd("opacity"));
    expect(done).not.toHaveBeenCalled();
    panel.dispatchEvent(transitionEnd("max-height"));
    expect(done).toHaveBeenCalledTimes(1);
    // Ni la minuterie de secours ni une seconde fin de transition ne relancent le recalage.
    vi.advanceTimersByTime(PANEL_OPEN_FALLBACK_MS);
    panel.dispatchEvent(transitionEnd("max-height"));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("recale quand même sans transition (onglet déjà ouvert)", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    whenPanelOpened(new EventTarget(), true, done);
    vi.advanceTimersByTime(PANEL_OPEN_FALLBACK_MS - 1);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("recale tout de suite quand les animations sont réduites", () => {
    const done = vi.fn();
    whenPanelOpened(new EventTarget(), false, done);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("n'agit plus une fois annulé (démontage, nouvelle demande)", () => {
    vi.useFakeTimers();
    const panel = new EventTarget();
    const done = vi.fn();
    whenPanelOpened(panel, true, done)();
    panel.dispatchEvent(transitionEnd("max-height"));
    vi.advanceTimersByTime(PANEL_OPEN_FALLBACK_MS);
    expect(done).not.toHaveBeenCalled();
  });

  it("est branché sur les onglets de l'accueil, qui se recalent sur le titre demandé", () => {
    const tabs = readFileSync(join(ROOT, "src/components/home/HomeTabs.tsx"), "utf8");
    expect(tabs).toContain("watchSectionRequests(window,");
    expect(tabs).toContain('whenPanelOpened(panel, animated, () => target.scrollIntoView({ block: "start" }))');
    expect(tabs).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
  });
});
