import { readFileSync } from "node:fs";
import { geoContains, geoDistance } from "d3";
import type { Feature, Geometry, Position } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { describe, expect, it } from "vitest";
import type { LonLat } from "@/lib/geo";
import { COUNTRIES, STATUS_LABELS, countryByCode, countryByTopo } from "./countries";

type Props = { name: string };

const topo = JSON.parse(
  readFileSync(new URL("../../public/data/countries-50m.json", import.meta.url), "utf8"),
) as Topology<{ countries: GeometryCollection<Props> }>;
const features: Feature<Geometry, Props>[] = feature(topo, topo.objects.countries).features;
const featureByName = new Map(features.map((f) => [f.properties.name, f]));

// Les 195 entrées de la bêta 1.8 (193 membres de l'ONU + Vatican + Palestine).
const BETA_CODES = (
  "AFG AGO ALB AND ARE ARG ARM ATG AUS AUT AZE BDI BEL BEN BFA BGD BGR BHR BHS BIH BLR BLZ BOL BRA BRB BRN " +
  "BTN BWA CAF CAN CHE CHL CHN CIV CMR COD COG COL COM CPV CRI CUB CYP CZE DEU DJI DMA DNK DOM DZA ECU EGY " +
  "ERI ESP EST ETH FIN FJI FRA FSM GAB GBR GEO GHA GIN GMB GNB GNQ GRC GRD GTM GUY HND HRV HTI HUN IDN IND " +
  "IRL IRN IRQ ISL ISR ITA JAM JOR JPN KAZ KEN KGZ KHM KIR KNA KOR KWT LAO LBN LBR LBY LCA LIE LKA LSO LTU " +
  "LUX LVA MAR MCO MDA MDG MDV MEX MHL MKD MLI MLT MMR MNE MNG MOZ MRT MUS MWI MYS NAM NER NGA NIC NLD NOR " +
  "NPL NRU NZL OMN PAK PAN PER PHL PLW PNG POL PRK PRT PRY PSE QAT ROU RUS RWA SAU SDN SEN SGP SLB SLE SLV " +
  "SMR SOM SRB SSD STP SUR SVK SVN SWE SWZ SYC SYR TCD TGO THA TJK TKM TLS TON TTO TUN TUR TUV TZA UGA UKR " +
  "URY USA UZB VAT VCT VEN VNM VUT WSM YEM ZAF ZMB ZWE"
).split(" ");

// Capitales hors de la géométrie 50m pour des raisons de données (et non d'inversion lat/lon) :
// la limite reste serrée pour continuer à détecter une coordonnée aberrante.
const GEOMETRY_GAPS: Record<string, { km: number; reason: string }> = {
  ESH: { km: 250, reason: "Natural Earth rattache la région de Laâyoune au polygone du Maroc" },
  PCN: { km: 250, reason: "la géométrie 50m ne contient que l'île Henderson, pas l'île Pitcairn" },
};

const EARTH_KM = 6371;

function distanceKm(geometry: Geometry, ll: LonLat): number {
  let min = Infinity;
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      min = Math.min(min, geoDistance(coords as Position as [number, number], ll) * EARTH_KM);
      return;
    }
    coords.forEach(walk);
  };
  if (geometry.type !== "GeometryCollection") walk(geometry.coordinates);
  return min;
}

