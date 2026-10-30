// Règles d'édition de la carte collective (posées dans l'éditeur par la session) : chacun ajoute ses
// éléments, ne modifie et ne supprime que les siens, et un lien ne vise qu'un pays ou l'un de ses
// propres éléments. Un compte suspendu ou sans profil peut seulement supprimer les siens. La base applique les mêmes règles (supabase/migrations/20261020120000_collective_map.sql) :
// celles-ci évitent seulement d'envoyer ce qui serait refusé, et disent pourquoi.
import type { EditRules } from "@/features/editor/store";
import type { EntityKind, MapDoc } from "@/features/map-doc/types";
import { contentsOf, entityKey, hasOnlyItems, refKey } from "./compose";
import { changedElements } from "./diff";
import { contentProblem, elementEnds } from "./itemData";
import { MAX_ITEMS_PER_AUTHOR } from "./limits";
import {
  HINT_AUTHOR_FULL,
  HINT_DELETE_ONLY,
  HINT_LINK_FOREIGN,
  HINT_NOT_YOURS,
  HINT_UNSUPPORTED,
  problemHint,
} from "./messages";

/** Ce que les règles savent des éléments : appartiennent-ils à un autre membre (clé connue de la base) ? */
export type Ownership = {
  /** Vrai si l'élément de clé `key` est celui d'un autre membre. */
  isForeign: (key: string) => boolean;
};

/** Nombre d'éléments du compte dans le document (ceux qui ne sont pas d'un autre membre). */
function ownCount(doc: MapDoc, ownership: Ownership): number {
  let count = 0;
  for (const key of contentsOf(doc).keys()) if (!ownership.isForeign(key)) count += 1;
  return count;
}

/**
 * Message de refus d'une modification de `prev` à `next`, ou null si elle respecte les règles.
 * `deleteOnly` : seules les suppressions de ses propres éléments sont acceptées.
 */
export function checkCollectiveEdit(prev: MapDoc, next: MapDoc, ownership: Ownership, deleteOnly = false): string | null {
  if (!hasOnlyItems(next)) return HINT_UNSUPPORTED;
  const changes = changedElements(prev, next);
  let added = 0;
  for (const change of changes) {
    if (change.before && ownership.isForeign(change.key)) return HINT_NOT_YOURS;
    if (!change.after) continue;
    if (deleteOnly) return HINT_DELETE_ONLY;
    if (!change.before) added += 1;
    const problem = contentProblem(change.after);
    if (problem) return problemHint(problem);
    if (change.after.kind === "link") {
      for (const end of elementEnds(change.after.data)) {
        const key = refKey(end);
        if (key && ownership.isForeign(key)) return HINT_LINK_FOREIGN;
      }
    }
  }
  if (added > 0 && ownCount(next, ownership) > MAX_ITEMS_PER_AUTHOR) return HINT_AUTHOR_FULL;
  return null;
}

/**
 * Règles de l'éditeur pour la carte collective. `deleteOnly` : contributions suspendues, ou compte
 * sans profil (il peut encore supprimer ses éléments).
 */
export function collectiveEditRules(ownership: Ownership, deleteOnly = false): EditRules {
  return {
    locked: (k: EntityKind, id: string) => {
      const key = entityKey(k, id);
      return key === null || ownership.isForeign(key);
    },
    check: (prev, next) => checkCollectiveEdit(prev, next, ownership, deleteOnly),
    extras: false,
    deleteOnly,
  };
}
