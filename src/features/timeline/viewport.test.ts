import { describe, expect, it } from "vitest";
import { parseFicheDate } from "./dates";
import { extentOf, groupEntries } from "./layout";
import type { DatedEntry } from "./layout";
import { timelineTicks, tickStep } from "./ticks";
import {
  FULL_VIEW,
  MIN_SPAN,
  TIMELINE_END,
  TIMELINE_START,
  clampViewport,
  fitViewport,
  groupZoomViewport,
  inTimeline,
  panViewport,
  toX,
  zoomViewport,
} from "./viewport";

/** Fiche minimale datée. */
const dated = (key: string, date: string) =>
  ({
    key,
    kind: "o",
    owner: key,
    ref: `o:${key}`,
    target: { k: "o", id: key },
    main: true,
    title: key,
    date,
    when: parseFicheDate(date)!,
    color: null,
    category: null,
  }) satisfies DatedEntry;

const close = (v: { start: number; end: number }, start: number, end: number) => {
  expect(v.start).toBeCloseTo(start, 9);
  expect(v.end).toBeCloseTo(end, 9);
};

describe("vue de la frise", () => {
  it("couvre 1800 à 2100 inclus", () => {
    expect(FULL_VIEW).toEqual({ start: 1800, end: 2101 });
    expect(inTimeline(1800)).toBe(true);
    expect(inTimeline(2100.99)).toBe(true);
    expect(inTimeline(1799.99)).toBe(false);
    expect(inTimeline(2101)).toBe(false);
  });

  it("reste dans la frise, entre six mois et toute la frise", () => {
    close(clampViewport({ start: 1700, end: 1750 }), 1800, 1850);
    close(clampViewport({ start: 2090, end: 2120 }), 2071, 2101);
    close(clampViewport({ start: 1500, end: 2500 }), TIMELINE_START, TIMELINE_END);
    close(clampViewport({ start: 1914, end: 1914.1 }), 1914.05 - MIN_SPAN / 2, 1914.05 + MIN_SPAN / 2);
    close(clampViewport({ start: Number.NaN, end: 1 }), TIMELINE_START, TIMELINE_END);
  });

  it("zoome autour d'un point qui ne bouge pas", () => {
    close(zoomViewport({ start: 1900, end: 2000 }, 2), 1925, 1975);
    // Ancre au quart : 1925 reste au quart de la largeur.
    const v = zoomViewport({ start: 1900, end: 2000 }, 2, 0.25);
    close(v, 1912.5, 1962.5);
    expect(v.start + (v.end - v.start) * 0.25).toBeCloseTo(1925, 9);
    close(zoomViewport({ start: 1900, end: 2000 }, 0.01), TIMELINE_START, TIMELINE_END);
    expect(zoomViewport({ start: 1914, end: 1915 }, 100).end - zoomViewport({ start: 1914, end: 1915 }, 100).start).toBeCloseTo(MIN_SPAN, 9);
  });

  it("se déplace d'une part de l'étendue, sans sortir de la frise", () => {
    close(panViewport({ start: 1900, end: 2000 }, 0.5), 1950, 2050);
    close(panViewport({ start: 1900, end: 2000 }, -2), 1800, 1900);
    close(panViewport({ start: 1900, end: 2000 }, 5), 2001, 2101);
  });

  it("se cadre sur des fiches, avec une marge et au moins dix ans", () => {
    const v = fitViewport(1914, 1919);
    close(v, 1911.5, 1921.5);
    const wide = fitViewport(1900, 2000);
    close(wide, 1892, 2008);
    expect(fitViewport(Number.NaN, 1)).toEqual(FULL_VIEW);
    close(fitViewport(1800, 1801), 1800, 1810);
  });

  it("zoom sur un groupe : étendue minimale de six mois, qui sépare des fiches d'un même mois", () => {
    // Août 1914 : le 3, le 20 et le 31. Cadrage automatique (dix ans) : un seul groupe à 1000 px.
    const entries = ["1914-08-03", "1914-08-20", "1914-08-31"].map((d, i) => dated(String(i), d));
    const extent = extentOf(entries)!;
    expect(groupEntries(entries, fitViewport(extent.start, extent.end), 1000)).toHaveLength(1);
    const zoomed = fitViewport(extent.start, extent.end, MIN_SPAN);
    expect(zoomed.end - zoomed.start).toBeCloseTo(MIN_SPAN, 9);
    expect(groupEntries(entries, zoomed, 1000).map((g) => g.entries.length)).toEqual([1, 1, 1]);
  });

  it("place une date en pixels", () => {
    expect(toX({ start: 1900, end: 2000 }, 1950, 1000)).toBe(500);
    expect(toX({ start: 1900, end: 2000 }, 1890, 1000)).toBe(-100);
  });
});

