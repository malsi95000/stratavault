// Résumé lisible d'un élément de la carte collective, pour la file de modération : titre, notes,
// date et emplacement (position, extrémités d'un lien, nombre de sommets d'un tracé). Le contenu
// relu dans la base est revalidé (parseItemContent) : un contenu illisible est signalé comme tel,
// jamais affiché brut.
import { countryByCode } from "@/data/countries";
import type { LonLat, Ref } from "@/features/map-doc/types";
import { parseItemContent } from "./itemData";
import { ITEM_KIND_LABELS } from "./messages";
import type { ItemContent } from "./types";

export type ItemSummary = {
  kind: string;
  title: string;
  note: string;
  date: string | null;
  where: string;
};

const coord = (value: number, positive: string, negative: string) =>
  `${Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}° ${value < 0 ? negative : positive}`;

/** Position lisible : « 48,85° N, 2,35° E ». */
export const positionText = ([lon, lat]: LonLat) => `${coord(lat, "N", "S")}, ${coord(lon, "E", "O")}`;

/** Extrémité d'un lien : nom du pays, ou sorte de l'élément. */
function endText(ref: Ref): string {
  const [k, id] = [ref.slice(0, 1), ref.slice(2)];
  if (k === "c") return countryByCode.get(id)?.name ?? id;
  const kind = { p: "ping", o: "point", z: "zone", t: "text" }[k] as keyof typeof ITEM_KIND_LABELS | undefined;
  return kind ? `${ITEM_KIND_LABELS[kind].toLowerCase()} de l’auteur` : ref;
}

function whereOf(content: ItemContent): string {
  switch (content.kind) {
    case "ping":
    case "point":
    case "text":
      return positionText(content.data.ll);
    case "zone":
      return `Zone de ${content.data.ring.length - 1} sommets, autour de ${positionText(content.data.ring[0])}`;
    case "flux":
      return `Trait de ${content.data.points.length} points, depuis ${positionText(content.data.points[0])}`;
    case "link":
      return `${endText(content.data.a)} → ${endText(content.data.b)}`;
  }
}

/** Résumé d'un élément ; null si son contenu ne passe plus la validation. */
export function summarizeItem(kind: unknown, id: unknown, data: unknown): ItemSummary | null {
  const parsed = parseItemContent(kind, id, data);
  if (!parsed.ok) return null;
  const { content } = parsed;
  const fiche = "title" in content.data ? content.data : null;
  return {
    kind: ITEM_KIND_LABELS[content.kind],
    title: fiche?.title ?? "",
    note: fiche?.note ?? "",
    date: fiche?.date ?? null,
    where: whereOf(content),
  };
}
