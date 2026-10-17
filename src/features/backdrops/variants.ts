// Les cinq fonds de page (ANN-01), un par famille de pages annexes, et leurs réglages. Chaque fond
// est calculé une seule fois par processus serveur, puis réutilisé.
import { coastlineLayers } from "./coastlines";
import { contourLayers } from "./contours";
import { globeLayers } from "./globe";
import { strataLayers } from "./strata";
import { randomHills, sampleTerrain } from "./terrain";
import { BACKDROP_HEIGHT, BACKDROP_WIDTH, type BackdropLayer, type BackdropVariant } from "./types";

const SIZE = { width: BACKDROP_WIDTH, height: BACKDROP_HEIGHT };
const ASPECT = BACKDROP_HEIGHT / BACKDROP_WIDTH;
/** Grille du relief : une case pour 12,5 unités du dessin. */
const GRID = { cols: 128, rows: 80 };

const BUILDERS: Record<BackdropVariant, () => BackdropLayer[]> = {
  // Connexion, inscription, mots de passe : courbes de niveau d'un massif vallonné.
  contours: () =>
    contourLayers(
      sampleTerrain(randomHills({ seed: 21, count: 9, radius: [0.06, 0.16], hollows: 0.25 }), GRID.cols, GRID.rows, ASPECT),
      { ...SIZE, levels: 15, majorEvery: 5, tolerance: 1.4 },
    ),
  // Mon compte : un autre relief, plus ample (quelques grands sommets).
  relief: () =>
    contourLayers(
      sampleTerrain(randomHills({ seed: 14, count: 6, radius: [0.12, 0.24], hollows: 0.2 }), GRID.cols, GRID.rows, ASPECT),
      { ...SIZE, levels: 12, majorEvery: 4, tolerance: 1.4 },
    ),
  // Mon espace : le globe de la vue Globe, décentré, avec sa couronne graduée.
  graticule: () => globeLayers({ center: [1180, 700], radius: 520, rotate: [-12, -28], step: 15 }),
  // Historique : des strates, comme les couches successives du temps.
  strata: () => strataLayers({ ...SIZE, seed: 5, count: 26, majorEvery: 5 }),
  // Pages légales : le planisphère de l'éditeur, en contours.
  coastlines: () => coastlineLayers({ ...SIZE, margin: 40 }),
};

const cache = new Map<BackdropVariant, readonly BackdropLayer[]>();

/** Tracés du fond `variant` (calculés au premier appel), sans les calques vides. */
export function backdropLayers(variant: BackdropVariant): readonly BackdropLayer[] {
  let layers = cache.get(variant);
  if (!layers) {
    layers = BUILDERS[variant]().filter((layer) => layer.d !== "");
    cache.set(variant, layers);
  }
  return layers;
}