describe("graduations", () => {
  it("choisit un pas lisible selon le zoom", () => {
    expect(tickStep(FULL_VIEW, 1300)).toEqual({ years: 20 });
    expect(tickStep(FULL_VIEW, 1200)).toEqual({ years: 50 });
    expect(tickStep({ start: 1900, end: 2000 }, 1000)).toEqual({ years: 10 });
    expect(tickStep({ start: 1914, end: 1924 }, 1000)).toEqual({ years: 1 });
    expect(tickStep({ start: 1914, end: 1919 }, 1000)).toEqual({ months: 6 });
    expect(tickStep({ start: 1914, end: 1916 }, 1000)).toEqual({ months: 3 });
    expect(tickStep({ start: 1914, end: 1914.5 }, 1000)).toEqual({ months: 1 });
    expect(tickStep(FULL_VIEW, 100)).toEqual({ years: 100 });
  });

  it("graduations en années, puis en mois", () => {
    expect(timelineTicks({ start: 1900, end: 2000 }, 1000).map((t) => t.label)).toEqual(
      ["1900", "1910", "1920", "1930", "1940", "1950", "1960", "1970", "1980", "1990", "2000"],
    );
    const months = timelineTicks({ start: 1914, end: 1915.01 }, 1200);
    expect(months.map((t) => t.label)).toEqual(["1914", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc.", "1915"]);
    expect(months.filter((t) => t.major).map((t) => t.label)).toEqual(["1914", "1915"]);
    expect(timelineTicks(FULL_VIEW, 0)).toEqual([]);
  });

  it("pas de graduation « 2101 » au bout de la frise (fin exclue)", () => {
    // Pas de six mois : janvier et juillet de 2095 à 2100, sans janvier 2101.
    const years = timelineTicks({ start: 2095, end: TIMELINE_END }, 1000);
    expect(years.filter((t) => t.major).map((t) => t.label)).toEqual(["2095", "2096", "2097", "2098", "2099", "2100"]);
    expect(years.at(-1)!.label).toBe("juil.");
    expect(timelineTicks({ start: 2095, end: TIMELINE_END }, 600).map((t) => t.label)).toEqual(["2095", "2096", "2097", "2098", "2099", "2100"]);
    const months = timelineTicks({ start: 2100.5, end: TIMELINE_END }, 1000);
    expect(months.at(-1)!.label).toBe("déc.");
    expect(months.every((t) => t.value < TIMELINE_END)).toBe(true);
    expect(timelineTicks(FULL_VIEW, 1200).map((t) => t.label)).toEqual(["1800", "1850", "1900", "1950", "2000", "2050", "2100"]);
  });
});

describe("zoom sur un groupe", () => {
  it("zoome jusqu'à six mois, sinon rien (bouton désactivé)", () => {
    const august = { start: 1914 + 214 / 365, end: 1914 + 216 / 365 };
    const next = groupZoomViewport({ start: 1910, end: 1920 }, august.start, august.end)!;
    expect(next.end - next.start).toBeCloseTo(MIN_SPAN, 9);
    // Déjà au zoom maximal : un nouveau clic ne changerait rien.
    expect(groupZoomViewport(next, august.start, august.end)).toBeNull();
    expect(groupZoomViewport({ start: 1914.2, end: 1914.7 }, august.start, august.end)).toBeNull();
    // Déjà cadrée sur un groupe plus étendu que six mois.
    const wide = fitViewport(1914, 1916, MIN_SPAN);
    expect(groupZoomViewport(wide, 1914, 1916)).toBeNull();
  });
});
