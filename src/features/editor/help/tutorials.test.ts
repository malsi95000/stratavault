import { describe, expect, it } from "vitest";
import { routeMapClick } from "@/features/editor/mapClick";
import { createEditorStore } from "@/features/editor/store";
import { TOOL_SHORTCUTS, dragMode } from "@/features/editor/tools";
import { addLink, addPing, erase } from "@/features/map-doc/ops";
import { FLUX_COLOR_IDS } from "@/features/map-doc/palette";
import { blankDoc } from "@/features/map-doc/schema";
import { PING_TYPES, REF_KINDS } from "@/features/map-doc/types";
import { TIMELINE_END, TIMELINE_START } from "@/features/timeline/viewport";
import { HELP_TOPICS, toolShortcut, tutorialFor } from "./tutorials";
import type { HelpTopic } from "./tutorials";

const text = (topic: HelpTopic) => {
  const t = tutorialFor(topic);
  return [t.title, t.summary, ...t.steps, t.shortcut ?? "", t.tip ?? ""].join(" ");
};

describe("tutoriels de l'assistant", () => {
  it("couvrent les 8 outils, les 3 vues, les filtres et les catégories, en 2 à 4 étapes", () => {
    expect([...HELP_TOPICS].sort()).toEqual(
      [...new Set(Object.values(TOOL_SHORTCUTS)), "planisphere", "globe", "frise", "filtres", "categories"].sort(),
    );
    for (const topic of HELP_TOPICS) {
      const { title, summary, steps } = tutorialFor(topic);
      expect(title, topic).not.toBe("");
      expect(summary, topic).not.toBe("");
      expect(steps.length, topic).toBeGreaterThanOrEqual(2);
      expect(steps.length, topic).toBeLessThanOrEqual(4);
      for (const step of steps) expect(step.trim(), topic).not.toBe("");
    }
  });

  it("donnent le raccourci réel de chaque outil (tools.ts)", () => {
    for (const [key, tool] of Object.entries(TOOL_SHORTCUTS)) {
      expect(toolShortcut(tool)).toBe(key.toUpperCase());
      expect(tutorialFor(tool).shortcut).toBe(key.toUpperCase());
    }
  });
});

describe("fidèles au comportement de l'éditeur", () => {
  it("lien : les extrémités possibles sont pays, balise, point, zone et texte", () => {
    expect([...REF_KINDS].sort()).toEqual(["c", "o", "p", "t", "z"]);
    expect(text("link")).toContain("un pays, une balise, un point, une zone ou un texte");
    for (const k of REF_KINDS) expect(routeMapClick("link", { k, id: "x" }, null).type).toBe("pick");
    // Clic dans le vide : le lien en cours est annulé.
    expect(routeMapClick("link", null, "c:FRA").type).toBe("cancelPending");
  });

  it("lien : second clic sur la même extrémité, ou paire déjà reliée", () => {
    const store = createEditorStore();
    store.getState().pick("c:FRA");
    store.getState().pick("c:FRA");
    expect(store.getState().pending).toBeNull();
    const linked = addLink(blankDoc(), "c:FRA", "c:DEU", "l1")!;
    expect(addLink(linked.doc, "c:DEU", "c:FRA")).toEqual({ doc: linked.doc, id: "l1" });
  });

  it("balise et texte : posés sur un pays ou en mer ; un élément existant ouvre sa fiche", () => {
    expect(tutorialFor("ping").steps.join(" ")).toContain("mer comprise");
    expect(PING_TYPES).toHaveLength(6);
    expect(text("ping")).toContain("six types");
    for (const tool of ["ping", "texte", "point"] as const) {
      expect(routeMapClick(tool, null, null)).toEqual({ type: "place", tool });
      expect(routeMapClick(tool, { k: "c", id: "FRA" }, null)).toEqual({ type: "place", tool });
      expect(routeMapClick(tool, { k: "l", id: "l1" }, null).type).toBe("open");
    }
  });

  it("gomme : pays refusés, liens rattachés supprimés avec l'élément", () => {
    const withPing = addPing(blankDoc(), [1, 2], "crise", "p1")!.doc;
    const doc = addLink(withPing, "p:p1", "c:FRA", "l1")!.doc;
    expect(erase(doc, "c", "FRA")).toBe(doc);
    expect(erase(doc, "p", "p1").links).toEqual([]);
    expect(text("gomme")).toContain("Les pays ne s’effacent pas");
    expect(text("gomme")).toContain("Les liens rattachés");
  });

  it("pinceau et lasso dessinent au glisser, dans les deux vues", () => {
    for (const view of ["planisphere", "globe"] as const) {
      expect(dragMode("flux", view)).toBe("draw");
      expect(dragMode("lasso", view)).toBe("draw");
      expect(dragMode("select", view)).toBe(view === "globe" ? "rotate" : "pan");
    }
    expect(text("flux")).toContain(`${FLUX_COLOR_IDS.length} couleurs`);
  });

  it("frise : la période annoncée est celle de la frise", () => {
    expect(tutorialFor("frise").summary).toContain(`entre ${TIMELINE_START} et ${TIMELINE_END - 1}`);
    expect(tutorialFor("frise").tip).toContain(`${TIMELINE_START}–${TIMELINE_END - 1}`);
  });
});
