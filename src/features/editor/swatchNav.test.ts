import { describe, expect, it } from "vitest";
import { nextSwatchIndex, tabbableSwatch } from "./swatchNav";

describe("pastilles de couleur au clavier", () => {
  // 22 couleurs sur 6 colonnes : 4 lignes, la dernière de 4 pastilles.
  const move = (index: number, key: string) => nextSwatchIndex(index, key, 22, 6);

  it("gauche et droite : la voisine, en bouclant", () => {
    expect(move(0, "ArrowRight")).toBe(1);
    expect(move(21, "ArrowRight")).toBe(0);
    expect(move(0, "ArrowLeft")).toBe(21);
    expect(move(7, "ArrowLeft")).toBe(6);
  });

  it("haut et bas : la même colonne sur la ligne voisine, sans sortir de la grille", () => {
    expect(move(1, "ArrowDown")).toBe(7);
    expect(move(15, "ArrowDown")).toBe(21);
    // Dernière ligne incomplète : pas de pastille en dessous, on reste.
    expect(move(16, "ArrowDown")).toBe(16);
    expect(move(7, "ArrowUp")).toBe(1);
    expect(move(3, "ArrowUp")).toBe(3);
  });

  it("Début, Fin, autres touches", () => {
    expect(move(9, "Home")).toBe(0);
    expect(move(9, "End")).toBe(21);
    expect(move(9, "a")).toBeNull();
    expect(move(9, "Enter")).toBeNull();
    expect(nextSwatchIndex(0, "ArrowRight", 0, 6)).toBeNull();
    // Mise en page inconnue (0 colonne) : une colonne.
    expect(nextSwatchIndex(2, "ArrowDown", 5, 0)).toBe(3);
  });

  it("une seule pastille dans l'ordre de tabulation : la couleur choisie, sinon la première", () => {
    expect(tabbableSwatch(5)).toBe(5);
    expect(tabbableSwatch(-1)).toBe(0);
  });
});
