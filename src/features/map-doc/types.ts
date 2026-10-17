// Modèle de document d'une carte. Le format JSON est celui de la bêta : un export de la bêta
// s'importe tel quel (voir schema.ts).
import type { LonLat } from "@/lib/geo";
import type { FluxColor, MapColor } from "./palette";

export type { LonLat };

export const PING_TYPES = ["maritime", "entreprises", "armes", "strategique", "crise", "base-militaire"] as const;
export type PingType = (typeof PING_TYPES)[number];

export const PING_LABELS: Record<PingType, string> = {
  maritime: "Balise maritime",
  entreprises: "Balise entreprise",
  armes: "Balise groupe armé",
  strategique: "Balise point stratégique",
  crise: "Ping crise",
  "base-militaire": "Ping base militaire",
};

/** Variable CSS (définie dans globals.css) de la couleur de chaque type de balise. */
export const PING_TOKENS: Record<PingType, string> = {
  maritime: "--color-ping-maritime",
  entreprises: "--color-ping-entreprises",
  armes: "--color-ping-armes",
  strategique: "--color-ping-strategique",
  crise: "--color-ping-crise",
  "base-militaire": "--color-ping-base-militaire",
};

export const DEFAULT_PING_TYPE: PingType = "strategique";

export const isPingType = (v: string): v is PingType => (PING_TYPES as readonly string[]).includes(v);

export {
  DEFAULT_FLUX_COLOR,
  FLUX_COLORS,
  FLUX_COLOR_IDS,
  FLUX_LABELS,
  FLUX_TOKENS,
  HEX_COLOR_PATTERN,
  colorCss,
  isFluxColor,
  isMapColor,
  parseMapColor,
} from "./palette";
export type { FluxColor, HexColor, MapColor } from "./palette";

export const FLUX_WIDTH_MIN = 1;
export const FLUX_WIDTH_MAX = 16;
export const DEFAULT_FLUX_WIDTH = 4;
/** Le trait est dessiné avec une épaisseur de `width × FLUX_WIDTH_FACTOR`. */
export const FLUX_WIDTH_FACTOR = 5;
export const DEFAULT_FLUX_OPACITY = 0.65;

export const TEXT_SIZE_MIN = 6;
export const TEXT_SIZE_MAX = 40;
export const DEFAULT_TEXT_SIZE = 13;

/** Identifiants des éléments (forme produite par uid(), ou plus large pour les imports). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_TITLE_LENGTH = 200;
export const MAX_NOTE_LENGTH = 100_000;
export const MAX_DATE_LENGTH = 32;
/** Nombre maximal d'éléments par collection et de sommets par tracé. */
export const MAX_ITEMS = 20_000;
export const MAX_PATH_POINTS = 20_000;
/**
 * Plafonds de toute la carte (fichier importé hostile : chaque élément est un élément SVG, chaque
 * sommet un point à projeter). Une carte réaliste en est très loin (quelques centaines d'éléments,
 * quelques dizaines de milliers de sommets) ; une carte de la banque (4 Mo de JSON au plus) aussi.
 */
/** Éléments de toutes les collections : liens, balises, points, zones, textes et traits de flux. */
export const MAX_TOTAL_ITEMS = 50_000;
/** Sommets de tous les tracés : anneaux des zones et traits de flux. */
export const MAX_TOTAL_PATH_POINTS = 200_000;

/** Sortes d'éléments vers lesquelles un lien peut pointer. */
export const REF_KINDS = ["c", "p", "o", "z", "t"] as const;
export type RefKind = (typeof REF_KINDS)[number];
/** Référence « type:id » : "c:FRA" (pays), "p:<id>" (balise), "o:<id>" (point), "z:<id>" (zone), "t:<id>" (texte). */
export type Ref = `${RefKind}:${string}`;

/** Sortes d'éléments cliquables sur la carte (attribut data-k). */
export type EntityKind = RefKind | "l" | "flux";
/** Éléments dotés d'un titre, de notes et d'une date propres. */
export type FicheKind = "l" | "p" | "o" | "z" | "t";

/**
 * Format v2 : sortes d'éléments qui peuvent porter des fiches supplémentaires et un style (couleur,
 * catégorie) : pays, liens, balises, points, zones et textes (pas les traits de flux).
 */
export const ELEMENT_KINDS = ["c", "l", "p", "o", "z", "t"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];
/** Référence d'un élément : "c:FRA", "l:<id>", "p:<id>"… (clé des fiches et des styles). */
export type ElementRef = `${ElementKind}:${string}`;

export type Link = { id: string; a: Ref; b: Ref; title: string; note: string; date?: string };
export type Ping = { id: string; ll: LonLat; type: PingType; title: string; note: string; date?: string };
export type MapPoint = { id: string; ll: LonLat; title: string; note: string; date?: string };
/** Anneau fermé (premier point = dernier point, au moins 4 points), orienté sur la plus petite surface. */
export type Zone = { id: string; ring: LonLat[]; title: string; note: string; date?: string };
export type MapText = { id: string; ll: LonLat; title: string; note: string; date?: string; size?: number };
export type FluxStroke = { id: string; points: LonLat[]; width: number; opacity?: number };
/** Fiche technique partagée par tous les traits d'une même couleur. */
export type FluxFiche = { title?: string; note?: string; date?: string };

/**
 * Fiche supplémentaire d'un élément (format v2). La fiche principale reste celle du format v1 (notes
 * et date du pays, titre, notes et date d'un lien…). `category` est l'identifiant d'une catégorie de
 * la carte.
 */
export type ExtraFiche = {
  id: string;
  title: string;
  note: string;
  date?: string;
  color?: MapColor;
  category?: string;
};

/** Catégorie définie par la carte (format v2). */
export type Category = { id: string; label: string; color: MapColor };

/** Couleur et catégorie d'un élément (format v2). Jamais vide : un style sans rien est retiré. */
export type ElementStyle = { color?: MapColor; category?: string };

/**
 * Document d'une carte. Format v1 (bêta) : les neuf premières clés. Format v2 (bêta 2.1) : `fiches`,
 * `categories` et `styles`, facultatifs à l'import (un export v1 ou de la bêta se lit toujours) et
 * toujours présents une fois le document normalisé (schema.ts).
 */
export type MapDoc = {
  /** Notes des pays, clé = code pays. */
  notes: Record<string, string>;
  /** Dates des pays (AAAA-MM-JJ), clé = code pays. */
  dates: Record<string, string>;
  links: Link[];
  pings: Ping[];
  points: MapPoint[];
  zones: Zone[];
  texts: MapText[];
  flux: Partial<Record<FluxColor, FluxStroke[]>>;
  fluxFiches: Partial<Record<FluxColor, FluxFiche>>;
  /** Fiches supplémentaires, par élément (jamais de liste vide). */
  fiches: Partial<Record<ElementRef, ExtraFiche[]>>;
  /** Catégories de la carte, dans l'ordre d'affichage. */
  categories: Category[];
  /** Couleur et catégorie des éléments. */
  styles: Partial<Record<ElementRef, ElementStyle>>;
};

/** Champs modifiables depuis une fiche. */
export type FicheFields = { title?: string; note?: string; date?: string };

/**
 * Élément ouvert dans le panneau. `fiche` : identifiant d'une de ses fiches supplémentaires, ouverte à
 * la place de sa fiche principale (format v2).
 */
export type Selection = { k: EntityKind; id: string; fiche?: string };
