// Logo ou aperçu d'une carte de la banque (DIV-01), enregistré avec la carte mais à part de son
// contenu : dans l'entrée IndexedDB en mode démo, dans la colonne public.maps.cover en mode compte
// (fonction set_map_cover, supabase/migrations/20261014120100_maps_cover.sql, mêmes contrôles).
//
// - Logo : une icône d'un jeu fixe et une couleur de la palette (ou « #rrggbb »).
// - Aperçu : une miniature SVG de la carte, affichée UNIQUEMENT dans un <img> (adresse data:, voir
//   coverDataUrl) — jamais insérée dans le HTML. Un SVG chargé comme image n'exécute aucun script et
//   ne charge aucune ressource ; le texte est de plus restreint (aucun script, aucun lien, aucune
//   référence externe, aucune déclaration XML) par défense en profondeur.
import { parseMapColor } from "@/features/map-doc/palette";
import type { MapColor } from "@/features/map-doc/palette";
import { z } from "@/lib/zod";
import { jsonByteLength } from "./limits";

/** Icônes proposées pour le logo d'une carte (noms d'icônes lucide, associés par l'interface). */
export const COVER_ICONS = [
  "globe",
  "map",
  "flag",
  "shield",
  "swords",
  "anchor",
  "ship",
  "plane",
  "factory",
  "landmark",
  "zap",
  "fuel",
  "wheat",
  "mountain",
  "compass",
  "target",
  "users",
  "scale",
  "radar",
  "crown",
] as const;
export type CoverIcon = (typeof COVER_ICONS)[number];

export type MapCover = { kind: "icon"; icon: CoverIcon; color: MapColor } | { kind: "preview"; svg: string };

/**
 * Taille maximale du SVG d'un aperçu (octets UTF-8) : une vignette. Bornes petites, car la liste de la
 * banque renvoie le logo de chaque carte (au plus 500) et le logo n'entre pas dans le quota de contenu.
 */
export const MAX_COVER_SVG_BYTES = 12_000;
/** Taille maximale d'un logo ou d'un aperçu en JSON compact (octets UTF-8), vérifiée aussi par la base. */
export const MAX_COVER_BYTES = 16_000;

/** Début obligatoire d'un aperçu. */
export const COVER_SVG_PREFIX = '<svg xmlns="http://www.w3.org/2000/svg"';

/**
 * Caractères permis dans un aperçu (liste blanche) : ceux qu'écrit buildPreviewSvg (balises fixes,
 * nombres, commandes de tracé, couleurs #rrggbb). Sans `&`, `\`, `(`, `{`, `@`, `!`, `?` ni `'`, aucune
 * entité XML ni échappement CSS ne peut reconstituer une référence (`&#117;rl(` donne `url(`), et il
 * n'y a ni feuille de style, ni déclaration ou instruction XML. Même expression dans la base.
 */
export const COVER_SVG_ALLOWED_CHARS = /^[A-Za-z0-9 <>/=".#:,-]*$/;

/** Balises permises : tout `<` ouvre ou ferme svg, g, path, rect ou circle. Même expression dans la base. */
export const COVER_SVG_UNKNOWN_TAG = /<(?!\/?(?:svg|g|path|rect|circle)[ />])/;

/**
 * Contenus refusés en plus dans un aperçu : scripts, objets embarqués, liens et références (href,
 * url()), feuilles importées, déclarations et instructions XML (<!…>, <?…>), attributs d'événement
 * (on…=). Même expression, insensible à la casse, dans la base.
 */
export const COVER_SVG_FORBIDDEN =
  /<script|<foreignobject|<iframe|<embed|<object|href|url\(|@import|javascript:|<!|<\?|\son[a-z]+\s*=/i;

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

/** Vrai si `svg` peut servir d'aperçu. */
export function isSafeCoverSvg(svg: string): boolean {
  return (
    utf8Length(svg) <= MAX_COVER_SVG_BYTES &&
    svg.startsWith(COVER_SVG_PREFIX) &&
    svg.endsWith("</svg>") &&
    COVER_SVG_ALLOWED_CHARS.test(svg) &&
    !COVER_SVG_UNKNOWN_TAG.test(svg) &&
    !COVER_SVG_FORBIDDEN.test(svg)
  );
}

const iconCover = z.object({
  kind: z.literal("icon"),
  icon: z.enum(COVER_ICONS),
  color: z
    .string()
    .max(16)
    .refine((v) => parseMapColor(v) !== null)
    .transform((v) => parseMapColor(v) as MapColor),
});
const previewCover = z.object({ kind: z.literal("preview"), svg: z.string().refine(isSafeCoverSvg) });

/** Logo ou aperçu valide (clés inconnues retirées, couleur normalisée). */
export const mapCoverSchema = z
  .discriminatedUnion("kind", [iconCover, previewCover])
  .refine((cover) => jsonByteLength(cover) <= MAX_COVER_BYTES);

/** Valide un logo ou un aperçu (venu du navigateur, de la base ou d'IndexedDB) ; null s'il est invalide. */
export function parseMapCover(value: unknown): MapCover | null {
  const parsed = mapCoverSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Adresse data: d'un aperçu, pour l'attribut src d'un <img> (jamais pour du HTML). */
export function coverDataUrl(svg: string): string | null {
  return isSafeCoverSvg(svg) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
}

