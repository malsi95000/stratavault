// Couleur affichée d'une fiche de la frise : la sienne (ou celle de sa catégorie, de son élément),
// sinon celle de l'élément sur la carte (type d'une balise), sinon la couleur d'accent.
import { colorCss } from "@/features/map-doc/types";
import type { Entry } from "@/features/timeline/entries";

export const entryColor = (entry: Pick<Entry, "color" | "tint">) =>
  entry.color ? colorCss(entry.color) : (entry.tint ?? "var(--color-acc)");
