// Grille de pastilles de couleur (groupe de boutons radio) : déplacement au clavier.

/**
 * Pastille atteinte depuis `index` par une touche, dans une grille de `count` pastilles sur `columns`
 * colonnes : gauche et droite passent à la voisine (en bouclant), haut et bas changent de ligne (sans
 * sortir de la grille), Début et Fin vont aux extrémités. null si la touche ne déplace pas.
 */
export function nextSwatchIndex(index: number, key: string, count: number, columns: number): number | null {
  if (count <= 0) return null;
  const cols = Math.max(1, columns);
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "ArrowDown":
      return index + cols < count ? index + cols : index;
    case "ArrowUp":
      return index - cols >= 0 ? index - cols : index;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** Pastille qui reçoit la tabulation : la couleur choisie, sinon la première. */
export function tabbableSwatch(selected: number): number {
  return selected >= 0 ? selected : 0;
}
