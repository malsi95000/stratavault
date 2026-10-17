// Données rattachées à un élément (format v2) : ses fiches supplémentaires et son style. Elles
// disparaissent avec lui (gomme, et liens supprimés en cascade).
import type { ElementRef, MapDoc } from "./types";

/** Retire les fiches supplémentaires et les styles des éléments `refs` ; même document si rien ne change. */
export function forgetElements(doc: MapDoc, refs: readonly ElementRef[]): MapDoc {
  const owned = refs.filter((ref) => Object.hasOwn(doc.fiches, ref) || Object.hasOwn(doc.styles, ref));
  if (owned.length === 0) return doc;
  const fiches = { ...doc.fiches };
  const styles = { ...doc.styles };
  for (const ref of owned) {
    delete fiches[ref];
    delete styles[ref];
  }
  return { ...doc, fiches, styles };
}
