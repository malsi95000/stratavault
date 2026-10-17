// Validation des ajouts du format v2 (fiches supplémentaires, catégories, styles), utilisée par
// schema.ts. Ces clés sont facultatives à l'import : un export v1 ou de la bêta, qui ne les a pas,
// se lit toujours. Une fois normalisées, elles sont toujours présentes (éventuellement vides).
import { z } from "@/lib/zod";
import {
  MAX_CATEGORIES,
  MAX_CATEGORY_LABEL_LENGTH,
  MAX_FICHES_PER_ELEMENT,
  MAX_STYLES,
  MAX_TOTAL_FICHES,
  ficheCount,
} from "./limits";
import { parseMapColor } from "./palette";
import { elementRefChecker } from "./refs";
import { ID_PATTERN, MAX_DATE_LENGTH, MAX_NOTE_LENGTH, MAX_TITLE_LENGTH } from "./types";
import type { Category, ElementRef, ElementStyle, ExtraFiche, MapColor, MapDoc } from "./types";

/** Problème de cohérence relevé après normalisation (chemin dans le document, message). */
export type Problem = { path: (string | number)[]; message: string };

const id = z.string().regex(ID_PATTERN);
/** Jeton de la palette ou « #rrggbb » ; ramené à sa forme normalisée (minuscules). */
const color = z
  .string()
  .max(16)
  .refine((v) => parseMapColor(v) !== null, "Couleur inconnue")
  .transform((v) => parseMapColor(v) as MapColor);
// Clé d'un élément : vérifiée après normalisation (forme et existence de l'élément).
const elementKey = z.string().max(80);

const extraFicheInput = z.object({
  id,
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
  note: z.string().max(MAX_NOTE_LENGTH).optional(),
  date: z.string().max(MAX_DATE_LENGTH).optional(),
  color: color.optional(),
  category: id.optional(),
});
const categoryInput = z.object({ id, label: z.string().trim().min(1).max(MAX_CATEGORY_LABEL_LENGTH), color });
const styleInput = z.object({ color: color.optional(), category: id.optional() });

/** Clés du format v2 dans le schéma d'import (toutes facultatives). */
export const mapDocV2InputShape = {
  fiches: z.record(elementKey, z.array(extraFicheInput).max(MAX_FICHES_PER_ELEMENT)).nullish(),
  categories: z.array(categoryInput).max(MAX_CATEGORIES).nullish(),
  styles: z.record(elementKey, styleInput).nullish(),
};

type V2Input = z.infer<z.ZodObject<typeof mapDocV2InputShape>>;
export type MapDocV2Parts = Pick<MapDoc, "fiches" | "categories" | "styles">;

/** Style sans champ vide ; null s'il ne reste rien. */
export function compactStyle(style: { color?: MapColor; category?: string }): ElementStyle | null {
  const out: ElementStyle = {};
  if (style.color !== undefined) out.color = style.color;
  if (style.category !== undefined) out.category = style.category;
  return out.color === undefined && out.category === undefined ? null : out;
}

function normalizeFiche(f: NonNullable<V2Input["fiches"]>[string][number]): ExtraFiche {
  const fiche: ExtraFiche = { id: f.id, title: f.title ?? "", note: f.note ?? "" };
  if (f.date !== undefined) fiche.date = f.date;
  if (f.color !== undefined) fiche.color = f.color;
  if (f.category !== undefined) fiche.category = f.category;
  return fiche;
}

/** Complète les clés v2 absentes et retire les listes de fiches et les styles vides. */
export function normalizeV2(input: V2Input): MapDocV2Parts {
  const fiches: MapDoc["fiches"] = {};
  for (const [ref, list] of Object.entries(input.fiches ?? {})) {
    // La clé est vérifiée par v2Problems (forme « type:id » et existence de l'élément).
    if (list.length > 0) fiches[ref as ElementRef] = list.map(normalizeFiche);
  }
  const styles: MapDoc["styles"] = {};
  for (const [ref, style] of Object.entries(input.styles ?? {})) {
    const compact = compactStyle(style);
    if (compact) styles[ref as ElementRef] = compact;
  }
  const categories = (input.categories ?? []).map((c): Category => ({ id: c.id, label: c.label, color: c.color }));
  return { fiches, categories, styles };
}

/**
 * Problèmes de cohérence des ajouts v2 : élément inexistant, catégorie inconnue, identifiants en
 * double, plafonds de toute la carte.
 */
export function v2Problems(doc: MapDoc): Problem[] {
  const problems: Problem[] = [];
  const exists = elementRefChecker(doc);
  const categories = new Set<string>();
  doc.categories.forEach((c, i) => {
    if (categories.has(c.id)) problems.push({ path: ["categories", i, "id"], message: `Identifiant en double : ${c.id}` });
    categories.add(c.id);
  });
  const knownCategory = (category: string | undefined) => category === undefined || categories.has(category);

  const ficheIds = new Set<string>();
  for (const [ref, list] of Object.entries(doc.fiches)) {
    if (!exists(ref)) problems.push({ path: ["fiches", ref], message: "Fiches d'un élément absent" });
    (list ?? []).forEach((f, i) => {
      if (ficheIds.has(f.id)) problems.push({ path: ["fiches", ref, i, "id"], message: `Identifiant en double : ${f.id}` });
      ficheIds.add(f.id);
      if (!knownCategory(f.category)) problems.push({ path: ["fiches", ref, i, "category"], message: "Catégorie inconnue" });
    });
  }
  if (ficheCount(doc) > MAX_TOTAL_FICHES) {
    problems.push({ path: ["fiches"], message: `Plus de ${MAX_TOTAL_FICHES} fiches supplémentaires au total` });
  }

  const styled = Object.entries(doc.styles);
  if (styled.length > MAX_STYLES) problems.push({ path: ["styles"], message: `Plus de ${MAX_STYLES} styles` });
  for (const [ref, style] of styled) {
    if (!exists(ref)) problems.push({ path: ["styles", ref], message: "Style d'un élément absent" });
    if (!knownCategory(style?.category)) problems.push({ path: ["styles", ref, "category"], message: "Catégorie inconnue" });
  }
  return problems;
}

/** Document tel qu'il s'écrit dans un fichier exporté : sans les clés v2 vides. */
export type PortableMapDoc = Omit<MapDoc, keyof MapDocV2Parts> & Partial<MapDocV2Parts>;

/**
 * Retire les clés v2 vides : une carte qui n'utilise aucun ajout du format v2 s'exporte exactement au
 * format v1 (celui de la bêta), lisible par les versions précédentes.
 */
export function portableDoc(doc: MapDoc): PortableMapDoc {
  const { fiches, categories, styles, ...v1 } = doc;
  return {
    ...v1,
    ...(Object.keys(fiches).length > 0 ? { fiches } : {}),
    ...(categories.length > 0 ? { categories } : {}),
    ...(Object.keys(styles).length > 0 ? { styles } : {}),
  };
}
