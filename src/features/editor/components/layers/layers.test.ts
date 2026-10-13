import { readFileSync } from "node:fs";
import { geoPath } from "d3";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { COUNTRIES } from "@/data/countries";
import * as ops from "@/features/map-doc/ops";
import { FLUX_TOKENS, PING_TOKENS, PING_TYPES } from "@/features/map-doc/types";
import { blankDoc } from "@/features/map-doc/schema";
import { useEditorStore } from "@/features/editor/store";
import type { EditorState } from "@/features/editor/store";
import { detailLevels, globeGeometries } from "@/features/editor/globeDetail";
import { globeView } from "@/features/editor/globe3d";
import { makeProjection, rotationCenteredOn } from "@/features/editor/projection";
import { CAPITAL_MARKS, buildWorld, countryAnchorFor, isWorldTopology } from "@/features/editor/world";
import CountryFiche from "../fiches/CountryFiche";
import BackgroundLayer from "./BackgroundLayer";
import CapitalsLayer from "./CapitalsLayer";
import CountriesLayer from "./CountriesLayer";
import DraftLayer from "./DraftLayer";
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
// Zones et flux : même projection, sans rééchantillonnage (tracés bornés, voir shapeBudget.ts).
const shapePath = geoPath(makeProjection(1280, 800, "planisphere", undefined, { resample: false }));

const ids = (html: string, k: string) =>
  [...html.matchAll(new RegExp(`data-k="${k}" data-id="([^"]+)"`, "g"))].map((m) => m[1]);

describe("calques de la carte", () => {
  it("rend les 241 géométries, toutes cliquables", () => {
    const html = renderToStaticMarkup(createElement(CountriesLayer, { world, path }));
    const codes = ids(html, "c");
    expect(codes).toHaveLength(241);
    expect(new Set(codes).size).toBe(241);
    for (const code of ["TWN", "XKX", "GRL", "ESH", "ATA", "XSI"]) expect(codes, code).toContain(code);
    expect(html).not.toContain("pointer-events-none");
  });

  it("rend un point cliquable par capitale, y compris pour les entités sans géométrie", () => {
    const html = renderToStaticMarkup(createElement(CapitalsLayer, { projection }));
    const codes = ids(html, "c");
    expect(codes).toHaveLength(CAPITAL_MARKS.length);
    for (const code of ["TUV", "XAB", "XOS", "XTR"]) expect(codes, code).toContain(code);
    // Toute entité est cliquable par sa géométrie ou par une capitale.
    const clickable = new Set([...codes, ...world.featureByCode.keys()]);
    expect(COUNTRIES.filter((c) => !clickable.has(c.code))).toEqual([]);
  });
});

describe("fiche pays", () => {
  it("affiche statut, souveraineté, capitales, région et relations", () => {
    const html = renderToStaticMarkup(createElement(CountryFiche, { code: "GRL" }));
    expect(html).toContain("Fiche pays");
    expect(html).toContain("Territoire dépendant");
    expect(html).toContain("Souveraineté");
    expect(html).toContain("Danemark");
    expect(html).toContain("Aucune relation pour l’instant.");
    expect(html).toContain('aria-label="Fermer la fiche"');
  });

  it("n'affiche la souveraineté que pour une entité qui en dépend", () => {
    const html = renderToStaticMarkup(createElement(CountryFiche, { code: "XAB" }));
    expect(html).toContain("État à reconnaissance limitée");
    expect(html).not.toContain("Souveraineté");
  });
});

// Le rendu serveur lit l'état initial du store (getServerSnapshot de zustand) : on le remplace le temps d'un test.
const initial = useEditorStore.getInitialState();
const saved: Partial<EditorState> = {
  doc: initial.doc,
  selection: initial.selection,
  pending: initial.pending,
  drawing: initial.drawing,
};
afterEach(() => Object.assign(initial, saved));

function sample() {
  let doc = blankDoc();
  doc = ops.addPing(doc, [32.5, 29.9], "maritime", "p1")!.doc;
  doc = ops.addZone(doc, [[20, 42], [20, 44], [22, 44], [22, 42]], "z1")!.doc;
  doc = ops.addText(doc, [10, 45], 13, "t1")!.doc;
  doc = ops.addLink(doc, "c:FRA", "c:DEU", "l1")!.doc;
  doc = ops.addLink(doc, "p:p1", "z:z1", "l2")!.doc;
  return doc;
}

