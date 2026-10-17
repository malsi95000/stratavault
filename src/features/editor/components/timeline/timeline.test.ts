import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER } from "@/features/filters/filter";
import type { Filter } from "@/features/filters/filter";
import { blankDoc } from "@/features/map-doc/schema";
import { collectEntries } from "@/features/timeline/entries";
import { timelineDoc } from "@/features/timeline/fixtures";
import { entryLabels } from "@/features/timeline/labels";
import { partitionEntries } from "@/features/timeline/layout";
import type { Group } from "@/features/timeline/layout";
import { useEditorStore } from "@/features/editor/store";
import type { EditorState } from "@/features/editor/store";
import { useViewStore } from "@/features/editor/viewStore";
import FilterStatus from "../filters/FilterStatus";
import FiltersButton from "../filters/FiltersButton";
import FiltersPanel from "../filters/FiltersPanel";
import { PERIOD_INVALID, PERIOD_REVERSED, periodProblem } from "../filters/PeriodFields";
import ViewSwitch from "../ViewSwitch";
import EntryList from "./EntryList";
import { entryColor } from "./entryColor";
import TimelineCard from "./TimelineCard";
import { handleTrackKey, keyToViewport } from "./TimelineTrack";
import TimelineView from "./TimelineView";

// Le rendu serveur lit l'état initial des stores : on le remplace le temps d'un test.
const initial = useEditorStore.getInitialState();
const saved: Partial<EditorState> = {
  doc: initial.doc,
  selection: initial.selection,
  filter: initial.filter,
  filtersOpen: initial.filtersOpen,
  hydrated: initial.hydrated,
};
afterEach(() => Object.assign(initial, saved));

function state(patch: Partial<Omit<EditorState, "filter">> & { filter?: Partial<Filter> }) {
  const { filter, ...rest } = patch;
  Object.assign(initial, { doc: timelineDoc(), ...rest, filter: { ...EMPTY_FILTER, ...filter } });
}
const render = <P extends object>(component: ComponentType<P>, props: P = {} as P) =>
  renderToStaticMarkup(createElement(component, props));

