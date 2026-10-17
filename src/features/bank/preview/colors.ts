// Couleurs de l'aperçu d'une carte (DIV-01). L'aperçu est un SVG affiché comme image (<img src="data:…">) :
// il n'a pas accès aux variables CSS de la page, ses couleurs y sont donc écrites en clair. Ce sont
// celles de globals.css (un test vérifie qu'elles restent identiques).
import { FLUX_TOKENS, isFluxColor } from "@/features/map-doc/palette";
import type { FluxColor, MapColor } from "@/features/map-doc/palette";
import { PING_TOKENS } from "@/features/map-doc/types";
import type { PingType } from "@/features/map-doc/types";

/** Couleurs du fond de l'aperçu, par variable de globals.css. */
export const PREVIEW_BASE = {
  "--color-bg": "#0d1013",
  "--color-map-ocean": "#0a1015",
  "--color-map-edge": "#3b4650",
  "--color-map-country": "#232b32",
  "--color-acc": "#f2b134",
} as const;

/** Couleurs de la palette (jetons --color-flux-*). */
export const PREVIEW_FLUX: Record<FluxColor, string> = {
  jaune: "#f2b134",
  orange: "#f07828",
  violet: "#a66cff",
  "bleu-fonce": "#245a9c",
  "bleu-clair": "#65c7e8",
  rouge: "#e2513a",
  marron: "#8b5a3c",
  "gris-clair": "#c9d3da",
  vert: "#4caf50",
  "vert-fonce": "#176b3a",
  magenta: "#e05ad6",
  lavande: "#b9a6ff",
  indigo: "#7b83eb",
  bleu: "#3d8bfd",
  cyan: "#22d3ee",
  turquoise: "#2ec4b6",
  menthe: "#8ee4af",
  olive: "#a3a83a",
  citron: "#e3ea4c",
  corail: "#ff7f6b",
  bordeaux: "#b8325a",
  sable: "#d8c08e",
};

/** Couleurs des types de balise (jetons --color-ping-*). */
export const PREVIEW_PING: Record<PingType, string> = {
  maritime: "#5ee1ff",
  entreprises: "#f0a63a",
  armes: "#e2513a",
  strategique: "#c9d3da",
  crise: "#ff6b9c",
  "base-militaire": "#8fd3ff",
};

/** Couleur hexadécimale d'une couleur de carte (jeton de la palette ou « #rrggbb » déjà validé). */
export function previewHex(color: MapColor): string {
  return isFluxColor(color) ? PREVIEW_FLUX[color] : color;
}

/** Variables CSS dont l'aperçu recopie la valeur (vérifiées par les tests). */
export const PREVIEW_TOKENS: readonly { token: string; hex: string }[] = [
  ...Object.entries(PREVIEW_BASE).map(([token, hex]) => ({ token, hex })),
  ...Object.entries(PREVIEW_FLUX).map(([id, hex]) => ({ token: FLUX_TOKENS[id as FluxColor], hex })),
  ...Object.entries(PREVIEW_PING).map(([type, hex]) => ({ token: PING_TOKENS[type as PingType], hex })),
];
