// Validation stricte d'un document importé (fichier, brouillon, banque), compatible avec les exports
// de la bêta : on reprend normalize() (champs manquants, liens "FRA" → "c:FRA") et on rejette le reste.
import { z } from "@/lib/zod";
import { countryByCode } from "@/data/countries";
import { normalizeRing } from "./geometry";
import { itemCount, pathPointCount } from "./limits";
import { makeRef, refChecker } from "./refs";
import {
  DEFAULT_FLUX_COLOR,
  DEFAULT_PING_TYPE,
  FLUX_COLOR_IDS,
  FLUX_WIDTH_MAX,
  FLUX_WIDTH_MIN,
  ID_PATTERN,
  MAX_DATE_LENGTH,
  MAX_ITEMS,
  MAX_NOTE_LENGTH,
  MAX_PATH_POINTS,
  MAX_TITLE_LENGTH,
  MAX_TOTAL_ITEMS,
  MAX_TOTAL_PATH_POINTS,
  PING_TYPES,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
} from "./types";
import type { FluxColor, FluxFiche, FluxStroke, LonLat, MapDoc, Ref } from "./types";

export { MAX_ITEMS, MAX_PATH_POINTS, MAX_TOTAL_ITEMS, MAX_TOTAL_PATH_POINTS };

const id = z.string().regex(ID_PATTERN);
const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const title = z.string().max(MAX_TITLE_LENGTH);
const note = z.string().max(MAX_NOTE_LENGTH);
const date = z.string().max(MAX_DATE_LENGTH);
const countryCode = z.string().refine((code) => countryByCode.has(code), "Code pays inconnu");
// Une référence est vérifiée après normalisation (existence de l'élément visé).
const rawRef = z.string().max(80);

const fiche = { title: title.optional(), note: note.optional(), date: date.optional() };

const linkInput = z.object({ id, a: rawRef, b: rawRef, ...fiche });
const pingInput = z.object({ id, ll: lonLat, type: z.enum(PING_TYPES).optional(), ...fiche });
const pointInput = z.object({ id, ll: lonLat, ...fiche });
const zoneInput = z.object({ id, ring: z.array(lonLat).min(4).max(MAX_PATH_POINTS), ...fiche });
const textInput = z.object({ id, ll: lonLat, size: z.number().optional(), ...fiche });
const fluxInput = z.object({
  id,
  points: z.array(lonLat).min(2).max(MAX_PATH_POINTS),
  width: z.number().optional(),
  opacity: z.number().optional(),
});
const fluxColor = z.enum(FLUX_COLOR_IDS);

const list = <T extends z.ZodType>(item: T) => z.array(item).max(MAX_ITEMS);

export const mapDocInputSchema = z.object({
  notes: z.record(countryCode, note),
  dates: z.record(countryCode, date).nullish(),
  links: list(linkInput),
  pings: list(pingInput),
  points: list(pointInput).nullish(),
  zones: list(zoneInput),
  texts: list(textInput).nullish(),
  flux: z.partialRecord(fluxColor, list(fluxInput)).nullish(),
  fluxFiches: z.partialRecord(fluxColor, z.object(fiche)).nullish(),
});

export type MapDocInput = z.infer<typeof mapDocInputSchema>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Clé écrite par la bêta dans fluxFiches : sa saisie visait st.fluxFiches[trait.color], or ses traits
 * n'ont pas de propriété color. Toutes ses fiches de flux tombaient donc dans une même fiche "undefined".
 */
export const LEGACY_FLUX_FICHE_KEY = "undefined";

/**
 * Reporte la fiche "undefined" de la bêta sur chaque couleur tracée qui n'a pas encore de fiche
 * (sur "jaune", la couleur que la bêta affichait, s'il n'y a aucun trait). Les autres clés inconnues
 * restent rejetées par le schéma.
 */