describe("vue frise (EDI-07)", () => {
  it("en-tête, navigation, et fiches sans date ou hors période listées à part", () => {
    state({});
    const html = render(TimelineView);
    expect(html).toContain("Frise chronologique");
    expect(html).toContain("7 fiches datées");
    // Cadrée d’elle-même sur les fiches (août 1914 – juin 1919, au moins dix ans).
    expect(html).toContain("1912 – 1922");
    for (const label of ["Plus tôt", "Dézoomer", "Zoomer", "Plus tard"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain("Ajuster");
    expect(html).toContain("1800–2100");
    expect(html).toContain("4 fiches sans date (ou date illisible), absentes de la frise");
    expect(html).toContain("1 fiche datée hors de la période 1800–2100");
    // Listes repliées : rendues seulement une fois dépliées (un zoom ne les recalcule pas).
    expect(html).not.toContain("Avant la frise");
    const { outside, undated } = partitionEntries(collectEntries(timelineDoc()));
    const list = render(EntryList, { doc: timelineDoc(), entries: [...outside, ...undated], currentKey: null, onOpen: () => {} });
    expect(list).toContain("Avant la frise");
    expect(list).toContain("Fiche de France");
    // Période visible annoncée aux lecteurs d'écran.
    expect(html).toContain('aria-live="polite" aria-atomic="true" class="sr-only">1912 – 1922 · 7 fiches datées<');
    expect(html).toContain('aria-label="Frise chronologique : flèches gauche et droite pour se déplacer, + et − pour zoomer"');
  });

  it("carte sans fiche datée : message d'aide ; filtre sans résultat : message du filtre", () => {
    state({ doc: blankDoc() });
    const empty = render(TimelineView);
    expect(empty).toContain("Aucune fiche datée pour l’instant");
    expect(empty).toContain("1800 – 2100");
    state({ filter: { kinds: ["z"] } });
    const filtered = render(TimelineView);
    expect(filtered).toContain("Aucune fiche datée ne correspond aux filtres.");
    expect(filtered).toContain("(filtrées)");
    expect(filtered).toContain("Filtres actifs");
    expect(filtered).toContain("Types : Zones");
  });

  it("étiquette d'une fiche : titre, date, élément, couleur ; d'un groupe : nombre, période, couleurs", () => {
    const doc = timelineDoc();
    const dated = partitionEntries(collectEntries(doc)).dated;
    const one: Group = { key: dated[3].key, x: 10, left: 10, lane: 0, entries: [dated[3]] };
    const labels = entryLabels(doc, dated[3]);
    const card = render(TimelineCard, { labels, group: one, style: {}, current: true, expanded: false, onActivate: () => {} });
    expect(card).toContain("Verdun");
    expect(card).toContain("21 févr. 1916 · Fiche de France");
    expect(card).toContain('aria-label="Verdun — 21 févr. 1916 — Fiche de France — Catégorie : Conflits"');
    expect(card).toContain("border-left-color:var(--color-flux-rouge)");
    expect(card).toContain('aria-current="true"');

    const many: Group = { key: dated[0].key, x: 10, left: 10, lane: 0, entries: dated.slice(0, 3) };
    const group = render(TimelineCard, { labels: undefined, group: many, style: {}, current: false, expanded: true, onActivate: () => {} });
    expect(group).toContain('aria-label="3 fiches, 3 août 1914 – 1916 : afficher la liste"');
    expect(group).toContain('aria-expanded="true"');
    expect(group).toContain("background:var(--color-flux-jaune)");
    expect(group).toContain("background:var(--color-flux-vert)");
  });

  it("une balise sans couleur prend celle de son type, comme sur la carte ; sans critère de filtre", () => {
    const ping = collectEntries(timelineDoc()).find((e) => e.kind === "p")!;
    expect(ping.color).toBeNull();
    expect(entryColor(ping)).toBe("var(--color-ping-crise)");
    expect(entryColor({ color: null })).toBe("var(--color-acc)");
    expect(entryColor({ color: "rouge", tint: "var(--color-ping-crise)" })).toBe("var(--color-flux-rouge)");
  });

  it("clavier : flèches pour se déplacer, + et − pour zoomer", () => {
    const view = { start: 1900, end: 2000 };
    expect(keyToViewport("ArrowLeft", view)).toEqual({ start: 1880, end: 1980 });
    expect(keyToViewport("ArrowRight", view)).toEqual({ start: 1920, end: 2020 });
    expect(keyToViewport("+", view)!.end - keyToViewport("+", view)!.start).toBeCloseTo(62.5, 9);
    expect(keyToViewport("-", view)!.end - keyToViewport("-", view)!.start).toBeCloseTo(160, 9);
    expect(keyToViewport("a", view)).toBeNull();
  });

  it("clavier depuis une étiquette : le focus passe à la bande avant que la vue change", () => {
    const view = { start: 1900, end: 2000 };
    const calls: string[] = [];
    const track = { focus: vi.fn(() => calls.push("focus")) };
    const onViewChange = vi.fn(() => calls.push("view"));
    const key = (k: string, target: unknown, extra = {}) => ({
      key: k,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target,
      currentTarget: track,
      preventDefault: vi.fn(),
      ...extra,
    });
    handleTrackKey(key("ArrowRight", {}), view, onViewChange);
    expect(calls).toEqual(["focus", "view"]);
    expect(onViewChange).toHaveBeenCalledWith({ start: 1920, end: 2020 });
    // Depuis la bande elle-même : pas de déplacement du focus.
    calls.length = 0;
    handleTrackKey(key("+", track), view, onViewChange);
    expect(calls).toEqual(["view"]);
    // Autre touche, ou avec Ctrl : rien.
    calls.length = 0;
    handleTrackKey(key("Enter", {}), view, onViewChange);
    handleTrackKey(key("ArrowLeft", {}, { ctrlKey: true }), view, onViewChange);
    expect(calls).toEqual([]);
  });

  it("le sélecteur de vue propose la frise", () => {
    const html = render(ViewSwitch);
    expect(html).toContain('aria-label="Vue"');
    expect(html.match(/aria-pressed=/g)).toHaveLength(3);
    expect(html).toContain("Frise");
    expect(useViewStore.getInitialState().view).toBe("planisphere");
  });
});

describe("filtres (EDI-08)", () => {
  it("panneau : nombre de fiches retenues, période, couleurs et catégories présentes, types", () => {
    state({ filtersOpen: true, filter: { colors: ["rouge"] } });
    const html = render(FiltersPanel);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("2 fiches sur 12");
    expect(html).toContain("Du");
    expect(html).toContain("Au (inclus)");
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?Rouge/);
    expect(html).toContain("#123abc");
    expect(html).toContain("Sans couleur");
    expect(html).toContain("Conflits");
    expect(html).toContain("Sans catégorie");
    for (const kind of ["Pays", "Liens", "Balises", "Points", "Zones", "Textes", "Flux"]) expect(html).toContain(kind);
    expect(html).toContain("Réinitialiser");
    state({ filtersOpen: false });
    expect(render(FiltersPanel)).toBe("");
  });

  it("période illisible ou à l'envers : signalée", () => {
    expect(periodProblem({ from: "", to: "" })).toBeNull();
    expect(periodProblem({ from: "1914", to: "1918" })).toBeNull();
    expect(periodProblem({ from: "hier", to: "" })).toBe(PERIOD_INVALID);
    expect(periodProblem({ from: "1919", to: "1918" })).toBe(PERIOD_REVERSED);
    state({ filtersOpen: true, filter: { from: "hier" } });
    const html = render(FiltersPanel);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(PERIOD_INVALID);
    // À l'envers : les deux champs sont signalés ; rien ne correspond.
    state({ filtersOpen: true, filter: { from: "1916-06", to: "1916-03" } });
    const reversed = render(FiltersPanel);
    expect(reversed.match(/aria-invalid="true"/g)).toHaveLength(2);
    expect(reversed).toContain(PERIOD_REVERSED);
    expect(reversed).toContain("Aucune fiche ne correspond");
  });

  it("annonces : seul le nombre de fiches retenues, dans une région à part (pas le bandeau ni ses boutons)", () => {
    state({ hydrated: true, filtersOpen: true, filter: { colors: ["rouge"] } });
    const panel = render(FiltersPanel);
    expect(panel.match(/role="status"|aria-live=/g)).toHaveLength(1);
    expect(panel).toMatch(/aria-live="polite" aria-atomic="true" class="sr-only">2 fiches sur 12</);
    const status = render(FilterStatus);
    expect(status).toContain("Filtres actifs");
    expect(status).not.toMatch(/role="status"|aria-live=/);
  });

  it("état visible : bandeau des critères, nombre sur le bouton", () => {
    state({});
    expect(render(FilterStatus)).toBe("");
    expect(render(FiltersButton)).not.toContain("critère");
    state({ hydrated: true, filter: { from: "1914", to: "1918", categories: ["diplo"] } });
    const status = render(FilterStatus);
    expect(status).toContain("Période : 1914 – 1918");
    expect(status).toContain("Catégories : Diplomatie");
    expect(status).toContain("Réinitialiser");
    expect(status).toContain("Modifier");
    const button = render(FiltersButton);
    expect(button).toContain(">2<");
    expect(button).toContain("critères actifs");
    expect(button).toContain('aria-expanded="false"');
  });
});