describe("calques des éléments", () => {
  it("liens : trait d'accent et zone de clic de 14 px, sélection blanche", () => {
    Object.assign(initial, { doc: sample(), selection: { k: "l", id: "l2" } });
    const html = renderToStaticMarkup(createElement(LinksLayer, { path, countryAnchor: countryAnchorFor(world) }));
    expect(ids(html, "l")).toEqual(["l1", "l2"]);
    expect(html.match(/stroke-acc/g)).toHaveLength(1);
    expect(html.match(/stroke-white/g)).toHaveLength(1);
    expect(html).toContain('stroke-width="3.5"');
    expect(html.match(/stroke-width="14"/g)).toHaveLength(2);
  });

  it("« en attente » l'emporte sur la sélection (balise, zone)", () => {
    Object.assign(initial, { doc: sample(), selection: { k: "p", id: "p1" }, pending: "p:p1" });
    expect(renderToStaticMarkup(createElement(PingsLayer, { projection }))).toContain("stroke-acc");
    Object.assign(initial, { selection: { k: "z", id: "z1" }, pending: "z:z1" });
    const zone = renderToStaticMarkup(createElement(ZonesLayer, { shapePath }));
    expect(zone).toContain("fill-map-zone-selected");
    expect(zone).toContain("[stroke-dasharray:5_3]");
  });

  it("texte sans titre sélectionné : blanc, en italique et graisse 500", () => {
    Object.assign(initial, { doc: sample(), selection: { k: "t", id: "t1" } });
    const html = renderToStaticMarkup(createElement(TextsLayer, { projection }));
    expect(html).toContain("(sans titre)");
    expect(html).toMatch(/class="[^"]*font-medium italic fill-white/);
  });

  it("balises : épingle colorée par type, glyphe, contre-échelle, sélection blanche", () => {
    let doc = blankDoc();
    PING_TYPES.forEach((t, i) => (doc = ops.addPing(doc, [i * 10, 10], t, `b${i}`)!.doc));
    Object.assign(initial, { doc, selection: { k: "p", id: "b2" }, pending: null });
    const html = renderToStaticMarkup(createElement(PingsLayer, { projection }));
    expect(ids(html, "p")).toEqual(PING_TYPES.map((_, i) => `b${i}`));
    for (const t of PING_TYPES) expect(html).toContain(`fill:var(${PING_TOKENS[t]})`);
    expect(html.match(/scale\(calc\(1 \/ var\(--k, 1\)\)\)/g)).toHaveLength(PING_TYPES.length);
    expect(html.match(/stroke-pin-outline" stroke-width="1.2"/g)).toHaveLength(PING_TYPES.length - 1);
    expect(html).toContain('class="stroke-white" stroke-width="2"');
    expect(html).not.toContain("<script");

    // Changer la catégorie dans la fiche change l'épingle.
    Object.assign(initial, { doc: ops.setPingType(doc, "b0", "armes") });
    const changed = renderToStaticMarkup(createElement(PingsLayer, { projection }));
    expect(changed).not.toContain(`fill:var(${PING_TOKENS.maritime})`);
  });

  it("points : rond de rayon 5, libellé accessible, contre-échelle, sélection blanche", () => {
    let doc = blankDoc();
    doc = ops.addPoint(doc, [2.35, 48.86], "o1")!.doc;
    doc = ops.addPoint(doc, [13.4, 52.5], "o2")!.doc;
    doc = ops.updateFiche(doc, "o", "o2", { title: "Berlin" });
    Object.assign(initial, { doc, selection: { k: "o", id: "o2" }, pending: null });
    const html = renderToStaticMarkup(createElement(PointsLayer, { projection }));
    expect(ids(html, "o")).toEqual(["o1", "o2"]);
    expect(html).toContain('aria-label="Point"');
    expect(html).toContain('aria-label="Berlin"');
    expect(html.match(/r="5"/g)).toHaveLength(2);
    expect(html).toMatch(/class="fill-acc stroke-pin-outline"/);
    expect(html).toMatch(/class="fill-white stroke-white" stroke-width="2"/);
    expect(html.match(/scale\(calc\(1 \/ var\(--k, 1\)\)\)/g)).toHaveLength(2);
  });

  it("zones : remplissage, contour d'accent 1.6 non mis à l'échelle, sélection blanche 2.4", () => {
    let doc = sample();
    doc = ops.addZone(doc, [[0, 0], [0, 5], [5, 5], [5, 0]], "z2")!.doc;
    Object.assign(initial, { doc, selection: { k: "z", id: "z2" }, pending: null });
    const html = renderToStaticMarkup(createElement(ZonesLayer, { shapePath }));
    expect(ids(html, "z")).toEqual(["z1", "z2"]);
    expect(html).toMatch(/class="cursor-pointer fill-map-zone stroke-acc" stroke-width="1.6" vector-effect="non-scaling-stroke"/);
    expect(html).toMatch(/class="cursor-pointer fill-map-zone-selected stroke-white" stroke-width="2.4"/);
    expect(html).not.toContain("dasharray");
  });

  it("textes : point d'ancrage, libellé à la taille choisie, sans contre-échelle", () => {
    let doc = sample();
    doc = ops.addText(doc, [30, 10], 28, "t2")!.doc;
    doc = ops.updateFiche(doc, "t", "t2", { title: "Golfe <b>" });
    Object.assign(initial, { doc, selection: null, pending: "t:t1" });
    const html = renderToStaticMarkup(createElement(TextsLayer, { projection }));
    expect(ids(html, "t")).toEqual(["t1", "t2"]);
    expect(html.match(/<circle r="2.6"/g)).toHaveLength(2);
    // En attente : point blanc.
    expect(html).toContain('class="fill-white stroke-bg"');
    expect(html).toContain('x="7" y="4"');
    expect(html).toContain("font-size:13px");
    expect(html).toContain("font-size:28px");
    expect(html).toMatch(/font-semibold fill-ink stroke-bg \[paint-order:stroke\]" stroke-width="3"/);
    expect(html).toContain("Golfe &lt;b&gt;");
    expect(html).not.toContain("var(--k");
  });

  it("brouillon du lasso : pointillés, sans capter les clics", () => {
    Object.assign(initial, { drawing: { kind: "lasso", points: [[0, 0], [5, 5], [10, 0]] } });
    const html = renderToStaticMarkup(createElement(DraftLayer, { path }));
    expect(html).toContain("pointer-events-none fill-map-zone-draft stroke-acc [stroke-dasharray:4_3]");
    expect(html).toContain('stroke-width="1.6"');
    Object.assign(initial, { drawing: { kind: "lasso", points: [[0, 0]] } });
    expect(renderToStaticMarkup(createElement(DraftLayer, { path }))).toBe("");
  });

  it("flux : couleur, épaisseur × 5 qui grossit avec le zoom, opacité, extrémités arrondies", () => {
    let doc = blankDoc();
    doc = ops.addFluxStroke(doc, "rouge", [[0, 0], [10, 5]], 4, "f1")!.doc;
    doc = ops.addFluxStroke(doc, "vert-fonce", [[20, 0], [30, 5], [40, 0]], 1, "f2")!.doc;
    Object.assign(initial, { doc, selection: null, pending: null });
    const html = renderToStaticMarkup(createElement(FluxLayer, { shapePath }));
    expect(ids(html, "flux")).toEqual(["f1", "f2"]);
    expect(html).toContain(`stroke:var(${FLUX_TOKENS.rouge});stroke-opacity:0.65`);
    expect(html).toContain(`stroke:var(${FLUX_TOKENS["vert-fonce"]})`);
    expect(html).toContain('stroke-width="20"');
    expect(html).toContain('stroke-width="5"');
    expect(html.match(/stroke-linecap="round" stroke-linejoin="round"/g)).toHaveLength(2);
    expect(html).not.toContain("non-scaling-stroke");
    expect(html).not.toContain("var(--k");
  });

  it("brouillon du flux : couleur et épaisseur du trait, opacité 0,65, sans capter les clics", () => {
    Object.assign(initial, { drawing: { kind: "flux", points: [[0, 0], [5, 5]], color: "violet", width: 7 } });
    const html = renderToStaticMarkup(createElement(DraftLayer, { path }));
    expect(html).toContain("pointer-events-none fill-none");
    expect(html).toContain('stroke-width="35"');
    expect(html).toContain(`stroke:var(${FLUX_TOKENS.violet});stroke-opacity:0.65`);
    expect(html).not.toContain("non-scaling-stroke");
  });
});


describe("vue globe", () => {
  // Globe centré sur l'Europe : l'Océanie est sur la face cachée.
  const globe = makeProjection(1280, 800, "globe", rotationCenteredOn([10, 45]));
  const globePath = geoPath(globe);
  const globeShapePath = geoPath(makeProjection(1280, 800, "globe", rotationCenteredOn([10, 45]), { resample: false }));

  it("sphère en disque bordé (map-edge) et graticule coupé à l'horizon", () => {
    const html = renderToStaticMarkup(createElement(BackgroundLayer, { path: globePath }));
    expect(html).toContain("fill-map-ocean stroke-map-edge");
    const [sphere, graticule] = [...html.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
    // Le disque tient dans la zone utile (même marges que le planisphère).
    const xs = [...sphere.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
    expect(Math.min(...xs.map((p) => p[1]))).toBeCloseTo(58, 0);
    expect(Math.max(...xs.map((p) => p[1]))).toBeCloseTo(752, 0);
    expect(graticule.length).toBeGreaterThan(100);
  });

  it("capitales, balises, points et textes de la face cachée ne sont pas rendus", () => {
    const capitals = ids(renderToStaticMarkup(createElement(CapitalsLayer, { projection: globe })), "c");
    expect(capitals).toContain("FRA");
    expect(capitals).not.toContain("AUS");
    expect(capitals).not.toContain("NZL");

    let doc = blankDoc();
    doc = ops.addPing(doc, [2.35, 48.86], "crise", "devant")!.doc;
    doc = ops.addPing(doc, [151.2, -33.9], "crise", "derriere")!.doc;
    doc = ops.addPoint(doc, [2.35, 48.86], "o1")!.doc;
    doc = ops.addPoint(doc, [174.8, -41.3], "o2")!.doc;
    doc = ops.addText(doc, [2.35, 48.86], 14, "t1")!.doc;
    doc = ops.addText(doc, [-150, -20], 14, "t2")!.doc;
    Object.assign(initial, { doc, selection: null, pending: null });
    expect(ids(renderToStaticMarkup(createElement(PingsLayer, { projection: globe })), "p")).toEqual(["devant"]);
    expect(ids(renderToStaticMarkup(createElement(PointsLayer, { projection: globe })), "o")).toEqual(["o1"]);
    expect(ids(renderToStaticMarkup(createElement(TextsLayer, { projection: globe })), "t")).toEqual(["t1"]);
    // Sur le planisphère, tout est rendu.
    expect(ids(renderToStaticMarkup(createElement(PingsLayer, { projection })), "p")).toEqual(["devant", "derriere"]);
  });

  it("pays : les 241 formes restent dans le calque, celles de la face cachée sans tracé", () => {
    const geometries = globeGeometries(detailLevels(world), globe, null);
    const html = renderToStaticMarkup(createElement(CountriesLayer, { world, path: globePath, geometries }));
    expect(ids(html, "c")).toHaveLength(241);
    expect(html).toMatch(/d="M[^"]+" data-k="c" data-id="FRA"/);
    expect(html).toContain('d="" data-k="c" data-id="NZL"');
  });

  it("liens : arc aérien avec ombre au sol, mêmes data-k/data-id, zone de clic et sélection", () => {
    Object.assign(initial, { doc: sample(), selection: { k: "l", id: "l2" }, pending: null });
    const props = { path: globePath, countryAnchor: countryAnchorFor(world), globeView: globeView(globe) };
    const html = renderToStaticMarkup(createElement(LinksLayer, props));
    expect(ids(html, "l")).toEqual(["l1", "l2"]);
    expect(html.match(/stroke-width="14"/g)).toHaveLength(2);
    expect(html).toContain('stroke-width="3.5"');
    // Ombre au sol atténuée, qui ne capte pas les clics.
    expect(html.match(/pointer-events-none fill-none stroke-(acc|white) opacity-30/g)).toHaveLength(2);
    // L'arc s'écarte de son ombre : tracés différents.
    const [ground, air] = [...html.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]);
    expect(air).not.toBe(ground);
    expect(air).toMatch(/^M/);
  });

  it("liens : rien de la face cachée, planisphère inchangé sans repère de globe", () => {
    let doc = blankDoc();
    doc = ops.addLink(doc, "c:AUS", "c:NZL", "cache")!.doc;
    Object.assign(initial, { doc, selection: null, pending: null });
    const anchor = countryAnchorFor(world);
    const hidden = renderToStaticMarkup(createElement(LinksLayer, { path: globePath, countryAnchor: anchor, globeView: globeView(globe) }));
    expect([...hidden.matchAll(/ d="([^"]*)"/g)].every((m) => m[1] === "")).toBe(true);
    const flat = renderToStaticMarkup(createElement(LinksLayer, { path, countryAnchor: anchor, globeView: null }));
    expect(flat).not.toContain("opacity-30");
    expect(flat).toMatch(/d="M[^"]+" data-k="l" data-id="cache"/);
  });

  it("flux : trait en relief cliquable et ombre au sol, mêmes couleurs et opacité", () => {
    let doc = blankDoc();
    doc = ops.addFluxStroke(doc, "rouge", [[0, 40], [10, 45], [20, 42]], 4, "f1")!.doc;
    doc = ops.addFluxStroke(doc, "vert", [[150, -30], [160, -35]], 2, "f2")!.doc;
    Object.assign(initial, { doc, selection: null, pending: null });
    const html = renderToStaticMarkup(createElement(FluxLayer, { shapePath: globeShapePath, globeView: globeView(globe) }));
    expect(ids(html, "flux")).toEqual(["f1", "f2"]);
    expect(html).toContain(`stroke:var(${FLUX_TOKENS.rouge});stroke-opacity:0.65`);
    expect(html).toContain(`stroke:var(${FLUX_TOKENS.rouge});stroke-opacity:0.195`);
    expect(html).toContain('stroke-width="20"');
    // f2 est sur la face cachée : aucun tracé.
    expect(html).toMatch(/d="" data-k="flux" data-id="f2"/);
    expect(html).toMatch(/d="M[^"]+" data-k="flux" data-id="f1"/);
  });
});
