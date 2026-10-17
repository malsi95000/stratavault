// Couleur et catégorie d'un élément (format v2) : fonctions pures.
import { MAX_STYLES } from "./limits";
import { isMapColor } from "./palette";
import { elementExists } from "./refs";
import { compactStyle } from "./schemaV2";
import type { Category, ElementKind, ElementRef, ElementStyle, MapColor, MapDoc } from "./types";

/**
 * Champs d'un style. Une clé absente ne change rien, null la retire. Une couleur invalide ou une
 * catégorie inconnue sont ignorées.
 */
export type StyleFields = { color?: MapColor | null; category?: string | null };

/** Style d'un élément (undefined : aucun). */
export function styleOf(doc: MapDoc, ref: ElementRef): ElementStyle | undefined {
  return Object.hasOwn(doc.styles, ref) ? doc.styles[ref] : undefined;
}

/**
 * Change la couleur ou la catégorie d'un élément existant. Un style devenu vide est retiré. Document
 * inchangé si l'élément n'existe pas, ou si un nouveau style dépasserait MAX_STYLES.
 */
export function setElementStyle(doc: MapDoc, ref: ElementRef, fields: StyleFields): MapDoc {
  if (!elementExists(doc, ref)) return doc;
  const current = styleOf(doc, ref);
  if (!current && Object.keys(doc.styles).length >= MAX_STYLES) return doc;
  const next: { color?: MapColor; category?: string } = { ...current };
  if (fields.color === null) delete next.color;
  else if (fields.color !== undefined && isMapColor(fields.color)) next.color = fields.color;
  if (fields.category === null) delete next.category;
  else if (fields.category !== undefined && doc.categories.some((c) => c.id === fields.category)) {
    next.category = fields.category;
  }
  const styles = { ...doc.styles };
  const compact = compactStyle(next);
  if (compact) styles[ref] = compact;
  else delete styles[ref];
  return { ...doc, styles };
}

/**
 * Couleur d'un élément sur la carte : sa couleur propre, sinon celle de sa catégorie, sinon null
 * (couleur par défaut du calque).
 */
export function displayColor(
  style: ElementStyle | undefined,
  categories: readonly Category[],
): MapColor | null {
  if (!style) return null;
  if (style.color) return style.color;
  if (style.category === undefined) return null;
  return categories.find((c) => c.id === style.category)?.color ?? null;
}

/**
 * Couleurs à appliquer aux éléments d'une sorte (pays, liens…), par identifiant : seuls les éléments
 * colorés (couleur propre ou de leur catégorie) y figurent.
 */
export function colorsOf(
  doc: Pick<MapDoc, "styles" | "categories">,
  kind: ElementKind,
): ReadonlyMap<string, MapColor> {
  const prefix = `${kind}:`;
  const colors = new Map<string, MapColor>();
  for (const [ref, style] of Object.entries(doc.styles)) {
    if (!ref.startsWith(prefix)) continue;
    const color = displayColor(style, doc.categories);
    if (color) colors.set(ref.slice(prefix.length), color);
  }
  return colors;
}
