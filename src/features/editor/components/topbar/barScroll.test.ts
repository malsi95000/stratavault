import { describe, expect, it } from "vitest";
import { NO_EDGES, barEdges, edgeMaskClass, wheelScrollLeft } from "./barScroll";

const wheel = (deltaY: number, deltaX = 0, deltaMode = 0) => ({ deltaX, deltaY, deltaMode });

describe("défilement de la barre du haut", () => {
  it("signale les côtés cachés seulement quand la barre déborde", () => {
    // Fiche ouverte à 1024 px : 664 px visibles pour environ 1060 px de boutons.
    expect(barEdges(0, 1060, 664)).toEqual({ before: false, after: true });
    expect(barEdges(200, 1060, 664)).toEqual({ before: true, after: true });
    expect(barEdges(396, 1060, 664)).toEqual({ before: true, after: false });
    expect(barEdges(0, 1024, 1024)).toEqual(NO_EDGES);
    // Arrondis d'un zoom fractionnaire : moins d'un pixel ne compte pas.
    expect(barEdges(0, 1024.5, 1024)).toEqual(NO_EDGES);
    expect(barEdges(395.5, 1060, 664)).toEqual({ before: true, after: false });
  });

  it("une molette verticale fait défiler la barre horizontalement, bornée aux extrémités", () => {
    expect(wheelScrollLeft(0, 1060, 664, wheel(100))).toBe(100);
    expect(wheelScrollLeft(100, 1060, 664, wheel(-60))).toBe(40);
    expect(wheelScrollLeft(350, 1060, 664, wheel(100))).toBe(396);
    expect(wheelScrollLeft(20, 1060, 664, wheel(-100))).toBe(0);
    // Le geste horizontal d'un pavé tactile l'emporte s'il est plus ample.
    expect(wheelScrollLeft(0, 1060, 664, wheel(5, 80))).toBe(80);
    // Molettes qui comptent en lignes ou en pages.
    expect(wheelScrollLeft(0, 1060, 664, wheel(3, 0, 1))).toBe(48);
    expect(wheelScrollLeft(0, 2000, 664, wheel(1, 0, 2))).toBe(664);
  });

  it("laisse la molette au navigateur quand rien ne bouge", () => {
    expect(wheelScrollLeft(0, 1024, 1024, wheel(100))).toBeNull();
    expect(wheelScrollLeft(0, 1060, 664, wheel(-100))).toBeNull();
    expect(wheelScrollLeft(396, 1060, 664, wheel(100))).toBeNull();
    expect(wheelScrollLeft(0, 1060, 664, wheel(0))).toBeNull();
  });

  it("le dégradé suit les côtés cachés", () => {
    expect(edgeMaskClass(NO_EDGES)).toBeUndefined();
    expect(edgeMaskClass({ before: false, after: true })).toContain("to_left");
    expect(edgeMaskClass({ before: true, after: false })).toContain("to_right,transparent,black_2rem)");
    expect(edgeMaskClass({ before: true, after: true })).toContain("calc(100%-2rem)");
  });
});
