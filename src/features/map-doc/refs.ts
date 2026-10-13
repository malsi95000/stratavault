// Références « type:id » utilisées par les liens (format de la bêta).
import { countryByCode } from "@/data/countries";
import { ringCentroid } from "./geometry";
import { ID_PATTERN, PING_LABELS, REF_KINDS } from "./types";
import type { Link, LonLat, MapDoc, Ref, RefKind } from "./types";

export type RefParts = { k: RefKind; id: string };

export function isRefKind(k: string): k is RefKind {
  return (REF_KINDS as readonly string[]).includes(k);
}

/** Découpe une référence. Une référence sans « : » est un code pays (anciens exports : "FRA"). */
export function parseRef(ref: string): RefParts | null {
  const i = ref.indexOf(":");
  const k = i < 0 ? "c" : ref.slice(0, i);
  const id = i < 0 ? ref : ref.slice(i + 1);
  if (!isRefKind(k) || !ID_PATTERN.test(id)) return null;
  return { k, id };
}

export function makeRef(k: RefKind, id: string): Ref {
  return `${k}:${id}`;
}

/** Vrai si la référence désigne un élément présent dans le document (ou un pays connu). */
export function refExists(doc: MapDoc, ref: string): boolean {
  const parts = parseRef(ref);
  if (!parts) return false;
  const { k, id } = parts;
  if (k === "c") return countryByCode.has(id);
  if (k === "p") return doc.pings.some((x) => x.id === id);
  if (k === "o") return doc.points.some((x) => x.id === id);
  if (k === "z") return doc.zones.some((x) => x.id === id);
  return doc.texts.some((x) => x.id === id);
}

/**
 * Comme refExists, pour vérifier beaucoup de références : les identifiants sont indexés une fois
 * (temps linéaire au lieu de liens × éléments, borne utile contre un document hostile).
 */
export function refChecker(doc: Pick<MapDoc, "pings" | "points" | "zones" | "texts">): (ref: string) => boolean {
  const ids: Record<Exclude<RefKind, "c">, Set<string>> = {
    p: new Set(doc.pings.map((x) => x.id)),
    o: new Set(doc.points.map((x) => x.id)),
    z: new Set(doc.zones.map((x) => x.id)),
    t: new Set(doc.texts.map((x) => x.id)),
  };
  return (ref) => {
    const parts = parseRef(ref);
    if (!parts) return false;
    return parts.k === "c" ? countryByCode.has(parts.id) : ids[parts.k].has(parts.id);
  };
}

/** Nom affiché d'une extrémité de lien (libellés de la bêta). */
export function nameOfRef(doc: MapDoc, ref: string): string {
  const parts = parseRef(ref);
  if (!parts) return "Élément inconnu";
  const { k, id } = parts;
  if (k === "c") return countryByCode.get(id)?.name ?? "Pays inconnu";
  if (k === "p") {
    const p = doc.pings.find((x) => x.id === id);
    return p ? p.title || PING_LABELS[p.type] : "Balise supprimée";
  }
  if (k === "o") {
    const p = doc.points.find((x) => x.id === id);
    return p ? p.title || "Point" : "Point supprimé";
  }
  if (k === "t") {
    const t = doc.texts.find((x) => x.id === id);
    return t ? t.title || "Texte sans titre" : "Texte supprimé";
  }
  const z = doc.zones.find((x) => x.id === id);
  return z ? z.title || "Zone" : "Zone supprimée";
}

/** Point d'ancrage d'un pays, fourni par l'appelant (première capitale, sinon centroïde de la géométrie). */
export type CountryAnchor = (code: string) => LonLat | null;

/** Point d'ancrage d'une extrémité de lien, ou null si l'élément n'existe plus. */
export function anchorOf(doc: MapDoc, ref: string, countryAnchor: CountryAnchor): LonLat | null {
  const parts = parseRef(ref);
  if (!parts) return null;
  const { k, id } = parts;
  if (k === "c") return countryAnchor(id);
  if (k === "p") return doc.pings.find((x) => x.id === id)?.ll ?? null;
  if (k === "o") return doc.points.find((x) => x.id === id)?.ll ?? null;
  if (k === "t") return doc.texts.find((x) => x.id === id)?.ll ?? null;
  const z = doc.zones.find((x) => x.id === id);
  return z ? ringCentroid(z.ring) : null;
}

/** Éléments nécessaires pour placer les liens. */
export type LinkSources = Pick<MapDoc, "links" | "pings" | "points" | "zones" | "texts">;

// Centroïde de chaque anneau, calculé une fois (un anneau n'est jamais modifié en place).
const centroids = new WeakMap<readonly LonLat[], LonLat>();
function cachedCentroid(ring: readonly LonLat[]): LonLat {
  let c = centroids.get(ring);
  if (!c) {
    c = ringCentroid(ring);
    centroids.set(ring, c);
  }
  return c;
}

/**
 * Ancres de tous les liens (première capitale ou centroïde du pays, balise, point, centroïde de zone,
 * texte). Un lien dont une extrémité a disparu est omis (la bêta le faisait partir de [0, 0]).
 */
export function linkAnchors(
  src: LinkSources,
  countryAnchor: CountryAnchor,
): { id: string; link: Link; a: LonLat; b: LonLat }[] {
  const byRef = new Map<string, LonLat>();
  for (const p of src.pings) byRef.set(`p:${p.id}`, p.ll);
  for (const p of src.points) byRef.set(`o:${p.id}`, p.ll);
  for (const t of src.texts) byRef.set(`t:${t.id}`, t.ll);
  const zones = new Map(src.zones.map((z) => [`z:${z.id}`, z.ring]));
  const anchor = (ref: string): LonLat | null => {
    const parts = parseRef(ref);
    if (!parts) return null;
    if (parts.k === "c") return countryAnchor(parts.id);
    const key = makeRef(parts.k, parts.id);
    if (parts.k === "z") {
      const ring = zones.get(key);
      return ring ? cachedCentroid(ring) : null;
    }
    return byRef.get(key) ?? null;
  };
  return src.links.flatMap((link) => {
    const a = anchor(link.a);
    const b = anchor(link.b);
    return a && b ? [{ id: link.id, link, a, b }] : [];
  });
}
