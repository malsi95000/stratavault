// Contenu d'un élément de la carte collective : validation et forme canonique. Mêmes règles que la
// base (public.collective_item_data_ok, supabase/migrations/20261020120000_collective_map.sql),
// vérifiées par les tests : clés exactes de chaque sorte, coordonnées dans les bornes (arrondies au
// millionième), 1 000 sommets au plus par tracé, titre de 200 caractères et notes de 2 000 au plus,
// sans caractère de contrôle ni marque de sens de lecture, date « AAAA-MM-JJ ».
//
// La forme canonique (clés toujours dans le même ordre, date vide retirée, nombres arrondis) sert à
// la fois à l'envoi et à la comparaison : un élément de l'éditeur et sa copie relue dans la base ont
// le même texte JSON tant qu'ils ne diffèrent pas.
import { countryByCode } from "@/data/countries";
import { FLUX_COLOR_IDS, FLUX_WIDTH_MAX, FLUX_WIDTH_MIN, ID_PATTERN, PING_TYPES, TEXT_SIZE_MAX, TEXT_SIZE_MIN } from "@/features/map-doc/types";
import type { FluxColor, FluxStroke, Link, LonLat, MapPoint, MapText, Ping, Ref, Zone } from "@/features/map-doc/types";
import { z } from "@/lib/zod";
import { MAX_ITEM_BYTES, MAX_ITEM_NOTE, MAX_ITEM_PATH_POINTS, MAX_ITEM_TITLE } from "./limits";
import type { FluxData, ItemContent, ItemDataOf, ItemKind, LinkData, PingData, PointData, TextData, ZoneData } from "./types";

/** Pourquoi un contenu est refusé (message dans la barre d'aide : messages.ts). */
export type ItemProblem = "title-too-long" | "note-too-long" | "forbidden-chars" | "bad-date" | "path-too-long" | "too-large" | "invalid";

/** Caractères de contrôle, et sans le retour à la ligne ni la tabulation (notes). */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const CONTROL_MULTILINE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;
/** Marques de sens de lecture (enchâssement, forçage, isolement) : elles retournent un texte affiché. */
const BIDI = /[‪-‮⁦-⁩]/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^(c:[A-Z]{3}|[pozt]:[A-Za-z0-9_-]{1,64})$/;

/** Nombre de caractères (points de code), comme char_length de PostgreSQL. */
const charCount = (value: string) => [...value].length;

/** Problème d'un texte d'au plus `max` caractères (`multiline` : notes). */
export function textProblem(value: string, max: number, multiline: boolean): "too-long" | "forbidden-chars" | null {
  if (charCount(value) > max) return "too-long";
  if (BIDI.test(value) || (multiline ? CONTROL_MULTILINE : CONTROL).test(value)) return "forbidden-chars";
  return null;
}

const PRECISION = 1e6;
const round = (v: number) => Math.round(v * PRECISION) / PRECISION + 0;
const ll = (p: readonly [number, number]): LonLat => [round(p[0]), round(p[1])];

// Schémas d'entrée (Server Actions, et contenu relu dans la base) : formes et bornes numériques.
// Les textes sont bornés large ici (unités UTF-16) puis vérifiés en caractères par textProblem.
const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const path = (min: number) => z.array(lonLat).min(min).max(MAX_ITEM_PATH_POINTS);
const title = z.string().max(MAX_ITEM_TITLE * 2);
const note = z.string().max(MAX_ITEM_NOTE * 2);
const date = z.string().regex(DATE).optional();
const ref = z.string().max(66).regex(REF);
const fiche = { title, note, date };

const DATA_SCHEMAS = {
  ping: z.strictObject({ ll: lonLat, type: z.enum(PING_TYPES), ...fiche }),
  point: z.strictObject({ ll: lonLat, ...fiche }),
  text: z.strictObject({ ll: lonLat, size: z.number().min(TEXT_SIZE_MIN).max(TEXT_SIZE_MAX).optional(), ...fiche }),
  zone: z.strictObject({ ring: path(4), ...fiche }),
  link: z.strictObject({ a: ref, b: ref, ...fiche }),
  flux: z.strictObject({
    color: z.enum(FLUX_COLOR_IDS),
    points: path(2),
    width: z.number().min(FLUX_WIDTH_MIN).max(FLUX_WIDTH_MAX),
    opacity: z.number().min(0).max(1).optional(),
  }),
} as const;

const withDate = (d: string | undefined): { date?: string } => (d ? { date: d } : {});
const ficheOf = (f: { title: string; note: string; date?: string }) => ({ title: f.title, note: f.note, ...withDate(f.date) });

/** Contenu canonique (ordre des clés fixe, date vide retirée, nombres arrondis). */
const CANONICAL: { [K in ItemKind]: (data: ItemDataOf[K]) => ItemDataOf[K] } = {
  ping: (d): PingData => ({ ll: ll(d.ll), type: d.type, ...ficheOf(d) }),
  point: (d): PointData => ({ ll: ll(d.ll), ...ficheOf(d) }),
  text: (d): TextData => ({ ll: ll(d.ll), ...ficheOf(d), ...(d.size === undefined ? {} : { size: round(d.size) }) }),
  zone: (d): ZoneData => ({ ring: d.ring.map(ll), ...ficheOf(d) }),
  link: (d): LinkData => ({ a: d.a, b: d.b, ...ficheOf(d) }),
  flux: (d): FluxData => ({
    color: d.color,
    points: d.points.map(ll),
    width: round(d.width),
    ...(d.opacity === undefined ? {} : { opacity: round(d.opacity) }),
  }),
};

