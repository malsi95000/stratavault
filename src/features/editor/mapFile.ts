// Export et import d'une carte sous forme de fichier JSON (bêta, lignes 869-881).
// Le format est celui de la bêta : un export de la bêta s'importe tel quel, et inversement.
import { parseMapDocText } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";

export const EXPORT_FILE_NAME = "stratavault-carte.json";
export const EXPORT_MIME_TYPE = "application/json";
/** Types acceptés par le sélecteur de fichier. */
export const IMPORT_ACCEPT = "application/json,.json";

/** Taille maximale d'un fichier importé : au-delà, il n'est même pas lu. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export const IMPORT_INVALID = "Fichier invalide : ce n’est pas une carte Stratavault.";
export const IMPORT_TOO_LARGE = "Fichier trop volumineux : la taille maximale est de 10 Mo.";
export const IMPORT_CONFIRM = "Remplacer la carte actuelle par le fichier importé ?";
export const EXPORT_TOO_LARGE =
  "Cette carte dépasse 10 Mo : le fichier exporté ne pourra pas être réimporté.";

/** Contenu du fichier exporté (JSON indenté d'un espace, comme la bêta). */
export function serializeMapDoc(doc: MapDoc): string {
  return JSON.stringify(doc, null, 1);
}

/** Fichier exporté, prêt à être téléchargé. */
export function exportBlob(doc: MapDoc): Blob {
  return new Blob([serializeMapDoc(doc)], { type: EXPORT_MIME_TYPE });
}

/** Ce qu'il faut d'un fichier pour l'importer (File, Blob). */
export type ReadableFile = Pick<Blob, "size" | "text">;

export type ImportResult = { ok: true; doc: MapDoc } | { ok: false; error: string };

/**
 * Lit et valide un fichier importé. Le fichier est refusé avant lecture s'il dépasse MAX_IMPORT_BYTES ;
 * un texte illisible, un JSON invalide ou un document qui n'est pas une carte donnent IMPORT_INVALID.
 */
export async function readMapFile(file: ReadableFile): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: IMPORT_TOO_LARGE };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: IMPORT_INVALID };
  }
  const doc = parseMapDocText(text);
  return doc ? { ok: true, doc } : { ok: false, error: IMPORT_INVALID };
}
