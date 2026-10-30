// Passage entre les éléments de la carte collective et le document de l'éditeur : la carte est
// affichée et modifiée dans l'éditeur habituel, comme une carte ordinaire faite de ces seuls
// éléments (ni notes de pays, ni fiches supplémentaires, ni catégories).
import { countryByCode } from "@/data/countries";
import { entityExists, erase } from "@/features/map-doc/ops";
import { refExists } from "@/features/map-doc/refs";
import { blankDoc } from "@/features/map-doc/schema";
import { FLUX_COLOR_IDS } from "@/features/map-doc/types";
import type { EntityKind, FluxStroke, MapDoc, Ref } from "@/features/map-doc/types";
import { fluxContent, linkContent, pingContent, pointContent, textContent, zoneContent } from "./itemData";
import type { ItemContent, ItemKind } from "./types";

/** Sorte d'élément de l'éditeur (attribut data-k) de chaque sorte de la carte collective. */
export const ENTITY_OF: Record<ItemKind, Exclude<EntityKind, "c">> = {
  ping: "p",
  point: "o",
  text: "t",
  zone: "z",
  link: "l",
  flux: "flux",
};

const KIND_OF: Partial<Record<EntityKind, ItemKind>> = { p: "ping", o: "point", t: "text", z: "zone", l: "link", flux: "flux" };

/** Sorte de la carte collective d'un élément de l'éditeur ; null pour un pays. */
export const itemKindOf = (k: EntityKind): ItemKind | null => KIND_OF[k] ?? null;

/** Clé d'un élément, unique dans la carte (« ping:<id> »…). */
export const itemKey = (kind: ItemKind, id: string) => `${kind}:${id}`;

/** Clé de l'élément de l'éditeur désigné par `k` et `id` ; null pour un pays. */
export function entityKey(k: EntityKind, id: string): string | null {
  const kind = itemKindOf(k);
  return kind ? itemKey(kind, id) : null;
}

/** Clé de l'élément visé par une extrémité de lien (« p:<id> ») ; null pour un pays. */
export function refKey(ref: Ref): string | null {
  const i = ref.indexOf(":");
  return entityKey(ref.slice(0, i) as EntityKind, ref.slice(i + 1));
}

/** Document de l'éditeur fait des éléments donnés (un lien dont une extrémité manque est omis). */
export function composeDoc(items: readonly ItemContent[]): MapDoc {
  const doc = blankDoc();
  const flux: Partial<Record<string, FluxStroke[]>> = {};
  const links: ItemContent[] = [];
  for (const item of items) {
    switch (item.kind) {
      case "ping":
        doc.pings.push({ id: item.id, ...item.data });
        break;
      case "point":
        doc.points.push({ id: item.id, ...item.data });
        break;
      case "text":
        doc.texts.push({ id: item.id, ...item.data });
        break;
      case "zone":
        doc.zones.push({ id: item.id, ...item.data });
        break;
      case "flux": {
        const { color, ...stroke } = item.data;
        (flux[color] ??= []).push({ id: item.id, ...stroke });
        break;
      }
      case "link":
        links.push(item);
        break;
    }
  }
  const ids = {
    p: new Set(doc.pings.map((x) => x.id)),
    o: new Set(doc.points.map((x) => x.id)),
    z: new Set(doc.zones.map((x) => x.id)),
    t: new Set(doc.texts.map((x) => x.id)),
  };
  const endExists = (ref: Ref) => {
    const [k, id] = [ref.slice(0, 1), ref.slice(2)];
    if (k === "c") return countryByCode.has(id);
    return ids[k as keyof typeof ids]?.has(id) ?? false;
  };
  for (const item of links) {
    if (item.kind !== "link" || !endExists(item.data.a) || !endExists(item.data.b)) continue;
    doc.links.push({ id: item.id, ...item.data });
  }
  for (const color of FLUX_COLOR_IDS) if (flux[color]) doc.flux[color] = flux[color];
  return doc;
}

/** Tous les éléments du document, en contenu canonique, par clé. */
export function contentsOf(doc: MapDoc): Map<string, ItemContent> {
  const out = new Map<string, ItemContent>();
  const add = (content: ItemContent) => out.set(itemKey(content.kind, content.id), content);
  doc.pings.forEach((x) => add(pingContent(x)));
  doc.points.forEach((x) => add(pointContent(x)));
  doc.texts.forEach((x) => add(textContent(x)));
  doc.zones.forEach((x) => add(zoneContent(x)));
  doc.links.forEach((x) => add(linkContent(x)));
  for (const color of FLUX_COLOR_IDS) doc.flux[color]?.forEach((s) => add(fluxContent(color, s)));
  return out;
}

/** Vrai si le document ne contient que des éléments de la carte collective (rien d'autre n'y est accepté). */
export function hasOnlyItems(doc: MapDoc): boolean {
  return (
    Object.keys(doc.notes).length === 0 &&
    Object.keys(doc.dates).length === 0 &&
    Object.values(doc.fluxFiches).every((f) => !f || Object.values(f).every((v) => !v)) &&
    Object.keys(doc.fiches).length === 0 &&
    doc.categories.length === 0 &&
    Object.keys(doc.styles).length === 0
  );
}

/**
 * Document où l'élément de clé `key` est remis à `content` (null : retiré, avec les liens qui y sont
 * rattachés). Sert à annuler, dans l'éditeur, une modification que la base a refusée.
 */
export function withElement(doc: MapDoc, key: string, content: ItemContent | null): MapDoc {
  const i = key.indexOf(":");
  const kind = key.slice(0, i) as ItemKind;
  const id = key.slice(i + 1);
  const entity = ENTITY_OF[kind];
  let next = entityExists(doc, entity, id) ? erase(doc, entity, id) : doc;
  if (!content) return next;
  // Remis en place à partir de la forme composée (même code que la lecture de la carte).
  const single = composeDoc([content]);
  if (content.kind === "link") {
    // Un lien dont une extrémité manque n'est pas remis (comme à la lecture de la carte).
    if (!refExists(next, content.data.a) || !refExists(next, content.data.b)) return next;
    next = { ...next, links: [...next.links, { id: content.id, ...content.data }] };
  } else if (content.kind === "flux") {
    const { color, ...stroke } = content.data;
    next = { ...next, flux: { ...next.flux, [color]: [...(next.flux[color] ?? []), { id: content.id, ...stroke }] } };
  } else {
    next = {
      ...next,
      pings: [...next.pings, ...single.pings],
      points: [...next.points, ...single.points],
      texts: [...next.texts, ...single.texts],
      zones: [...next.zones, ...single.zones],
    };
  }
  return next;
}
