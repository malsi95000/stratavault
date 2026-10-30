// Différences entre deux états de la carte collective : ce qu'une modification de l'éditeur change
// (vérifiée avant d'être acceptée : rules.ts), et ce qu'il reste à envoyer à la base (session).
import { FLUX_COLOR_IDS } from "@/features/map-doc/types";
import type { FluxColor, FluxStroke, Link, MapDoc, MapPoint, MapText, Ping, Zone } from "@/features/map-doc/types";
import { contentsOf, itemKey } from "./compose";
import { contentJson, fluxContent, linkContent, pingContent, pointContent, textContent, zoneContent } from "./itemData";
import type { ItemContent, ItemKind } from "./types";

/** Élément ajouté (`before` null), modifié, ou supprimé (`after` null). */
export type ElementChange = { key: string; kind: ItemKind; id: string; before: ItemContent | null; after: ItemContent | null };

/**
 * Éléments d'une collection qui diffèrent entre deux états. Les opérations de l'éditeur gardent
 * l'objet d'un élément qu'elles ne touchent pas : seuls les objets nouveaux sont comparés (en contenu
 * canonique, pour ignorer un objet recopié à l'identique).
 */
function collectionChanges<T extends { id: string }>(
  kind: ItemKind,
  before: readonly T[],
  after: readonly T[],
  contentOf: (item: T) => ItemContent,
  out: ElementChange[],
) {
  if (before === after) return;
  const previous = new Map(before.map((item) => [item.id, item]));
  for (const item of after) {
    const old = previous.get(item.id);
    previous.delete(item.id);
    if (old === item) continue;
    const next = contentOf(item);
    const prev = old ? contentOf(old) : null;
    if (prev && contentJson(prev) === contentJson(next)) continue;
    out.push({ key: itemKey(kind, item.id), kind, id: item.id, before: prev, after: next });
  }
  for (const [id, old] of previous) out.push({ key: itemKey(kind, id), kind, id, before: contentOf(old), after: null });
}

/** Éléments ajoutés, modifiés ou supprimés de `prev` à `next`. */
export function changedElements(prev: MapDoc, next: MapDoc): ElementChange[] {
  const out: ElementChange[] = [];
  collectionChanges<Ping>("ping", prev.pings, next.pings, pingContent, out);
  collectionChanges<MapPoint>("point", prev.points, next.points, pointContent, out);
  collectionChanges<MapText>("text", prev.texts, next.texts, textContent, out);
  collectionChanges<Zone>("zone", prev.zones, next.zones, zoneContent, out);
  collectionChanges<Link>("link", prev.links, next.links, linkContent, out);
  if (prev.flux !== next.flux) {
    for (const color of FLUX_COLOR_IDS) {
      const contentOf = (s: FluxStroke) => fluxContent(color as FluxColor, s);
      collectionChanges<FluxStroke>("flux", prev.flux[color] ?? [], next.flux[color] ?? [], contentOf, out);
    }
  }
  return out;
}

/** Élément tel que la base le connaît (dernière lecture ou dernier envoi réussi). */
export type BaseEntry = {
  content: ItemContent;
  /** Texte JSON canonique du contenu (comparaisons). */
  json: string;
  mine: boolean;
  authorName: string | null;
  authorHandle: string | null;
  createdAt: string;
};

export type SyncPlan = {
  /** Ajouts : extrémités possibles d'abord, liens ensuite (un lien vise un élément déjà enregistré). */
  creates: ItemContent[];
  updates: ItemContent[];
  /** Suppressions : liens d'abord (la suppression d'un élément emporte déjà ses liens dans la base). */
  deletes: ItemContent[];
};

/**
 * Ce qu'il reste à envoyer pour que la base corresponde au document : les éléments du compte
 * ajoutés, modifiés ou supprimés depuis `base`. Ceux des autres membres ne sont jamais envoyés.
 */
export function planSync(base: ReadonlyMap<string, BaseEntry>, doc: MapDoc): SyncPlan {
  const current = contentsOf(doc);
  const creates: ItemContent[] = [];
  const updates: ItemContent[] = [];
  const deletes: ItemContent[] = [];
  for (const [key, content] of current) {
    const known = base.get(key);
    if (!known) creates.push(content);
    else if (known.mine && known.json !== contentJson(content)) updates.push(content);
  }
  for (const [key, entry] of base) if (entry.mine && !current.has(key)) deletes.push(entry.content);
  const linksLast = (a: ItemContent, b: ItemContent) => Number(a.kind === "link") - Number(b.kind === "link");
  return { creates: creates.toSorted(linksLast), updates, deletes: deletes.toSorted((a, b) => -linksLast(a, b)) };
}

export const planIsEmpty = (plan: SyncPlan) => plan.creates.length + plan.updates.length + plan.deletes.length === 0;
