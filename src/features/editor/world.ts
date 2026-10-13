// Fond de carte : géométries world-atlas (chargées par fetch) associées aux entités de countries.ts.
import { geoCentroid } from "d3";
import type { Feature, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { COUNTRIES, STATUS_LABELS, countryByCode, countryByTopo, countryLabel } from "@/data/countries";
import type { Country } from "@/data/countries";
import type { LonLat } from "@/lib/geo";

export const WORLD_URL = "/data/countries-50m.json";

type ShapeProps = { name: string };
export type WorldTopology = Topology<{ countries: GeometryCollection<ShapeProps> }>;
export type CountryFeature = Feature<Geometry, ShapeProps>;

/** Une géométrie du fond de carte ; `country` est null si aucune entité ne lui correspond. */
export type CountryShape = { name: string; country: Country | null; feature: CountryFeature };

export type World = {
  shapes: CountryShape[];
  /** Fichier source (arcs partagés) : sert aux niveaux de détail du globe (globeDetail.ts). */
  topology: WorldTopology;
  /** Géométrie de chaque entité qui en a une, par code. */
  featureByCode: ReadonlyMap<string, CountryFeature>;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Contrôle minimal de la forme du fichier avant de le confier à topojson. */
export function isWorldTopology(v: unknown): v is WorldTopology {
  if (!isRecord(v) || v.type !== "Topology" || !Array.isArray(v.arcs) || !isRecord(v.objects)) return false;
  const countries = v.objects.countries;
  return isRecord(countries) && countries.type === "GeometryCollection" && Array.isArray(countries.geometries);
}

/** Associe chaque géométrie à son entité par properties.name. */
export function buildWorld(topology: WorldTopology): World {
  const shapes = feature(topology, topology.objects.countries).features.map(
    (f): CountryShape => ({ name: f.properties.name, country: countryByTopo.get(f.properties.name) ?? null, feature: f }),
  );
  const featureByCode = new Map<string, CountryFeature>();
  for (const s of shapes) if (s.country) featureByCode.set(s.country.code, s.feature);
  return { shapes, featureByCode, topology };
}

let loaded: World | null = null;

/** Fond de carte déjà chargé (retour sur l'éditeur sans recharger la page), sinon null. */
export const loadedWorld = (): World | null => loaded;

export async function loadWorld(signal?: AbortSignal): Promise<World> {
  if (loaded) return loaded;
  const res = await fetch(WORLD_URL, { signal });
  if (!res.ok) throw new Error(`Fond de carte indisponible (${res.status})`);
  const json: unknown = await res.json();
  if (!isWorldTopology(json)) throw new Error("Fond de carte illisible");
  loaded = buildWorld(json);
  return loaded;
}

/** Point d'ancrage d'une entité (liens) : première capitale, sinon centroïde de sa géométrie. */
export function countryAnchorFor(world: World): (code: string) => LonLat | null {
  return (code) => {
    const country = countryByCode.get(code);
    if (!country) return null;
    if (country.capitals.length > 0) return country.capitals[0].ll;
    const f = world.featureByCode.get(code);
    if (!f) return null;
    const [lon, lat] = geoCentroid(f);
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
  };
}

/** Infobulle d'un pays ou d'une capitale : « Nom, Capitale / Capitale », sinon « Nom — statut ». */
export function hoverLabel(country: Country): string {
  return country.capitals.length > 0 ? countryLabel(country) : `${country.name} — ${STATUS_LABELS[country.status]}`;
}

export type CapitalMark = { key: string; code: string; name: string; ll: LonLat };

/** Toutes les capitales de toutes les entités (y compris celles sans géométrie : Tuvalu, Abkhazie…). */
export const CAPITAL_MARKS: readonly CapitalMark[] = COUNTRIES.flatMap((c) =>
  c.capitals.map((cap, i) => ({ key: `${c.code}-${i}`, code: c.code, name: cap.name, ll: cap.ll })),
);
