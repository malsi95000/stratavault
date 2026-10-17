import { describe, expect, it } from "vitest";
import { parseFicheDate } from "./dates";
import { collectEntries } from "./entries";
import type { Entry } from "./entries";
import { timelineDoc } from "./fixtures";
import { entryContext, entryDate, entryDescription, entryTitle, rangeLabel, viewportLabel } from "./labels";
import {
  AXIS_GAP,
  LANE_HEIGHT,
  MAX_LANES,
  TICKS_HEIGHT,
  assignLanes,
  extentOf,
  groupEntries,
  groupSignature,
  laneCount,
  outsideView,
  partitionEntries,
} from "./layout";
import type { DatedEntry } from "./layout";

/** Fiche minimale datée, pour les tests de placement. */
function dated(key: string, date: string): DatedEntry {
  const when = parseFicheDate(date)!;
  const entry: Entry = {
    key,
    kind: "o",
    owner: key,
    ref: `o:${key}`,
    target: { k: "o", id: key },
    main: true,
    title: key,
    date,
    when,
    color: null,
    category: null,
  };
  return entry as DatedEntry;
}

describe("répartition des fiches", () => {
  it("frise triée, fiches hors de 1800–2100 et fiches sans date à part", () => {
    const { dated: on, outside, undated } = partitionEntries(collectEntries(timelineDoc()));
    expect(on.map((e) => e.key)).toEqual(["main:c:FRA", "main:p:p1", "flux:vert", "fiche:x1", "main:l:l1", "fiche:x3", "main:o:o1"]);
    expect(outside.map((e) => e.key)).toEqual(["main:t:t1"]);
    expect(undated.map((e) => e.key)).toEqual(["fiche:x2", "main:c:DEU", "main:c:BEL", "main:z:z1"]);
  });

  it("une date illisible compte comme « sans date »", () => {
    const e = { ...dated("a", "1914"), date: "vers 1914", when: null };
    expect(partitionEntries([e]).undated).toHaveLength(1);
  });

  it("période couverte (fin exclue)", () => {
    expect(extentOf([])).toBeNull();
    expect(extentOf([dated("a", "1914-08-03"), dated("b", "1918")])).toEqual({ start: parseFicheDate("1914-08-03")!.value, end: 1919 });
  });
});

