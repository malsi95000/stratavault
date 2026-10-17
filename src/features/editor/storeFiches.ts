// État de l'éditeur, partie « format v2 » : fiches supplémentaires, couleurs et catégories, panneau en
// plein écran et fenêtre des catégories. Combiné à store.ts ; les modifications du document passent par
// les fonctions pures de map-doc.
import { MAX_CATEGORIES, isFicheFull } from "@/features/map-doc/limits";
import * as ops from "@/features/map-doc/ops";
import type { ExtraFicheFields, StyleFields } from "@/features/map-doc/ops";
import { makeElementRef, parseElementRef } from "@/features/map-doc/refs";
import type { ElementRef, MapColor, MapDoc, Selection } from "@/features/map-doc/types";
import { HINT_CATEGORIES_FULL, HINT_FICHES_FULL } from "./hints";

export type FichesSlice = {
  /** Fiche ouverte en plein écran (Échap ou le bouton reviennent au panneau). */
  panelExpanded: boolean;
  /** Fenêtre de gestion des catégories de la carte ouverte. */
  categoriesOpen: boolean;

  setPanelExpanded: (expanded: boolean) => void;
  setCategoriesOpen: (open: boolean) => void;

  /** Ouvre une fiche supplémentaire de l'élément ouvert ; null revient à sa fiche principale. */
  openExtraFiche: (ficheId: string | null) => void;
  /** Ajoute une fiche supplémentaire à un élément et l'ouvre (l'élément doit être celui du panneau). */
  addExtraFiche: (owner: ElementRef) => void;
  updateExtraFiche: (ficheId: string, fields: ExtraFicheFields) => void;
  /** Supprime une fiche supplémentaire ; si elle était ouverte, la fiche principale revient. */
  removeExtraFiche: (ficheId: string) => void;

  /** Couleur et catégorie d'un pays ou d'un lien (null retire la valeur). */
  setElementStyle: (ref: ElementRef, fields: StyleFields) => void;
  /** Ajoute une catégorie ; renvoie son identifiant, ou null si elle n'a pas pu l'être. */
  addCategory: (label: string, color: MapColor) => string | null;
  updateCategory: (id: string, fields: { label?: string; color?: MapColor }) => void;
  removeCategory: (id: string) => void;
};

/** Partie de l'état de l'éditeur dont la tranche a besoin. */
type Host = FichesSlice & { doc: MapDoc; selection: Selection | null; hint: string | null };

/** Référence de l'élément ouvert dans le panneau, s'il peut porter des fiches supplémentaires. */
export function selectedElement(selection: Selection | null): ElementRef | null {
  if (!selection || selection.k === "flux") return null;
  const ref = makeElementRef(selection.k, selection.id);
  return parseElementRef(ref) ? ref : null;
}

/** Actions de la tranche ; `patch` et `get` sont le setState et le getState du store de l'éditeur. */
export function fichesSlice(patch: (partial: Partial<Host>) => void, get: () => Host): FichesSlice {
  return {
    panelExpanded: false,
    categoriesOpen: false,

    setPanelExpanded: (panelExpanded) => patch({ panelExpanded }),
    setCategoriesOpen: (categoriesOpen) => patch({ categoriesOpen }),

    openExtraFiche: (ficheId) => {
      const { doc, selection } = get();
      const owner = selectedElement(selection);
      if (!selection || !owner) return;
      if (ficheId === null) return patch({ selection: { k: selection.k, id: selection.id } });
      if (ops.findExtraFiche(doc, ficheId)?.owner === owner) {
        patch({ selection: { k: selection.k, id: selection.id, fiche: ficheId } });
      }
    },
    addExtraFiche: (owner) => {
      const { doc, selection } = get();
      if (!selection || selectedElement(selection) !== owner) return;
      const added = ops.addExtraFiche(doc, owner);
      if (!added) return patch({ hint: isFicheFull(doc, owner) ? HINT_FICHES_FULL : null });
      patch({ doc: added.doc, selection: { k: selection.k, id: selection.id, fiche: added.id } });
    },
    updateExtraFiche: (ficheId, fields) => patch({ doc: ops.updateExtraFiche(get().doc, ficheId, fields) }),
    removeExtraFiche: (ficheId) => {
      const { doc, selection } = get();
      const next = ops.removeExtraFiche(doc, ficheId);
      if (next === doc) return;
      const reopen = selection?.fiche === ficheId ? { selection: { k: selection.k, id: selection.id } } : {};
      patch({ doc: next, ...reopen });
    },

    setElementStyle: (ref, fields) => patch({ doc: ops.setElementStyle(get().doc, ref, fields) }),
    addCategory: (label, color) => {
      const added = ops.addCategory(get().doc, label, color);
      if (!added) {
        if (get().doc.categories.length >= MAX_CATEGORIES) patch({ hint: HINT_CATEGORIES_FULL });
        return null;
      }
      patch({ doc: added.doc });
      return added.id;
    },
    updateCategory: (id, fields) => patch({ doc: ops.updateCategory(get().doc, id, fields) }),
    removeCategory: (id) => patch({ doc: ops.removeCategory(get().doc, id) }),
  };
}
