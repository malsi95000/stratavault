// Fiches d'une carte mises à plat : la fiche principale de chaque élément (pays, lien, balise, point,
// zone, texte, flux) et ses fiches supplémentaires. C'est la matière commune de la frise (fiches
// datées) et des filtres (un élément est visible sur la carte si l'une de ses fiches passe le filtre).
import { countryByCode } from "@/data/countries";
import { makeElementRef } from "@/features/map-doc/refs";
import { displayColor } from "@/features/map-doc/styles";
import { FLUX_COLOR_IDS, FLUX_LABELS, PING_LABELS, PING_TOKENS } from "@/features/map-doc/types";
import type { Category, ElementKind, ElementRef, ElementStyle, EntityKind, ExtraFiche, MapColor, MapDoc } from "@/features/map-doc/types";
import { parseFicheDate } from "./dates";
import type { FicheDate } from "./dates";

/** Sortes d'éléments, dans l'ordre du filtre « Types » : celles des fiches, plus les flux. */
export const ENTRY_KINDS = ["c", "l", "p", "o", "z", "t", "flux"] as const satisfies readonly EntityKind[];
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  c: "Pays",
  l: "Liens",
  p: "Balises",
  o: "Points",
  z: "Zones",
  t: "Textes",
  flux: "Flux",
};

/** Fiche à ouvrir dans le panneau (sélection de l'éditeur). */
export type EntryTarget = { k: EntityKind; id: string; fiche?: string };

export type Entry = {
  /** Identifiant unique dans la carte : « main:c:FRA », « fiche:<id> », « flux:jaune ». */
  key: string;
  kind: EntryKind;
  /** Élément qui porte la fiche : code pays, identifiant d'élément, ou couleur pour un flux. */
  owner: string;
  /** Référence de l'élément (null pour un flux) : sert à afficher son nom. */
  ref: ElementRef | null;
  target: EntryTarget;
  /** Fiche principale de l'élément (false : fiche supplémentaire). */
  main: boolean;
  /** Titre affiché ; vide pour un lien sans titre (on affiche alors le nom de ses extrémités). */
  title: string;
  /** Date telle qu'écrite dans la fiche (vide : aucune). */
  date: string;
  /** Date lue, null si absente ou illisible. */
  when: FicheDate | null;
  /** Couleur de la fiche : la sienne, sinon celle de sa catégorie, sinon celle de l'élément. */
  color: MapColor | null;
  /** Catégorie de la fiche, sinon celle de l'élément. */
  category: string | null;
  /**
   * Couleur CSS de l'élément sur la carte quand la fiche n'a pas de couleur (`color` null) : celle du
   * type d'une balise. Pour l'affichage seulement : ce n'est pas un critère du filtre « Couleurs ».
   */
  tint?: string;
};

type Common = Pick<Entry, "kind" | "owner" | "ref" | "target" | "title" | "date" | "tint"> & {
  style: ElementStyle | undefined;
};

function mainEntry(c: Common, categories: readonly Category[]): Entry {
  const { style, ...rest } = c;
  return {
    ...rest,
    key: `main:${c.ref ?? c.owner}`,
    main: true,
    when: parseFicheDate(c.date),
    color: displayColor(style, categories),
    category: style?.category ?? null,
  };
}

function extraEntry(c: Common, fiche: ExtraFiche, categories: readonly Category[]): Entry {
  const category = fiche.category ?? c.style?.category ?? null;
  const categoryColor = fiche.category ? (categories.find((x) => x.id === fiche.category)?.color ?? null) : null;
  return {
    key: `fiche:${fiche.id}`,
    kind: c.kind,
    owner: c.owner,
    ref: c.ref,
    target: { ...c.target, fiche: fiche.id },
    main: false,
    title: fiche.title.trim() || "Fiche sans titre",
    date: fiche.date ?? "",
    when: parseFicheDate(fiche.date),
    color: fiche.color ?? categoryColor ?? displayColor(c.style, categories),
    category,
    ...(c.tint === undefined ? {} : { tint: c.tint }),
  };
}