function migrateLegacyFluxFiche(input: unknown): unknown {
  if (!isRecord(input) || !isRecord(input.fluxFiches)) return input;
  if (!Object.hasOwn(input.fluxFiches, LEGACY_FLUX_FICHE_KEY)) return input;
  const { [LEGACY_FLUX_FICHE_KEY]: legacy, ...fiches } = input.fluxFiches;
  const flux = isRecord(input.flux) ? input.flux : {};
  const drawn = FLUX_COLOR_IDS.filter((c) => {
    const strokes = Object.hasOwn(flux, c) ? flux[c] : undefined;
    return Array.isArray(strokes) && strokes.length > 0;
  });
  const targets: readonly FluxColor[] = drawn.length > 0 ? drawn : [DEFAULT_FLUX_COLOR];
  for (const color of targets) {
    if (!Object.hasOwn(fiches, color)) fiches[color] = legacy;
  }
  return { ...input, fluxFiches: fiches };
}

/**
 * Les nombres d'une carte sont arrondis au millionième (une dizaine de centimètres pour une
 * coordonnée). Sans cela, un nombre minuscule accepté par les bornes (1e-300) s'écrirait en toutes
 * lettres dans la base (jsonb : environ 300 chiffres) : la carte stockée y pèserait des dizaines de
 * fois la taille vérifiée par l'application. Après arrondi, chaque nombre s'écrit de la même façon
 * en JSON et dans la base.
 */
export const NUMBER_PRECISION = 1e6;
const round = (v: number) => Math.round(v * NUMBER_PRECISION) / NUMBER_PRECISION + 0;
const clamp = (v: number, min: number, max: number) => round(Math.min(max, Math.max(min, v)));
const ll = (p: readonly [number, number]): LonLat => [round(p[0]), round(p[1])];
const withDate = (d: string | undefined): { date?: string } => (d === undefined ? {} : { date: d });
const legacyRef = (ref: string): string => (ref.includes(":") ? ref : makeRef("c", ref));

/** Reprend normalize() de la bêta : complète les champs absents, sans muter l'entrée. */
function normalize(input: MapDocInput): MapDoc {
  const flux: MapDoc["flux"] = {};
  for (const color of FLUX_COLOR_IDS) {
    const strokes = input.flux?.[color];
    if (!strokes) continue;
    flux[color] = strokes.map((s): FluxStroke => ({
      id: s.id,
      points: s.points.map(ll),
      width: clamp(s.width ?? FLUX_WIDTH_MIN, FLUX_WIDTH_MIN, FLUX_WIDTH_MAX),
      ...(s.opacity === undefined ? {} : { opacity: clamp(s.opacity, 0, 1) }),
    }));
  }
  const fluxFiches: MapDoc["fluxFiches"] = {};
  for (const color of FLUX_COLOR_IDS) {
    const f = input.fluxFiches?.[color];
    if (!f) continue;
    const out: FluxFiche = {};
    if (f.title !== undefined) out.title = f.title;
    if (f.note !== undefined) out.note = f.note;
    if (f.date !== undefined) out.date = f.date;
    fluxFiches[color] = out;
  }
  return {
    notes: { ...input.notes },
    dates: { ...(input.dates ?? {}) },
    links: input.links.map((l) => ({
      id: l.id,
      // Le type Ref est garanti par la vérification qui suit la normalisation.
      a: legacyRef(l.a) as Ref,
      b: legacyRef(l.b) as Ref,
      title: l.title ?? "",
      note: l.note ?? "",
      ...withDate(l.date),
    })),
    pings: input.pings.map((p) => ({
      id: p.id,
      ll: ll(p.ll),
      type: p.type ?? DEFAULT_PING_TYPE,
      title: p.title ?? "",
      note: p.note ?? "",
      ...withDate(p.date),
    })),
    points: (input.points ?? []).map((p) => ({
      id: p.id,
      ll: ll(p.ll),
      title: p.title ?? "",
      note: p.note ?? "",
      ...withDate(p.date),
    })),
    zones: input.zones.map((zn) => ({
      id: zn.id,
      ring: normalizeRing(zn.ring.map(ll)),
      title: zn.title ?? "",
      note: zn.note ?? "",
      ...withDate(zn.date),
    })),
    texts: (input.texts ?? []).map((t) => ({
      id: t.id,
      ll: ll(t.ll),
      title: t.title ?? "",
      note: t.note ?? "",
      ...withDate(t.date),
      ...(t.size === undefined ? {} : { size: clamp(t.size, TEXT_SIZE_MIN, TEXT_SIZE_MAX) }),
    })),
    flux,
    fluxFiches,
  };
}

