// Résumé d'un élément pour la file de modération (summary.ts) et décisions proposées (moderation.ts).
import { describe, expect, it } from "vitest";
import { availableActions, queuePageOf, queuePagePath, queuePages } from "./moderation";
import { positionText, summarizeItem } from "./summary";

describe("summarizeItem", () => {
  it("résume chaque sorte en texte lisible", () => {
    expect(summarizeItem("ping", "p1", { ll: [2.35, 48.85], type: "crise", title: "Paris", note: "Note", date: "2024-05-01" })).toEqual({
      kind: "Balise",
      title: "Paris",
      note: "Note",
      date: "2024-05-01",
      where: "48,85° N, 2,35° E",
    });
    expect(summarizeItem("link", "l1", { a: "c:FRA", b: "p:x", title: "", note: "" })?.where).toBe("France → balise de l’auteur");
    expect(summarizeItem("zone", "z1", { ring: [[0, 0], [1, 0], [1, 1], [0, 0]], title: "", note: "" })?.where).toMatch(/^Zone de 3 sommets/);
    expect(summarizeItem("flux", "f1", { color: "rouge", points: [[0, 0], [1, 1]], width: 2 })).toMatchObject({ kind: "Flux", title: "", note: "" });
  });

  it("contenu illisible : null, jamais affiché brut", () => {
    expect(summarizeItem("ping", "p1", { ll: [2, 48], type: "crise", title: "<script>", note: "", html: "<b>" })).toBeNull();
    expect(summarizeItem("virus", "p1", {})).toBeNull();
  });

  it("position : hémisphères", () => {
    expect(positionText([-70.5, -33.45])).toBe("33,45° S, 70,5° O");
  });
});

describe("availableActions", () => {
  it("propose ce qui a un effet selon l'état et les signalements", () => {
    expect(availableActions("visible", 0)).toEqual(["hide", "delete"]);
    expect(availableActions("visible", 2)).toEqual(["hide", "delete", "dismiss"]);
    expect(availableActions("hidden", 0)).toEqual(["restore", "delete"]);
    // Retiré par son auteur : il ne se masque ni ne se rétablit.
    expect(availableActions("withdrawn", 1)).toEqual(["delete", "dismiss"]);
  });
});

describe("pages de la file de modération", () => {
  it("page lue dans l'adresse (à partir de 1), bornée ; nombre de pages ; adresses", () => {
    expect(queuePageOf(undefined)).toBe(0);
    expect(queuePageOf("1")).toBe(0);
    expect(queuePageOf("3")).toBe(2);
    for (const bad of ["0", "-1", "abc", "1.5", "01", ["2"], "999999"]) expect(queuePageOf(bad), String(bad)).toBe(0);
    expect(queuePageOf("99999")).toBe(1000);
    expect(queuePages(0)).toBe(1);
    expect(queuePages(100)).toBe(1);
    expect(queuePages(230)).toBe(3);
    expect(queuePagePath(0)).toBe("/carte-collective/moderation#file");
    expect(queuePagePath(2)).toBe("/carte-collective/moderation?page=3#file");
  });
});
