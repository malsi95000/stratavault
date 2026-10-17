// Fiches supplémentaires d'un élément (format v2) : fonctions pures, le document d'entrée n'est
// jamais modifié. Les bornes sont celles du schéma (limits.ts, types.ts) : un document produit par
// l'éditeur se relit toujours.
import { isFicheFull } from "./limits";
import { isMapColor } from "./palette";
import { cut, uid } from "./primitives";
import type { Added } from "./primitives";
import { elementExists } from "./refs";
import { MAX_DATE_LENGTH, MAX_NOTE_LENGTH, MAX_TITLE_LENGTH } from "./types";
import type { ElementRef, ExtraFiche, MapColor, MapDoc } from "./types";

/**
 * Champs modifiables d'une fiche supplémentaire. Une clé absente (ou à undefined) ne change rien ;
 * `color` ou `category` à null les retire. Une couleur invalide ou une catégorie inconnue sont ignorées.
 */
export type ExtraFicheFields = {
  title?: string;
  note?: string;
  date?: string;
  color?: MapColor | null;
  category?: string | null;
};

/** Fiches supplémentaires d'un élément, dans l'ordre de création. */
export function extraFichesOf(doc: MapDoc, owner: ElementRef): readonly ExtraFiche[] {
  return doc.fiches[owner] ?? [];
}

export type FoundFiche = { owner: ElementRef; fiche: ExtraFiche };

/** Fiche supplémentaire d'identifiant `ficheId` (unique dans toute la carte) et l'élément qui la porte. */
export function findExtraFiche(doc: MapDoc, ficheId: string): FoundFiche | null {
  for (const [owner, list] of Object.entries(doc.fiches)) {
    const fiche = list?.find((f) => f.id === ficheId);
    if (fiche) return { owner: owner as ElementRef, fiche };
  }
  return null;
}

function applyFields(doc: MapDoc, fiche: ExtraFiche, fields: ExtraFicheFields): ExtraFiche {
  const next: ExtraFiche = { ...fiche };
  if (fields.title !== undefined) next.title = cut(fields.title, MAX_TITLE_LENGTH);
  if (fields.note !== undefined) next.note = cut(fields.note, MAX_NOTE_LENGTH);
  if (fields.date !== undefined) next.date = cut(fields.date, MAX_DATE_LENGTH);
  if (fields.color === null) delete next.color;
  else if (fields.color !== undefined && isMapColor(fields.color)) next.color = fields.color;
  if (fields.category === null) delete next.category;
  else if (fields.category !== undefined && doc.categories.some((c) => c.id === fields.category)) {
    next.category = fields.category;
  }
  return next;
}

function withFiches(doc: MapDoc, owner: ElementRef, list: ExtraFiche[]): MapDoc {
  const fiches = { ...doc.fiches };
  if (list.length > 0) fiches[owner] = list;
  else delete fiches[owner];
  return { ...doc, fiches };
}

/**
 * Ajoute une fiche supplémentaire à un élément existant (pays, lien, balise, point, zone, texte) ;
 * null si l'élément n'existe pas, si un plafond est atteint ou si l'identifiant est déjà pris.
 */
export function addExtraFiche(
  doc: MapDoc,
  owner: ElementRef,
  fields: ExtraFicheFields = {},
  id: string = uid(),
): Added | null {
  if (!elementExists(doc, owner) || isFicheFull(doc, owner) || findExtraFiche(doc, id)) return null;
  const fiche = applyFields(doc, { id, title: "", note: "" }, fields);
  return { doc: withFiches(doc, owner, [...extraFichesOf(doc, owner), fiche]), id };
}

/** Met à jour une fiche supplémentaire ; document inchangé si elle n'existe pas. */
export function updateExtraFiche(doc: MapDoc, ficheId: string, fields: ExtraFicheFields): MapDoc {
  const found = findExtraFiche(doc, ficheId);
  if (!found) return doc;
  const list = extraFichesOf(doc, found.owner).map((f) => (f.id === ficheId ? applyFields(doc, f, fields) : f));
  return withFiches(doc, found.owner, list);
}

/** Supprime une fiche supplémentaire (la clé de l'élément disparaît avec sa dernière fiche). */
export function removeExtraFiche(doc: MapDoc, ficheId: string): MapDoc {
  const found = findExtraFiche(doc, ficheId);
  if (!found) return doc;
  return withFiches(
    doc,
    found.owner,
    extraFichesOf(doc, found.owner).filter((f) => f.id !== ficheId),
  );
}