/** Problèmes de cohérence : identifiants en double, liens invalides ou vers des éléments absents. */
function problemsOf(doc: MapDoc): { path: (string | number)[]; message: string }[] {
  const problems: { path: (string | number)[]; message: string }[] = [];
  const unique = (key: string, ids: string[]) => {
    const seen = new Set<string>();
    ids.forEach((x, i) => {
      if (seen.has(x)) problems.push({ path: [key, i, "id"], message: `Identifiant en double : ${x}` });
      seen.add(x);
    });
  };
  unique("links", doc.links.map((x) => x.id));
  unique("pings", doc.pings.map((x) => x.id));
  unique("points", doc.points.map((x) => x.id));
  unique("zones", doc.zones.map((x) => x.id));
  unique("texts", doc.texts.map((x) => x.id));
  const fluxIds = Object.values(doc.flux).flatMap((strokes) => strokes.map((s) => s.id));
  unique("flux", fluxIds);
  // MAX_ITEMS vaut pour chaque couleur ET pour le total : sans ce plafond, 10 couleurs donneraient
  // 200 000 traits (autant d'éléments SVG, de quoi geler l'onglet).
  if (fluxIds.length > MAX_ITEMS) {
    problems.push({ path: ["flux"], message: `Plus de ${MAX_ITEMS} traits de flux au total` });
  }
  // Plafonds de toute la carte (mêmes bornes que les opérations de l'éditeur, ops.ts).
  if (itemCount(doc) > MAX_TOTAL_ITEMS) {
    problems.push({ path: [], message: `Plus de ${MAX_TOTAL_ITEMS} éléments au total` });
  }
  if (pathPointCount(doc) > MAX_TOTAL_PATH_POINTS) {
    problems.push({ path: [], message: `Plus de ${MAX_TOTAL_PATH_POINTS} sommets de zones et de flux au total` });
  }
  const exists = refChecker(doc);
  doc.links.forEach((l, i) => {
    for (const end of ["a", "b"] as const) {
      if (!exists(l[end])) {
        problems.push({ path: ["links", i, end], message: "Référence vers un élément absent" });
      }
    }
    if (l.a === l.b) problems.push({ path: ["links", i], message: "Un lien relie deux éléments distincts" });
  });
  return problems;
}

export const mapDocSchema = z.preprocess(migrateLegacyFluxFiche, mapDocInputSchema).transform((input, ctx): MapDoc => {
  const doc = normalize(input);
  const problems = problemsOf(doc);
  if (problems.length === 0) return doc;
  for (const p of problems) ctx.issues.push({ code: "custom", input, path: p.path, message: p.message });
  return z.NEVER;
});

/** Valide puis normalise un document ; null s'il n'est pas une carte Stratavault valide. */
export function parseMapDoc(json: unknown): MapDoc | null {
  const result = mapDocSchema.safeParse(json);
  return result.success ? result.data : null;
}

/** Comme parseMapDoc, à partir du texte d'un fichier. */
export function parseMapDocText(text: string): MapDoc | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  return parseMapDoc(json);
}

export function blankDoc(): MapDoc {
  return { notes: {}, dates: {}, links: [], pings: [], points: [], zones: [], texts: [], flux: {}, fluxFiches: {} };
}

