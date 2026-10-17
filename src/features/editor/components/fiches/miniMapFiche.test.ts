import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ops from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import type { MapDoc, Selection } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import { Fiche } from "../Panel";

// La mini-carte lit le fond de carte déjà chargé : ici, celui du dépôt, chargé d'avance.
vi.mock("@/features/editor/world", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/editor/world")>();
  const { readFileSync } = await import("node:fs");
  const json: unknown = JSON.parse(readFileSync(new URL("../../../../../public/data/countries-50m.json", import.meta.url), "utf8"));
  if (!mod.isWorldTopology(json)) throw new Error("countries-50m.json illisible");
  const world = mod.buildWorld(json);
  return { ...mod, loadedWorld: () => world };
});

const initial = useEditorStore.getInitialState();
const saved = { doc: initial.doc };
afterEach(() => Object.assign(initial, saved));

const MINI_MAP = '<svg aria-hidden="true" focusable="false"';

function render(doc: MapDoc, selection: Selection) {
  Object.assign(initial, { doc });
  return renderToStaticMarkup(createElement(Fiche, { selection }));
}

function sample(): MapDoc {
  let doc = ops.addLink(blankDoc(), "c:FRA", "c:ESP", "l1")!.doc;
  doc = ops.addExtraFiche(doc, "c:FRA", { title: "Dissuasion" }, "f1")!.doc;
  return ops.addExtraFiche(doc, "l:l1", { title: "Traité" }, "f2")!.doc;
}

describe("mini-carte du pays ouvert", () => {
  it("dans le coin de la fiche principale du pays et de ses fiches supplémentaires", () => {
    expect(render(sample(), { k: "c", id: "FRA" })).toContain(MINI_MAP);
    const extra = render(sample(), { k: "c", id: "FRA", fiche: "f1" });
    expect(extra).toContain(">Dissuasion</h2>");
    expect(extra).toContain(MINI_MAP);
  });

  it("pas de mini-carte sur la fiche d'un lien ni sur ses fiches", () => {
    expect(render(sample(), { k: "l", id: "l1" })).not.toContain(MINI_MAP);
    expect(render(sample(), { k: "l", id: "l1", fiche: "f2" })).not.toContain(MINI_MAP);
  });
});
