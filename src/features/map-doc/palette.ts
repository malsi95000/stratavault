// Palette de la carte : couleurs nommées des flux (jetons CSS de globals.css), reprises pour les
// couleurs des pays, des liens, des fiches et des catégories. Une couleur de carte est soit l'un de
// ces jetons, soit une couleur hexadécimale « #rrggbb » validée.
//
// Les dix premières couleurs sont celles de la bêta (même ordre, mêmes identifiants : les exports de
// la bêta s'importent tels quels). Les suivantes (bêta 2.1) sont lisibles sur le fond sombre.
// Toute couleur ajoutée ici doit l'être aussi dans globals.css (--color-flux-<id>) et dans la liste
// de la base (fonction public.maps_flux_colors, supabase/migrations/) : des tests le vérifient.

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
  "magenta",
  "lavande",
  "indigo",
  "bleu",
  "cyan",
  "turquoise",
  "menthe",
  "olive",
  "citron",
  "corail",
  "bordeaux",
  "sable",
] as const;
export type FluxColor = (typeof FLUX_COLOR_IDS)[number];

const LABELS: Record<FluxColor, string> = {
  jaune: "Jaune",
  orange: "Orange",
  violet: "Violet",
  "bleu-fonce": "Bleu foncé",
  "bleu-clair": "Bleu clair",
  rouge: "Rouge",
  marron: "Marron",
  "gris-clair": "Gris clair",
  vert: "Vert",
  "vert-fonce": "Vert foncé",
  magenta: "Magenta",
  lavande: "Lavande",
  indigo: "Indigo",
  bleu: "Bleu",
  cyan: "Cyan",
  turquoise: "Turquoise",
  menthe: "Menthe",
  olive: "Olive",
  citron: "Citron",
  corail: "Corail",
  bordeaux: "Bordeaux",
  sable: "Sable",
};

/** Couleurs de flux dans l'ordre du sélecteur (celles de la bêta d'abord). */
export const FLUX_COLORS: readonly { id: FluxColor; label: string; token: string }[] = FLUX_COLOR_IDS.map((id) => ({
  id,
  label: LABELS[id],
  token: `--color-flux-${id}`,
}));

export const FLUX_LABELS: Record<FluxColor, string> = Object.fromEntries(
  FLUX_COLORS.map((c) => [c.id, c.label]),
) as Record<FluxColor, string>;

export const FLUX_TOKENS: Record<FluxColor, string> = Object.fromEntries(
  FLUX_COLORS.map((c) => [c.id, c.token]),
) as Record<FluxColor, string>;

export const isFluxColor = (v: string): v is FluxColor => (FLUX_COLOR_IDS as readonly string[]).includes(v);

export const DEFAULT_FLUX_COLOR: FluxColor = "jaune";

/** Couleur hexadécimale, toujours écrite en minuscules dans une carte. */
export type HexColor = `#${string}`;
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

/** Couleur d'un pays, d'un lien, d'une fiche ou d'une catégorie : jeton de la palette ou « #rrggbb ». */
export type MapColor = FluxColor | HexColor;

/**
 * Lit une couleur saisie ou importée : un jeton de la palette, ou « #rrggbb » (majuscules acceptées,
 * ramenées en minuscules). null pour tout le reste (noms CSS, « #rgb », url(…), etc.).
 */
export function parseMapColor(value: string): MapColor | null {
  if (isFluxColor(value)) return value;
  const hex = value.toLowerCase();
  return HEX_COLOR_PATTERN.test(hex) ? (hex as HexColor) : null;
}

/** Vrai si `value` est une couleur de carte déjà normalisée (jeton ou hexadécimal en minuscules). */
export const isMapColor = (value: string): value is MapColor => isFluxColor(value) || HEX_COLOR_PATTERN.test(value);

/** Valeur CSS d'une couleur de carte : la variable du jeton, ou la couleur hexadécimale (déjà validée). */
export function colorCss(color: MapColor): string {
  return isFluxColor(color) ? `var(${FLUX_TOKENS[color]})` : color;
}
