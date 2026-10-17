// Aperçu d'une carte calculé dans le navigateur : le fond de carte de l'éditeur est chargé au besoin
// (une seule fois par page), puis la miniature SVG est construite (preview/previewSvg.ts).
import { loadWorld } from "@/features/editor/world";
import type { MapDoc } from "@/features/map-doc/types";
import { buildPreviewCover } from "../preview/previewSvg";
import { previewWorldOf } from "../preview/previewWorld";
import type { PreviewCover } from "./coverDraft";

/** Aperçu de `doc` ; null s'il ne peut pas être construit. Rejette si le fond de carte ne se charge pas. */
export async function generatePreview(doc: MapDoc, signal?: AbortSignal): Promise<PreviewCover | null> {
  const world = previewWorldOf(await loadWorld(signal));
  const cover = buildPreviewCover(doc, world);
  return cover?.kind === "preview" ? cover : null;
}
