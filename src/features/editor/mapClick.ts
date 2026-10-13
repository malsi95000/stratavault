// Clic sur la carte selon l'outil (bêta, lignes 785-806) : fonction pure qui décrit l'action à mener.
import { makeRef } from "@/features/map-doc/refs";
import type { EntityKind, Ref } from "@/features/map-doc/types";
import type { Tool } from "./hints";

/** Élément cliqué (attributs data-k et data-id), ou null pour un clic dans le vide. */
export type MapTarget = { k: EntityKind; id: string } | null;

export type MapClickAction =
  | { type: "none" }
  | { type: "open"; k: EntityKind; id: string }
  | { type: "close" }
  | { type: "pick"; ref: Ref }
  | { type: "cancelPending" }
  /** Pose d'une balise, d'un point ou d'un texte à l'endroit du clic. */
  | { type: "place"; tool: "ping" | "point" | "texte" }
  /** Gomme sur un élément (les pays sont refusés par le store). */
  | { type: "erase"; k: EntityKind; id: string };

const ENTITY_KINDS: readonly string[] = ["c", "l", "p", "o", "z", "t", "flux"] satisfies EntityKind[];
const isEntityKind = (k: string): k is EntityKind => ENTITY_KINDS.includes(k);

/** Lit les attributs data-k / data-id d'un élément cliquable ; null s'ils ne désignent rien de connu. */
export function toTarget(k: string | null | undefined, id: string | null | undefined): MapTarget {
  if (!k || !id || !isEntityKind(k)) return null;
  return { k, id };
}

export function routeMapClick(tool: Tool, target: MapTarget, pending: Ref | null): MapClickAction {
  // Lasso et pinceau : le glisser dessine (gestionnaires de pointeur), le clic ne fait rien.
  if (tool === "lasso" || tool === "flux") return { type: "none" };
  if (tool === "gomme") return target ? { type: "erase", k: target.k, id: target.id } : { type: "none" };
  if (tool === "link") {
    if (target && target.k !== "l" && target.k !== "flux") return { type: "pick", ref: makeRef(target.k, target.id) };
    if (target?.k === "l") return { type: "open", k: "l", id: target.id };
    return pending ? { type: "cancelPending" } : { type: "none" };
  }
  // Sélection, balise, point, texte : un élément existant (autre qu'un pays) ouvre sa fiche.
  if (target && target.k !== "c") return { type: "open", k: target.k, id: target.id };
  if (tool === "ping" || tool === "point" || tool === "texte") return { type: "place", tool };
  if (target) return { type: "open", k: "c", id: target.id };
  return { type: "close" };
}