export function canonicalContent(content: ItemContent): ItemContent {
  // La sorte et le contenu vont ensemble (ItemContent) : la table CANONICAL est indexée par sorte.
  const canonical = CANONICAL[content.kind] as (data: ItemContent["data"]) => ItemContent["data"];
  return { kind: content.kind, id: content.id, data: canonical(content.data) } as ItemContent;
}

/** Texte JSON compact du contenu, tel qu'il est envoyé et comparé. */
export const contentJson = (content: ItemContent) => JSON.stringify(content.data);

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** Problème d'un contenu canonique (règles de la base), ou null. */
export function contentProblem(content: ItemContent): ItemProblem | null {
  if (!ID_PATTERN.test(content.id)) return "invalid";
  const { data } = content;
  if ("title" in data) {
    const titleProblem = textProblem(data.title, MAX_ITEM_TITLE, false);
    if (titleProblem) return titleProblem === "too-long" ? "title-too-long" : titleProblem;
    const noteProblem = textProblem(data.note, MAX_ITEM_NOTE, true);
    if (noteProblem) return noteProblem === "too-long" ? "note-too-long" : noteProblem;
    if (data.date !== undefined && !DATE.test(data.date)) return "bad-date";
  }
  if (content.kind === "zone") {
    const { ring } = content.data;
    if (ring.length > MAX_ITEM_PATH_POINTS) return "path-too-long";
    const [first, last] = [ring[0], ring.at(-1)];
    if (ring.length < 4 || !first || !last || first[0] !== last[0] || first[1] !== last[1]) return "invalid";
  }
  if (content.kind === "flux" && content.data.points.length > MAX_ITEM_PATH_POINTS) return "path-too-long";
  if (content.kind === "link") {
    const { a, b } = content.data;
    if (a === b || !REF.test(a) || !REF.test(b)) return "invalid";
    for (const end of [a, b]) if (end.startsWith("c:") && !countryByCode.has(end.slice(2))) return "invalid";
  }
  if (byteLength(contentJson(content)) > MAX_ITEM_BYTES) return "too-large";
  return null;
}

export type ParsedContent = { ok: true; content: ItemContent } | { ok: false; problem: ItemProblem };

/**
 * Valide un élément reçu (Server Action) ou relu dans la base : sorte connue, identifiant, contenu
 * exact de sa sorte et règles de la base ; renvoie sa forme canonique.
 */
export function parseItemContent(kind: unknown, id: unknown, data: unknown): ParsedContent {
  if (typeof kind !== "string" || !Object.hasOwn(DATA_SCHEMAS, kind)) return { ok: false, problem: "invalid" };
  if (typeof id !== "string" || !ID_PATTERN.test(id)) return { ok: false, problem: "invalid" };
  const itemKind = kind as ItemKind;
  const parsed = DATA_SCHEMAS[itemKind].safeParse(data);
  if (!parsed.success) {
    const pathTooLong = parsed.error.issues.some(
      (issue) => issue.code === "too_big" && issue.path.length === 1 && (issue.path[0] === "ring" || issue.path[0] === "points"),
    );
    return { ok: false, problem: pathTooLong ? "path-too-long" : "invalid" };
  }
  const content = canonicalContent({ kind: itemKind, id, data: parsed.data } as ItemContent);
  const problem = contentProblem(content);
  return problem ? { ok: false, problem } : { ok: true, content };
}

// Éléments de l'éditeur vers le contenu d'un élément (forme canonique).

export const pingContent = (p: Ping): ItemContent =>
  canonicalContent({ kind: "ping", id: p.id, data: { ll: p.ll, type: p.type, title: p.title, note: p.note, ...withDate(p.date) } });
export const pointContent = (p: MapPoint): ItemContent =>
  canonicalContent({ kind: "point", id: p.id, data: { ll: p.ll, title: p.title, note: p.note, ...withDate(p.date) } });
export const textContent = (t: MapText): ItemContent =>
  canonicalContent({
    kind: "text",
    id: t.id,
    data: { ll: t.ll, title: t.title, note: t.note, ...withDate(t.date), ...(t.size === undefined ? {} : { size: t.size }) },
  });
export const zoneContent = (zn: Zone): ItemContent =>
  canonicalContent({ kind: "zone", id: zn.id, data: { ring: zn.ring, title: zn.title, note: zn.note, ...withDate(zn.date) } });
export const linkContent = (l: Link): ItemContent =>
  canonicalContent({ kind: "link", id: l.id, data: { a: l.a, b: l.b, title: l.title, note: l.note, ...withDate(l.date) } });
export const fluxContent = (color: FluxColor, s: FluxStroke): ItemContent =>
  canonicalContent({
    kind: "flux",
    id: s.id,
    data: { color, points: s.points, width: s.width, ...(s.opacity === undefined ? {} : { opacity: s.opacity }) },
  });

/** Extrémités d'un lien qui sont des éléments (pas des pays). */
export const elementEnds = (data: { a: Ref; b: Ref }): Ref[] => [data.a, data.b].filter((end) => !end.startsWith("c:"));
