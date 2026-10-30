// Passage entre la carte collective et le document de l'éditeur (compose.ts), différences et plan
// d'envoi (diff.ts), règles d'édition (rules.ts : chacun ses éléments).
import { describe, expect, it } from "vitest";
import { createEditorStore } from "@/features/editor/store";
import * as ops from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import { composeDoc, contentsOf, entityKey, hasOnlyItems, itemKey, refKey, withElement } from "./compose";
import { changedElements, planIsEmpty, planSync, type BaseEntry } from "./diff";
import { contentJson } from "./itemData";
import { HINT_AUTHOR_FULL, HINT_LINK_FOREIGN, HINT_NOT_YOURS, HINT_UNSUPPORTED } from "./messages";
import { checkCollectiveEdit, collectiveEditRules } from "./rules";
import type { ItemContent } from "./types";

const ping = (id: string, title = ""): ItemContent => ({ kind: "ping", id, data: { ll: [2, 48], type: "crise", title, note: "" } });
const point = (id: string): ItemContent => ({ kind: "point", id, data: { ll: [1, 1], title: "", note: "" } });
const link = (id: string, a: string, b: string): ItemContent => ({
  kind: "link",
  id,
  data: { a: a as never, b: b as never, title: "", note: "" },
});
const flux = (id: string): ItemContent => ({ kind: "flux", id, data: { color: "rouge", points: [[0, 0], [1, 1]], width: 3 } });

const entry = (content: ItemContent, mine: boolean): BaseEntry => ({
  content,
  json: contentJson(content),
  mine,
  authorHandle: null,
  authorName: mine ? "Moi" : "Autre",
  createdAt: "2026-10-27T00:00:00.000Z",
});
const baseOf = (mine: ItemContent[], foreign: ItemContent[] = []) =>
  new Map([...mine.map((c) => [itemKey(c.kind, c.id), entry(c, true)] as const), ...foreign.map((c) => [itemKey(c.kind, c.id), entry(c, false)] as const)]);
const ownership = (base: Map<string, BaseEntry>) => ({ isForeign: (key: string) => base.get(key)?.mine === false });

describe("composeDoc et contentsOf", () => {
  it("compose un document des seuls éléments, et en relit le même contenu", () => {
    const items = [ping("p1", "Port"), point("o1"), flux("f1"), link("l1", "p:p1", "c:FRA")];
    const doc = composeDoc(items);
    expect(doc.pings.map((p) => p.id)).toEqual(["p1"]);
    expect(doc.flux.rouge?.map((s) => s.id)).toEqual(["f1"]);
    expect(doc.links.map((l) => l.id)).toEqual(["l1"]);
    const contents = contentsOf(doc);
    for (const item of items) expect(contentJson(contents.get(itemKey(item.kind, item.id))!)).toBe(contentJson(item));
    expect(hasOnlyItems(doc)).toBe(true);
  });

  it("omet un lien dont une extrémité manque (masquée, absente, pays inconnu)", () => {
    const doc = composeDoc([ping("p1"), link("l1", "p:p2", "c:FRA"), link("l2", "c:XYZ", "p:p1"), link("l3", "p:p1", "c:DEU")]);
    expect(doc.links.map((l) => l.id)).toEqual(["l3"]);
  });

  it("clés des éléments et des extrémités de liens", () => {
    expect(entityKey("p", "x")).toBe("ping:x");
    expect(entityKey("flux", "x")).toBe("flux:x");
    expect(entityKey("c", "FRA")).toBeNull();
    expect(refKey("o:abc")).toBe("point:abc");
    expect(refKey("c:FRA")).toBeNull();
  });

  it("withElement remet un élément tel que la base le connaît, ou le retire avec ses liens", () => {
    const doc = composeDoc([ping("p1", "Avant"), link("l1", "p:p1", "c:FRA")]);
    const changed = ops.updateFiche(doc, "p", "p1", { title: "Après" });
    const reverted = withElement(changed, "ping:p1", ping("p1", "Avant"));
    expect(reverted.pings[0].title).toBe("Avant");
    const removed = withElement(doc, "ping:p1", null);
    expect(removed.pings).toEqual([]);
    expect(removed.links).toEqual([]);
    expect(withElement(blankDoc(), "flux:f1", flux("f1")).flux.rouge?.map((s) => s.id)).toEqual(["f1"]);
  });
});

