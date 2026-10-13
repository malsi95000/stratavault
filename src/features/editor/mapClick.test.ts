import { describe, expect, it } from "vitest";
import { routeMapClick, toTarget } from "./mapClick";

describe("clic sur la carte selon l'outil", () => {
  it("lit data-k / data-id et refuse les sortes inconnues", () => {
    expect(toTarget("c", "FRA")).toEqual({ k: "c", id: "FRA" });
    expect(toTarget("flux", "f1")).toEqual({ k: "flux", id: "f1" });
    expect(toTarget("x", "1")).toBeNull();
    expect(toTarget("c", "")).toBeNull();
    expect(toTarget(null, "FRA")).toBeNull();
  });

  it("sélection : ouvre la fiche de tout élément, ferme dans le vide", () => {
    for (const k of ["c", "l", "p", "o", "z", "t", "flux"] as const) {
      expect(routeMapClick("select", { k, id: "x1" }, null)).toEqual({ type: "open", k, id: "x1" });
    }
    expect(routeMapClick("select", null, null)).toEqual({ type: "close" });
  });

  it("lien : choisit les extrémités, ouvre un lien existant, annule dans le vide", () => {
    expect(routeMapClick("link", { k: "c", id: "FRA" }, null)).toEqual({ type: "pick", ref: "c:FRA" });
    for (const k of ["p", "o", "z", "t"] as const) {
      expect(routeMapClick("link", { k, id: "a1" }, null)).toEqual({ type: "pick", ref: `${k}:a1` });
    }
    expect(routeMapClick("link", { k: "l", id: "l1" }, "c:FRA")).toEqual({ type: "open", k: "l", id: "l1" });
    expect(routeMapClick("link", null, "c:FRA")).toEqual({ type: "cancelPending" });
    expect(routeMapClick("link", { k: "flux", id: "f1" }, "c:FRA")).toEqual({ type: "cancelPending" });
    expect(routeMapClick("link", null, null)).toEqual({ type: "none" });
  });

  it("balise, point, texte : un élément existant ouvre sa fiche, sinon pose (même sur un pays)", () => {
    for (const tool of ["ping", "point", "texte"] as const) {
      expect(routeMapClick(tool, { k: "p", id: "p1" }, null)).toEqual({ type: "open", k: "p", id: "p1" });
      expect(routeMapClick(tool, { k: "c", id: "FRA" }, null)).toEqual({ type: "place", tool });
      expect(routeMapClick(tool, null, null)).toEqual({ type: "place", tool });
    }
  });

  it("lasso et flux : le clic ne fait rien ; gomme : supprime l'élément visé", () => {
    expect(routeMapClick("lasso", { k: "c", id: "FRA" }, null)).toEqual({ type: "none" });
    expect(routeMapClick("flux", null, null)).toEqual({ type: "none" });
    expect(routeMapClick("gomme", { k: "z", id: "z1" }, null)).toEqual({ type: "erase", k: "z", id: "z1" });
    expect(routeMapClick("gomme", null, null)).toEqual({ type: "none" });
  });
});
