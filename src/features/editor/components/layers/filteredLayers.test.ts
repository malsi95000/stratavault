import { readFileSync } from "node:fs";
import { geoPath } from "d3";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "@/features/filters/filter";
import type { Filter } from "@/features/filters/filter";
import { timelineDoc } from "@/features/timeline/fixtures";
import { useEditorStore } from "@/features/editor/store";
import type { EditorState } from "@/features/editor/store";
import { makeProjection } from "@/features/editor/projection";
import { buildWorld, countryAnchorFor, isWorldTopology } from "@/features/editor/world";
import CountriesLayer from "./CountriesLayer";
import FluxLayer from "./FluxLayer";
import LinksLayer from "./LinksLayer";
import PingsLayer from "./PingsLayer";
import PointsLayer from "./PointsLayer";
import TextsLayer from "./TextsLayer";
import ZonesLayer from "./ZonesLayer";

const json: unknown = JSON.parse(
  readFileSync(new URL("../../../../../public/data/countries-50m.json", import.meta.url), "utf8"),
);
if (!isWorldTopology(json)) throw new Error("countries-50m.json illisible");
const world = buildWorld(json);
const projection = makeProjection(1280, 800);
const path = geoPath(projection);
const shapePath = geoPath(makeProjection(1280, 800, "planisphere", undefined, { resample: false }));

// Le rendu serveur lit l'état initial du store : on le remplace le temps d'un test.
const initial = useEditorStore.getInitialState();
const saved: Partial<EditorState> = { doc: initial.doc, selection: initial.selection, filter: initial.filter };
afterEach(() => Object.assign(initial, saved));

const ids = (html: string, k: string) =>
  [...html.matchAll(new RegExp(`data-k="${k}" data-id="([^"]+)"`, "g"))].map((m) => m[1]);

/** Rendu de tous les calques d'éléments avec un filtre (et éventuellement un élément ouvert). */
function render(filter: Partial<Filter>, selection: EditorState["selection"] = null) {
  Object.assign(initial, { doc: timelineDoc(), filter: { ...EMPTY_FILTER, ...filter }, selection });
  const html = renderToStaticMarkup;
  return {
    pings: ids(html(createElement(PingsLayer, { projection })), "p"),
    points: ids(html(createElement(PointsLayer, { projection })), "o"),
    texts: ids(html(createElement(TextsLayer, { projection })), "t"),
    zones: ids(html(createElement(ZonesLayer, { shapePath })), "z"),
    links: ids(html(createElement(LinksLayer, { path, countryAnchor: countryAnchorFor(world) })), "l"),
    flux: ids(html(createElement(FluxLayer, { shapePath })), "flux"),
    countries: html(createElement(CountriesLayer, { world, path })),
  };
}

/** Classes du tracé d'un pays. */
const countryClass = (html: string, code: string) => new RegExp(`data-id="${code}" class="([^"]+)"`).exec(html)?.[1] ?? "";

describe("calques filtrés (EDI-08)", () => {
  it("sans filtre, tout est affiché", () => {
    const r = render({});
    expect(r).toMatchObject({ pings: ["p1"], points: ["o1"], texts: ["t1"], zones: ["z1"], links: ["l1"], flux: ["f1", "f2"] });
    expect(r.countries).not.toContain("[fill-opacity:0.4]");
  });

  it("n'affiche que les éléments dont une fiche passe le filtre", () => {
    const r = render({ from: "1916", to: "1919" });
    expect(r).toMatchObject({ pings: [], points: ["o1"], texts: [], zones: [], links: ["l1"], flux: ["f1", "f2"] });
    // La France (fiche « Verdun ») ressort ; l'Allemagne et le reste du monde sont atténués.
    expect(countryClass(r.countries, "FRA")).not.toContain("[fill-opacity:0.4]");
    expect(countryClass(r.countries, "DEU")).toContain("[fill-opacity:0.4]");
    expect(countryClass(r.countries, "ESP")).toContain("[fill-opacity:0.4]");
  });

  it("un pays écarté perd sa couleur ; un pays retenu la garde", () => {
    const kept = render({ kinds: ["c"], colors: ["jaune"] }).countries;
    expect(kept).toContain('data-id="FRA"');
    expect(countryClass(kept, "FRA")).toContain("[fill-opacity:0.72]");
    const dropped = render({ kinds: ["l"] }).countries;
    expect(countryClass(dropped, "FRA")).toContain("[fill-opacity:0.4]");
    expect(dropped).not.toContain("var(--color-flux-jaune)");
  });

  it("l'élément ouvert dans le panneau reste affiché", () => {
    expect(render({ kinds: ["l"] }, { k: "p", id: "p1" }).pings).toEqual(["p1"]);
    expect(render({ kinds: ["p"] }, { k: "flux", id: "f2" }).flux).toEqual(["f1", "f2"]);
    expect(countryClass(render({ kinds: ["l"] }, { k: "c", id: "FRA" }).countries, "FRA")).not.toContain("[fill-opacity:0.4]");
  });
});