/** Toutes les fiches de la carte, dans l'ordre des collections (pays, liens, balises, points, zones, textes, flux). */
export function collectEntries(doc: MapDoc): Entry[] {
  const entries: Entry[] = [];
  const { categories } = doc;
  const style = (ref: ElementRef) => (Object.hasOwn(doc.styles, ref) ? doc.styles[ref] : undefined);

  const element = (
    kind: ElementKind,
    id: string,
    title: string,
    date: string | undefined,
    { withMain = true, tint }: { withMain?: boolean; tint?: string } = {},
  ) => {
    const ref = makeElementRef(kind, id);
    const common: Common = { kind, owner: id, ref, target: { k: kind, id }, title, date: date ?? "", style: style(ref) };
    if (tint !== undefined) common.tint = tint;
    if (withMain) entries.push(mainEntry(common, categories));
    for (const fiche of Object.hasOwn(doc.fiches, ref) ? (doc.fiches[ref] ?? []) : []) {
      entries.push(extraEntry(common, fiche, categories));
    }
  };

  // Pays : ceux qui ont des notes, une date, un style ou des fiches supplémentaires.
  const codes = new Set([...Object.keys(doc.notes), ...Object.keys(doc.dates)]);
  for (const ref of [...Object.keys(doc.styles), ...Object.keys(doc.fiches)]) {
    if (ref.startsWith("c:")) codes.add(ref.slice(2));
  }
  for (const code of codes) {
    if (!countryByCode.has(code)) continue;
    const note = Object.hasOwn(doc.notes, code) ? doc.notes[code] : "";
    const date = Object.hasOwn(doc.dates, code) ? doc.dates[code] : "";
    const hasMain = Boolean(note || date || style(makeElementRef("c", code)));
    element("c", code, countryByCode.get(code)?.name ?? code, date, { withMain: hasMain });
  }
  for (const l of doc.links) element("l", l.id, l.title.trim(), l.date);
  // Balise : à défaut de couleur, la frise reprend celle de son type, comme sur la carte.
  for (const p of doc.pings) {
    element("p", p.id, p.title.trim() || PING_LABELS[p.type], p.date, { tint: `var(${PING_TOKENS[p.type]})` });
  }
  for (const o of doc.points) element("o", o.id, o.title.trim() || "Point", o.date);
  for (const z of doc.zones) element("z", z.id, z.title.trim() || "Zone", z.date);
  for (const t of doc.texts) element("t", t.id, t.title.trim() || "Texte sans titre", t.date);

  // Flux : une fiche par couleur tracée, ouverte depuis son premier trait.
  for (const color of FLUX_COLOR_IDS) {
    const first = doc.flux[color]?.[0];
    if (!first) continue;
    const fiche = doc.fluxFiches[color] ?? {};
    const date = fiche.date ?? "";
    entries.push({
      key: `flux:${color}`,
      kind: "flux",
      owner: color,
      ref: null,
      target: { k: "flux", id: first.id },
      main: true,
      title: fiche.title?.trim() || `Flux ${FLUX_LABELS[color].toLowerCase()}`,
      date,
      when: parseFicheDate(date),
      color,
      category: null,
    });
  }
  return entries;
}

/**
 * Clé de la fiche ouverte dans le panneau (pour la repérer sur la frise) ; null si rien n'est ouvert.
 * `fluxColor` donne la couleur d'un trait de flux (toutes les fiches d'une couleur n'en font qu'une).
 */
export function entryKeyOf(
  selection: { k: EntityKind; id: string; fiche?: string } | null,
  fluxColor: (strokeId: string) => string | null,
): string | null {
  if (!selection) return null;
  if (selection.fiche !== undefined) return `fiche:${selection.fiche}`;
  if (selection.k === "flux") {
    const color = fluxColor(selection.id);
    return color ? `flux:${color}` : null;
  }
  return `main:${selection.k}:${selection.id}`;
}
