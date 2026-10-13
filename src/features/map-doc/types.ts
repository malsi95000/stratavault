// Modèle de document d'une carte. Le format JSON est celui de la bêta : un export de la bêta
// s'importe tel quel (voir schema.ts).
import type { LonLat } from "@/lib/geo";

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

export const FLUX_COLOR_IDS = [
  "jaune",
  "orange",
  "violet",
  "bleu-fonce",
  "bleu-clair",
  "rouge",
  "marron",
  "gris-clair",
  "vert",
  "vert-fonce",
] as const;
export type FluxColor = (typeof FLUX_COLOR_IDS)[number];

/** Couleurs de flux dans l'ordre du sélecteur de la bêta. */
export const FLUX_COLORS: readonly { id: FluxColor; label: string; token: string }[] = [
  { id: "jaune", label: "Jaune", token: "--color-flux-jaune" },
  { id: "orange", label: "Orange", token: "--color-flux-orange" },
  { id: "violet", label: "Violet", token: "--color-flux-violet" },
  { id: "bleu-fonce", label: "Bleu foncé", token: "--color-flux-bleu-fonce" },
  { id: "bleu-clair", label: "Bleu clair", token: "--color-flux-bleu-clair" },
  { id: "rouge", label: "Rouge", token: "--color-flux-rouge" },
  { id: "marron", label: "Marron", token: "--color-flux-marron" },
  { id: "gris-clair", label: "Gris clair", token: "--color-flux-gris-clair" },
  { id: "vert", label: "Vert", token: "--color-flux-vert" },
  { id: "vert-fonce", label: "Vert foncé", token: "--color-flux-vert-fonce" },
];

export const FLUX_LABELS: Record<FluxColor, string> = Object.fromEntries(
  FLUX_COLORS.map((c) => [c.id, c.label]),
) as Record<FluxColor, string>;

export const FLUX_TOKENS: Record<FluxColor, string> = Object.fromEntries(
  FLUX_COLORS.map((c) => [c.id, c.token]),
) as Record<FluxColor, string>;

export const isFluxColor = (v: string): v is FluxColor => (FLUX_COLOR_IDS as readonly string[]).includes(v);

export const DEFAULT_FLUX_COLOR: FluxColor = "jaune";
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

export type Link = { id: string; a: Ref; b: Ref; title: string; note: string; date?: string };
export type Ping = { id: string; ll: LonLat; type: PingType; title: string; note: string; date?: string };
export type MapPoint = { id: string; ll: LonLat; title: string; note: string; date?: string };
/** Anneau fermé (premier point = dernier point, au moins 4 points), orienté sur la plus petite surface. */
export type Zone = { id: string; ring: LonLat[]; title: string; note: string; date?: string };
export type MapText = { id: string; ll: LonLat; title: string; note: string; date?: string; size?: number };
export type FluxStroke = { id: string; points: LonLat[]; width: number; opacity?: number };
/** Fiche technique partagée par tous les traits d'une même couleur. */
export type FluxFiche = { title?: string; note?: string; date?: string };

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
};

/** Champs modifiables depuis une fiche. */
export type FicheFields = { title?: string; note?: string; date?: string };

/** Élément ouvert dans le panneau. */
export type Selection = { k: EntityKind; id: string };
