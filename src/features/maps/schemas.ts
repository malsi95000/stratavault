// Validation des entrées des Server Actions des cartes : rien de ce qui vient du navigateur
// n'est utilisé sans être revalidé ici.
import { parseMapDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import { MAX_MAP_NAME_LENGTH } from "@/features/storage/types";
import { z } from "@/lib/zod";
import { MAX_MAP_BYTES, jsonByteLength } from "./limits";

export const mapIdSchema = z.uuid();

export const mapNameSchema = z.string().trim().min(1).max(MAX_MAP_NAME_LENGTH);

/** Numéro de version du contenu d'une carte (colonne `revision`). */
export const mapRevisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export type ParsedMapData = { ok: true; doc: MapDoc } | { ok: false; error: "invalid" | "too-large" };

/** Valide et normalise une carte (parseMapDoc), puis vérifie sa taille une fois normalisée. */
export function parseMapData(data: unknown): ParsedMapData {
  const doc = parseMapDoc(data);
  if (!doc) return { ok: false, error: "invalid" };
  if (jsonByteLength(doc) > MAX_MAP_BYTES) return { ok: false, error: "too-large" };
  return { ok: true, doc };
}
