// Opérations sur le document : fonctions pures, le document d'entrée n'est jamais modifié.
import { countryByCode } from "@/data/countries";
import { normalizeRing } from "./geometry";
import { fluxCount, isFluxFull, isFull, lacksPathRoom } from "./limits";
import { makeRef, refExists } from "./refs";
import {
  DEFAULT_FLUX_OPACITY,
  FLUX_COLOR_IDS,
  FLUX_WIDTH_MAX,
  FLUX_WIDTH_MIN,
  MAX_DATE_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_PATH_POINTS,
  MAX_TITLE_LENGTH,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
} from "./types";
import type {
  EntityKind,
  FicheFields,
  FicheKind,
  FluxColor,
  FluxFiche,
  FluxStroke,
  Link,
  LonLat,
  MapDoc,
  MapPoint,
  MapText,
  Ping,
  PingType,
  Ref,
  Zone,
} from "./types";

/** Identifiant court, même forme que la bêta (horodatage base 36 + aléa). */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Les opérations respectent les bornes du schéma (longueurs, coordonnées, nombre d'éléments par
// collection et pour toute la carte, sommets des tracés : limits.ts) : un document produit par
// l'éditeur se relit toujours. Un ajout au-delà d'un plafond est refusé (null).
export { fluxCount, isFluxFull, isFull, lacksPathRoom };
const clamp = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const lonLat = (p: LonLat): LonLat => [clamp(p[0], -180, 180), clamp(p[1], -90, 90)];

/** Coupe un texte à `max` unités UTF-16, sans couper un caractère en deux. */
export function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const code = text.charCodeAt(max - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

export type Added = { doc: MapDoc; id: string };

/**
 * Ajoute un lien entre deux extrémités distinctes et existantes ; renvoie le lien existant s'il y en a
 * déjà un, null si une extrémité n'existe pas ou si la limite d'éléments est atteinte.
 */
export function addLink(doc: MapDoc, a: Ref, b: Ref, id: string = uid()): Added | null {
  if (a === b || !refExists(doc, a) || !refExists(doc, b)) return null;
  const existing = doc.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  if (existing) return { doc, id: existing.id };
  if (isFull(doc, doc.links)) return null;
  const link: Link = { id, a, b, title: "", note: "" };
  return { doc: { ...doc, links: [...doc.links, link] }, id };
}

/** Balise ; null si la limite d'éléments est atteinte (de même pour les autres ajouts). */
export function addPing(doc: MapDoc, ll: LonLat, type: PingType, id: string = uid()): Added | null {
  if (isFull(doc, doc.pings)) return null;
  const ping: Ping = { id, ll: lonLat(ll), title: "", note: "", type };
  return { doc: { ...doc, pings: [...doc.pings, ping] }, id };
}

export function addPoint(doc: MapDoc, ll: LonLat, id: string = uid()): Added | null {
  if (isFull(doc, doc.points)) return null;
  const point: MapPoint = { id, ll: lonLat(ll), title: "", note: "", date: "" };
  return { doc: { ...doc, points: [...doc.points, point] }, id };
}

/** Zone à partir du tracé du lasso (au moins 3 points distincts), refermée et orientée ; null sinon. */
export function addZone(doc: MapDoc, points: readonly LonLat[], id: string = uid()): Added | null {
  if (isFull(doc, doc.zones)) return null;
  // Le point de fermeture s'ajoute au tracé : il doit tenir dans la limite du schéma.
  const traced = points.slice(0, MAX_PATH_POINTS - 1).map(lonLat);
  if (new Set(traced.map((p) => `${p[0]},${p[1]}`)).size < 3) return null;
  const ring = normalizeRing(traced);
  if (lacksPathRoom(doc, ring.length)) return null;
  const zone: Zone = { id, ring, title: "", note: "" };
  return { doc: { ...doc, zones: [...doc.zones, zone] }, id };
}

export function addText(doc: MapDoc, ll: LonLat, size: number, id: string = uid()): Added | null {
  if (isFull(doc, doc.texts)) return null;
  const text: MapText = {
    id,
    ll: lonLat(ll),
    title: "",
    note: "",
    date: "",
    size: clamp(size, TEXT_SIZE_MIN, TEXT_SIZE_MAX),
  };
  return { doc: { ...doc, texts: [...doc.texts, text] }, id };
}

export function addFluxStroke(
  doc: MapDoc,
  color: FluxColor,
  points: readonly LonLat[],
  width: number,
  id: string = uid(),
): Added | null {
  if (points.length < 2 || isFluxFull(doc)) return null;
  const traced = points.slice(0, MAX_PATH_POINTS).map(lonLat);
  if (lacksPathRoom(doc, traced.length)) return null;
  const stroke: FluxStroke = {
    id,
    points: traced,
    width: clamp(width, FLUX_WIDTH_MIN, FLUX_WIDTH_MAX),
    opacity: DEFAULT_FLUX_OPACITY,
  };
  return { doc: { ...doc, flux: { ...doc.flux, [color]: [...(doc.flux[color] ?? []), stroke] } }, id };
}

type FicheRecord = Link | Ping | MapPoint | Zone | MapText;
const COLLECTION = { l: "links", p: "pings", o: "points", z: "zones", t: "texts" } as const;

/** Élément d'une fiche (lien, balise, point, zone, texte), ou undefined s'il n'existe pas. */
export function findFiche(doc: MapDoc, k: FicheKind, id: string): FicheRecord | undefined {
  const items: readonly FicheRecord[] = doc[COLLECTION[k]];
  return items.find((x) => x.id === id);
}

/** Ne garde que les champs renseignés (une clé à undefined n'efface pas le champ), coupés aux bornes du schéma. */
function definedFields(fields: FicheFields): FicheFields {
  const out: FicheFields = {};
  if (fields.title !== undefined) out.title = cut(fields.title, MAX_TITLE_LENGTH);
  if (fields.note !== undefined) out.note = cut(fields.note, MAX_NOTE_LENGTH);
  if (fields.date !== undefined) out.date = cut(fields.date, MAX_DATE_LENGTH);
  return out;
}

function patchById<T extends { id: string }>(items: T[], id: string, patch: (item: T) => T): T[] {
  return items.map((x) => (x.id === id ? patch(x) : x));
}

/** Met à jour le titre, les notes ou la date d'un lien, d'une balise, d'un point, d'une zone ou d'un texte. */
export function updateFiche(doc: MapDoc, k: FicheKind, id: string, fields: FicheFields): MapDoc {
  if (!findFiche(doc, k, id)) return doc;
  const set = definedFields(fields);
  const patch = <T extends FicheRecord>(x: T): T => ({ ...x, ...set });
  if (k === "l") return { ...doc, links: patchById(doc.links, id, patch) };
  if (k === "p") return { ...doc, pings: patchById(doc.pings, id, patch) };
  if (k === "o") return { ...doc, points: patchById(doc.points, id, patch) };
  if (k === "z") return { ...doc, zones: patchById(doc.zones, id, patch) };
  return { ...doc, texts: patchById(doc.texts, id, patch) };
}

export function setPingType(doc: MapDoc, id: string, type: PingType): MapDoc {
  if (!doc.pings.some((p) => p.id === id)) return doc;
  return { ...doc, pings: patchById(doc.pings, id, (p) => ({ ...p, type })) };
}

function setOrDelete(record: Record<string, string>, key: string, value: string): Record<string, string> {
  const next = { ...record };
  if (value) next[key] = value;
  else delete next[key];
  return next;
}

/** Notes d'un pays ; la clé est supprimée si le texte est vide (comme la bêta). Code inconnu : rien ne change. */
export function setCountryNote(doc: MapDoc, code: string, note: string): MapDoc {
  if (!countryByCode.has(code)) return doc;
  return { ...doc, notes: setOrDelete(doc.notes, code, cut(note, MAX_NOTE_LENGTH)) };
}

/** Date d'un pays ; la clé est supprimée si la date est vide. Code inconnu : rien ne change. */
export function setCountryDate(doc: MapDoc, code: string, date: string): MapDoc {
  if (!countryByCode.has(code)) return doc;
  return { ...doc, dates: setOrDelete(doc.dates, code, cut(date, MAX_DATE_LENGTH)) };
}

/** Trait de flux et sa couleur (clé de `flux` qui le contient). */
export function findFlux(doc: MapDoc, id: string): { color: FluxColor; stroke: FluxStroke } | null {
  for (const color of FLUX_COLOR_IDS) {
    const stroke = doc.flux[color]?.find((s) => s.id === id);
    if (stroke) return { color, stroke };
  }
  return null;
}

/** Fiche technique partagée par tous les traits d'une couleur. */
export function updateFluxFiche(doc: MapDoc, color: FluxColor, fields: FicheFields): MapDoc {
  const fiche: FluxFiche = { ...doc.fluxFiches[color], ...definedFields(fields) };
  return { ...doc, fluxFiches: { ...doc.fluxFiches, [color]: fiche } };
}

/** Vrai si l'élément désigné existe (pays connu, ou élément présent dans le document). */
export function entityExists(doc: MapDoc, k: EntityKind, id: string): boolean {
  if (k === "c") return countryByCode.has(id);
  if (k === "flux") return findFlux(doc, id) !== null;
  return findFiche(doc, k, id) !== undefined;
}

export function removeFluxStroke(doc: MapDoc, id: string): MapDoc {
  const found = findFlux(doc, id);
  if (!found) return doc;
  const strokes = (doc.flux[found.color] ?? []).filter((s) => s.id !== id);
  return { ...doc, flux: { ...doc.flux, [found.color]: strokes } };
}

/**
 * Gomme : supprime un lien, une balise, un point, une zone, un texte ou un trait de flux.
 * Les liens rattachés à l'élément supprimé disparaissent avec lui. Les pays ne sont pas concernés.
 */
export function erase(doc: MapDoc, k: EntityKind, id: string): MapDoc {
  if (k === "c") return doc;
  if (k === "flux") return removeFluxStroke(doc, id);
  if (k === "l") return { ...doc, links: doc.links.filter((x) => x.id !== id) };
  const ref = makeRef(k, id);
  const links = doc.links.filter((l) => l.a !== ref && l.b !== ref);
  if (k === "p") return { ...doc, pings: doc.pings.filter((x) => x.id !== id), links };
  if (k === "o") return { ...doc, points: doc.points.filter((x) => x.id !== id), links };
  if (k === "z") return { ...doc, zones: doc.zones.filter((x) => x.id !== id), links };
  return { ...doc, texts: doc.texts.filter((x) => x.id !== id), links };
}

/** Vrai si la carte contient quelque chose (proposition d'enregistrement dans la banque). */
export function hasContent(doc: MapDoc): boolean {
  return (
    Object.keys(doc.notes).length > 0 ||
    Object.keys(doc.dates).length > 0 ||
    doc.links.length > 0 ||
    doc.pings.length > 0 ||
    doc.points.length > 0 ||
    doc.zones.length > 0 ||
    doc.texts.length > 0 ||
    fluxCount(doc) > 0
  );
}

/** Résumé affiché dans la banque (texte de la bêta). */
/** Nombre d'éléments affichés dans la banque (la base des comptes les tient aussi à jour). */
export type MapStats = { notes: number; links: number; pings: number; zones: number; texts: number };

export function countsOf(doc: MapDoc): MapStats {
  return {
    notes: Object.keys(doc.notes).length,
    links: doc.links.length,
    pings: doc.pings.length,
    zones: doc.zones.length,
    texts: doc.texts.length,
  };
}

export function formatStats({ notes, links, pings, zones, texts }: MapStats): string {
  return `${notes} pays annotés · ${links} liens · ${pings} balises · ${zones} zones · ${texts} textes`;
}

export function statsOf(doc: MapDoc): string {
  return formatStats(countsOf(doc));
}

/** Liens attachés à une extrémité, avec l'autre extrémité de chacun. */
export function relationsOf(doc: MapDoc, ref: Ref): { link: Link; other: Ref }[] {
  return doc.links
    .filter((l) => l.a === ref || l.b === ref)
    .map((link) => ({ link, other: link.a === ref ? link.b : link.a }));
}