describe("données pays", () => {
  it("associe chacune des 241 géométries à exactement une entité", () => {
    expect(features).toHaveLength(241);
    for (const f of features) {
      const owners = COUNTRIES.filter((c) => c.topo === f.properties.name);
      expect(owners, f.properties.name).toHaveLength(1);
    }
    for (const c of COUNTRIES) {
      if (c.topo !== null) expect(featureByName.has(c.topo), `${c.code} → ${c.topo}`).toBe(true);
    }
  });

  it("a des codes et des géométries uniques", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    const topos = COUNTRIES.flatMap((c) => (c.topo === null ? [] : [c.topo]));
    expect(new Set(topos).size).toBe(topos.length);
    expect(countryByCode.size).toBe(COUNTRIES.length);
    expect(countryByTopo.size).toBe(topos.length);
  });

  it("conserve les 195 codes de la bêta", () => {
    expect(BETA_CODES).toHaveLength(195);
    for (const code of BETA_CODES) expect(countryByCode.has(code), code).toBe(true);
  });

  it("contient les entités ajoutées", () => {
    const required = [
      "TWN", "XKX", "ESH", "XSO", "XNC", "GRL", "HKG", "MAC", "NCL", "PYF",
      "FLK", "ATA", "TUV", "XAB", "XOS", "XTR",
    ];
    for (const code of required) expect(countryByCode.has(code), code).toBe(true);
  });

  it("a des capitales aux coordonnées valides [lon, lat]", () => {
    for (const c of COUNTRIES) {
      for (const cap of c.capitals) {
        const [lon, lat] = cap.ll;
        expect(cap.ll, `${c.code} ${cap.name}`).toHaveLength(2);
        expect(lon >= -180 && lon <= 180, `${c.code} ${cap.name} lon`).toBe(true);
        expect(lat >= -90 && lat <= 90, `${c.code} ${cap.name} lat`).toBe(true);
        expect(cap.name.trim()).not.toBe("");
      }
    }
  });

  it("place chaque capitale dans sa géométrie ou à moins de 100 km", () => {
    for (const c of COUNTRIES) {
      if (c.topo === null) continue;
      const f = featureByName.get(c.topo);
      if (!f) throw new Error(`géométrie absente : ${c.topo}`);
      const limit = GEOMETRY_GAPS[c.code]?.km ?? 100;
      for (const cap of c.capitals) {
        if (geoContains(f, cap.ll)) continue;
        const km = distanceKm(f.geometry, cap.ll);
        expect(km, `${c.code} ${cap.name} à ${km.toFixed(1)} km`).toBeLessThan(limit);
      }
    }
  });

  it("documente seulement des écarts réels", () => {
    for (const code of Object.keys(GEOMETRY_GAPS)) {
      const c = countryByCode.get(code);
      const f = c?.topo ? featureByName.get(c.topo) : undefined;
      expect(f, code).toBeDefined();
      if (!c || !f) continue;
      expect(c.capitals.some((cap) => !geoContains(f, cap.ll) && distanceKm(f.geometry, cap.ll) >= 100)).toBe(true);
    }
  });

  it("donne au moins une capitale aux entités sans géométrie", () => {
    for (const c of COUNTRIES) {
      if (c.topo === null) expect(c.capitals.length, c.code).toBeGreaterThan(0);
    }
  });

  it("relie chaque territoire à un souverain existant", () => {
    for (const c of COUNTRIES) {
      if (c.sovereign !== undefined) {
        expect(c.sovereign).not.toBe(c.code);
        expect(countryByCode.has(c.sovereign), `${c.code} → ${c.sovereign}`).toBe(true);
      }
      if (c.status === "territoire") expect(c.sovereign, c.code).toBeDefined();
    }
  });

  it("a un libellé pour chaque statut utilisé", () => {
    for (const c of COUNTRIES) expect(STATUS_LABELS[c.status], c.code).toBeTruthy();
  });

  it("a des noms français non vides", () => {
    for (const c of COUNTRIES) expect(c.name.trim(), c.code).not.toBe("");
  });

  it("utilise les noms français usuels actuels (codes inchangés)", () => {
    const expected: Record<string, string> = {
      SWZ: "Eswatini",
      CPV: "Cap-Vert",
      STP: "Sao Tomé-et-Principe",
      SUR: "Suriname",
      SAU: "Arabie saoudite",
      PLW: "Palaos",
    };
    for (const [code, name] of Object.entries(expected)) expect(countryByCode.get(code)?.name, code).toBe(name);
    expect(countryByCode.get("MDA")?.capitals.map((c) => c.name)).toEqual(["Chisinau"]);
    expect(countryByCode.get("PRY")?.capitals.map((c) => c.name)).toEqual(["Asuncion"]);
    expect(countryByCode.get("SWZ")?.capitals.map((c) => c.name)).toEqual(["Lobamba", "Mbabane"]);
    const outdated = ["Swaziland", "Surinam", "Îles du Cap-Vert", "Palaos (Palau)", "Arabie Saoudite"];
    for (const c of COUNTRIES) expect(outdated, c.code).not.toContain(c.name);
  });
});