describe("regroupement et lignes", () => {
  const view = { start: 1900, end: 2000 };

  it("regroupe les fiches trop proches à l'écran, au milieu du groupe", () => {
    const entries = [dated("a", "1914"), dated("b", "1915"), dated("c", "1916"), dated("d", "1950")];
    // 10 px par an : b est à 10 px de a (regroupés), c à 20 px de a (au-delà de 18 px) : a+b, c, d.
    const groups = groupEntries(entries, view, 1000);
    expect(groups.map((g) => g.entries.map((e) => e.key))).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(groups[0]).toMatchObject({ key: "a", x: 145 });
    // Plus zoomé, plus de groupes ; plus large, tout est regroupé.
    expect(groupEntries(entries, { start: 1910, end: 1920 }, 1000).every((g) => g.entries.length === 1)).toBe(true);
    expect(groupEntries(entries, view, 1000, 400)).toHaveLength(1);
  });

  it("ne garde que les groupes visibles, sans marge", () => {
    const entries = [dated("a", "1850"), dated("b", "1950"), dated("c", "2050")];
    expect(groupEntries(entries, view, 1000).map((g) => g.key)).toEqual(["b"]);
  });

  it("un groupe juste hors de la vue n'a pas d'étiquette et ne prend pas la ligne d'un groupe visible", () => {
    // « a » est 5 ans avant le début de la vue (x = −50) : il n'est pas gardé ; « b » (x = 10) prend la ligne 0.
    const entries = [dated("a", "1895"), dated("b", "1901"), dated("c", "2000-06")];
    const groups = assignLanes(groupEntries(entries, view, 1000), 1000, 176, 1);
    expect(groups.map((g) => [g.key, g.lane])).toEqual([["b", 0]]);
    expect(groups.every((g) => g.x >= 0 && g.x <= 1000)).toBe(true);
  });

  it("une fiche visible au bord n'est pas entraînée hors de la vue par une voisine invisible", () => {
    // 10 px par an : « 1899 » à x = −10 (hors de la vue), « 1900-06 » à x ≈ 4 (visible).
    const left = groupEntries([dated("a", "1899"), dated("b", "1900-06")], view, 1000);
    expect(left.map((g) => g.entries.map((e) => e.key))).toEqual([["b"]]);
    expect(left[0].x).toBeGreaterThanOrEqual(0);
    // Bord droit : x = 995 (visible) et x = 1010 (hors de la vue).
    const right = groupEntries([dated("c", "1999-06"), dated("d", "2001")], view, 1000);
    expect(right.map((g) => g.entries.map((e) => e.key))).toEqual([["c"]]);
    // Un groupe gardé ne compte pas une fiche hors de l'écran (−8 px et 9 px).
    const mixed = groupEntries([dated("e", "1899-03"), dated("f", "1900-12")], view, 1000);
    expect(mixed.map((g) => g.entries.map((e) => e.key))).toEqual([["f"]]);
  });

  it("fiches avant et après la vue", () => {
    const entries = [dated("a", "1850"), dated("b", "1890"), dated("c", "1950"), dated("d", "2050")];
    expect(outsideView(entries, view)).toEqual({ before: 2, after: 1 });
    expect(outsideView([], view)).toEqual({ before: 0, after: 0 });
  });

  it("signature d'un groupe : change avec ses fiches, même si sa première fiche reste la même", () => {
    const entries = [dated("a", "1914-08-01"), dated("b", "1914-08-20"), dated("c", "1916-02-21")];
    const wide = groupEntries(entries, view, 1000);
    const zoomed = groupEntries(entries, { start: 1910, end: 1920 }, 1000);
    expect(wide[0].key).toBe(zoomed[0].key);
    expect(groupSignature(wide[0].entries)).not.toBe(groupSignature(zoomed[0].entries));
    expect(groupSignature(zoomed[0].entries)).toBe(groupSignature([{ key: "a" }, { key: "b" }]));
  });

  it("range les étiquettes sans chevauchement, sinon sans étiquette", () => {
    const groups = [0, 50, 100, 300, 990].map((x, i) => ({ key: String(i), x, entries: [] }));
    const placed = assignLanes(groups, 1000, 120, 2);
    expect(placed.map((g) => g.lane)).toEqual([0, 1, null, 0, 0]);
    // Au bord droit, l'étiquette est décalée vers la gauche pour rester dans la frise.
    expect(placed[4].left).toBe(880);
    expect(placed[0].left).toBe(0);
    expect(assignLanes(groups, 1000, 120, 0).every((g) => g.lane === null)).toBe(true);
  });

  it("nombre de lignes selon la hauteur", () => {
    expect(laneCount(0)).toBe(0);
    expect(laneCount(TICKS_HEIGHT + AXIS_GAP + 8 + LANE_HEIGHT)).toBe(1);
    expect(laneCount(5000)).toBe(MAX_LANES);
  });
});

describe("textes de la frise", () => {
  const doc = timelineDoc();
  const e = new Map(collectEntries(doc).map((x) => [x.key, x]));

  it("titre et élément porteur", () => {
    expect(entryTitle(doc, e.get("main:l:l1")!)).toBe("France – Allemagne");
    expect(entryContext(doc, e.get("main:l:l1")!)).toBe("Lien");
    expect(entryTitle(doc, e.get("main:c:FRA")!)).toBe("France");
    expect(entryContext(doc, e.get("main:c:FRA")!)).toBe("Pays");
    expect(entryContext(doc, e.get("main:p:p1")!)).toBe("Balise");
    expect(entryContext(doc, e.get("fiche:x1")!)).toBe("Fiche de France");
    expect(entryContext(doc, e.get("fiche:x3")!)).toBe("Fiche de France – Allemagne");
    expect(entryContext(doc, e.get("flux:vert")!)).toBe("Flux");
  });

  it("dates et description", () => {
    expect(entryDate(e.get("fiche:x1")!)).toBe("21 févr. 1916");
    expect(entryDate(e.get("fiche:x2")!)).toBe("Sans date");
    expect(entryDate({ ...e.get("fiche:x2")!, date: "vers 1914" })).toBe("vers 1914");
    expect(entryDescription(doc, e.get("fiche:x1")!)).toBe("Verdun — 21 févr. 1916 — Fiche de France — Catégorie : Conflits");
    expect(rangeLabel(parseFicheDate("1914")!, parseFicheDate("1914")!)).toBe("1914");
    expect(rangeLabel(parseFicheDate("1914-08")!, parseFicheDate("1918-11")!)).toBe("août 1914 – nov. 1918");
  });

  it("années visibles", () => {
    expect(viewportLabel({ start: 1914, end: 1919 })).toBe("1914 – 1918");
    expect(viewportLabel({ start: 1914.2, end: 1914.7 })).toBe("1914");
    expect(viewportLabel({ start: 1800, end: 2101 })).toBe("1800 – 2100");
  });
});