describe("changedElements et planSync", () => {
  it("ajouts, modifications et suppressions ; un objet recopié à l'identique n'est pas une modification", () => {
    const before = composeDoc([ping("p1"), point("o1")]);
    let after = ops.updateFiche(before, "p", "p1", { title: "Nouveau" });
    after = ops.erase(after, "o", "o1");
    after = ops.addPoint(after, [3, 3], "o2")!.doc;
    after = { ...after, pings: after.pings.map((p) => ({ ...p })) };
    const changes = changedElements(before, after).map((c) => [c.key, c.before !== null, c.after !== null]);
    expect(changes).toEqual([
      ["ping:p1", true, true],
      ["point:o2", false, true],
      ["point:o1", true, false],
    ]);
    expect(changedElements(before, { ...before, pings: before.pings.map((p) => ({ ...p })) })).toEqual([]);
  });

  it("le plan n'envoie que les éléments du compte : extrémités avant les liens, liens supprimés d'abord", () => {
    const base = baseOf([ping("p1"), link("l0", "p:p1", "c:FRA")], [ping("x1")]);
    let doc = composeDoc([ping("p1"), link("l0", "p:p1", "c:FRA"), ping("x1")]);
    doc = ops.erase(doc, "p", "p1");
    doc = ops.addPing(doc, [5, 5], "crise", "p2")!.doc;
    doc = ops.addLink(doc, "p:p2", "c:ITA", "l2")!.doc;
    doc = ops.updateFiche(doc, "p", "x1", { title: "Pas à moi" });
    const plan = planSync(base, doc);
    expect(plan.creates.map((c) => c.id)).toEqual(["p2", "l2"]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes.map((c) => c.id)).toEqual(["l0", "p1"]);
    expect(planIsEmpty(planSync(base, composeDoc([ping("p1"), link("l0", "p:p1", "c:FRA"), ping("x1")])))).toBe(true);
  });
});

describe("règles d'édition de la carte collective", () => {
  const base = baseOf([ping("p1")], [ping("x1"), point("y1")]);
  const doc = composeDoc([ping("p1"), ping("x1"), point("y1")]);
  const rules = collectiveEditRules(ownership(base));
  const check = (next: MapDoc) => checkCollectiveEdit(doc, next, ownership(base));

  it("on modifie et supprime ses éléments, jamais ceux des autres", () => {
    expect(check(ops.updateFiche(doc, "p", "p1", { title: "Moi" }))).toBeNull();
    expect(check(ops.erase(doc, "p", "p1"))).toBeNull();
    expect(check(ops.updateFiche(doc, "p", "x1", { title: "Volé" }))).toBe(HINT_NOT_YOURS);
    expect(check(ops.erase(doc, "o", "y1"))).toBe(HINT_NOT_YOURS);
    expect(rules.locked("p", "x1")).toBe(true);
    expect(rules.locked("p", "p1")).toBe(false);
    expect(rules.locked("c", "FRA")).toBe(true);
    expect(rules.extras).toBe(false);
  });

  it("un lien ne vise qu'un pays ou ses propres éléments", () => {
    expect(check(ops.addLink(doc, "p:p1", "c:FRA", "l1")!.doc)).toBeNull();
    expect(check(ops.addLink(doc, "p:p1", "p:x1", "l2")!.doc)).toBe(HINT_LINK_FOREIGN);
  });

  it("le lien d'un autre membre entre deux pays n'empêche pas d'ajouter le sien (signé du compte)", () => {
    const withForeign = composeDoc([ping("p1"), link("lx", "c:FRA", "c:DEU")]);
    const foreignBase = baseOf([ping("p1")], [link("lx", "c:FRA", "c:DEU")]);
    const store = createEditorStore();
    store.getState().hydrate(withForeign, null);
    store.getState().setEditRules(collectiveEditRules(ownership(foreignBase)));
    store.getState().setTool("link");
    store.getState().pick("c:DEU");
    store.getState().pick("c:FRA");
    const { doc: next, selection } = store.getState();
    expect(next.links).toHaveLength(2);
    const mine = next.links.find((l) => l.id !== "lx")!;
    expect(selection).toEqual({ k: "l", id: mine.id });
    expect(checkCollectiveEdit(withForeign, next, ownership(foreignBase))).toBeNull();
    // Son propre lien, lui, est rouvert au lieu d'être doublé.
    store.getState().pick("c:FRA");
    store.getState().pick("c:DEU");
    expect(store.getState().doc.links).toHaveLength(2);
    expect(store.getState().selection).toEqual({ k: "l", id: mine.id });
  });

  it("ni notes de pays, ni fiches supplémentaires, ni styles ; contenus hors règles refusés", () => {
    expect(check(ops.setCountryNote(doc, "FRA", "Paris"))).toBe(HINT_UNSUPPORTED);
    expect(check({ ...doc, styles: { "c:FRA": { color: "rouge" } } } as MapDoc)).toBe(HINT_UNSUPPORTED);
    expect(check(ops.updateFiche(doc, "p", "p1", { note: "a".repeat(2001) }))).toMatch(/Notes trop longues/);
  });

  it("place d'un auteur : pas d'ajout au-delà de 200 éléments", () => {
    let full = doc;
    for (let i = 0; i < 199; i++) full = ops.addPoint(full, [0, 0], `n${i}`)!.doc;
    expect(checkCollectiveEdit(doc, full, ownership(base))).toBeNull();
    expect(checkCollectiveEdit(full, ops.addPoint(full, [0, 0], "trop")!.doc, ownership(base))).toBe(HINT_AUTHOR_FULL);
  });
});
