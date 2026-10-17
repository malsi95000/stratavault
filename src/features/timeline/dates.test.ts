import { describe, expect, it } from "vitest";
import { compareFicheDates, daysInMonth, endOf, formatFicheDate, monthStart, parseFicheDate } from "./dates";

describe("dates des fiches", () => {
  it("lit le format du champ Date (AAAA-MM-JJ) en années décimales", () => {
    expect(parseFicheDate("1914-01-01")).toEqual({ year: 1914, month: 1, day: 1, value: 1914 });
    const d = parseFicheDate("1914-08-03")!;
    expect(d).toMatchObject({ year: 1914, month: 8, day: 3 });
    // 31 + 28 + 31 + 30 + 31 + 30 + 31 = 212 jours avant août, plus 2.
    expect(d.value).toBeCloseTo(1914 + 214 / 365, 10);
    expect(parseFicheDate("2000-12-31")!.value).toBeCloseTo(2000 + 365 / 366, 10);
  });

  it("accepte une année seule, un mois, et JJ/MM/AAAA (imports)", () => {
    expect(parseFicheDate("1945")).toEqual({ year: 1945, value: 1945 });
    expect(parseFicheDate(" 1945-05 ")).toMatchObject({ year: 1945, month: 5 });
    expect(parseFicheDate("08/05/1945")).toMatchObject({ year: 1945, month: 5, day: 8 });
  });

  it("refuse les dates vides, illisibles ou impossibles", () => {
    for (const bad of [undefined, "", "   ", "hier", "1914-13-01", "1914-02-30", "1900-02-29", "1914-08-03T10:00", "1914/08/03", "-500", "12345"]) {
      expect(parseFicheDate(bad), String(bad)).toBeNull();
    }
    expect(parseFicheDate("2000-02-29")).not.toBeNull();
  });

  it("jours des mois et début des mois", () => {
    expect([1, 2, 4, 12].map((m) => daysInMonth(2023, m))).toEqual([31, 28, 30, 31]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(monthStart(1914, 1)).toBe(1914);
    expect(monthStart(1914, 7)).toBeCloseTo(1914 + 181 / 365, 10);
  });

  it("une date couvre toute sa durée (jour, mois, année)", () => {
    expect(endOf(parseFicheDate("1916")!)).toBe(1917);
    expect(endOf(parseFicheDate("1916-12")!)).toBe(1917);
    expect(endOf(parseFicheDate("1916-06")!)).toBeCloseTo(monthStart(1916, 7), 10);
    const day = parseFicheDate("1916-06-30")!;
    expect(endOf(day)).toBeCloseTo(monthStart(1916, 7), 10);
  });

  it("écrit la date en français à la précision connue", () => {
    expect(formatFicheDate(parseFicheDate("1914")!)).toBe("1914");
    expect(formatFicheDate(parseFicheDate("1914-08")!)).toBe("août 1914");
    expect(formatFicheDate(parseFicheDate("1914-08-03")!)).toBe("3 août 1914");
  });

  it("ordre chronologique : à valeur égale, la moins précise d'abord", () => {
    const dates = ["1914-08-03", "1914", "1913-12-31", "1914-01-01", "1914-01"].map((s) => parseFicheDate(s)!);
    expect(dates.sort(compareFicheDates).map(formatFicheDate)).toEqual([
      "31 déc. 1913",
      "1914",
      "janv. 1914",
      "1er janv. 1914",
      "3 août 1914",
    ]);
  });
});
