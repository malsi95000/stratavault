// État de l'éditeur. Les modifications du document passent par les fonctions pures de map-doc/ops.
import { create } from "zustand";
import { createStore } from "zustand/vanilla";
import type { StateCreator } from "zustand/vanilla";
import { EMPTY_FILTER } from "@/features/filters/filter";
import * as ops from "@/features/map-doc/ops";
import { nameOfRef, refExists } from "@/features/map-doc/refs";
import { blankDoc } from "@/features/map-doc/schema";
import {
  DEFAULT_FLUX_COLOR,
  DEFAULT_FLUX_WIDTH,
  DEFAULT_PING_TYPE,
  DEFAULT_TEXT_SIZE,
  FLUX_WIDTH_MAX,
  FLUX_WIDTH_MIN,
  MAX_PATH_POINTS,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
} from "@/features/map-doc/types";
import type {
  EntityKind,
  FicheFields,
  FicheKind,
  FluxColor,
  LonLat,
  MapDoc,
  PingType,
  Ref,
  Selection,
} from "@/features/map-doc/types";
import {
  HINT_ERASED,
  HINT_FLUX_ERASED,
  HINT_FULL,
  HINT_LASSO_TOO_SHORT,
  HINT_NO_COUNTRY_ERASE,
  HINT_OUTSIDE,
  HINT_PATHS_FULL,
  hintLinkPending,
  hintPingType,
} from "./hints";
import type { Tool } from "./hints";
import type { Draft } from "./drawing";
import { fichesSlice, selectedElement } from "./storeFiches";
import type { FichesSlice } from "./storeFiches";
import { filtersSlice } from "./storeFilters";
import type { FiltersSlice } from "./storeFilters";

export type { Tool };

/** Pourquoi une zone tracée au lasso n'a pas été ajoutée (ops.addZone a renvoyé null). */
function zoneRefusal(doc: MapDoc, points: readonly LonLat[]): string {
  if (ops.isFull(doc, doc.zones)) return HINT_FULL;
  // Le point de fermeture s'ajoute au tracé.
  if (ops.lacksPathRoom(doc, Math.min(points.length + 1, MAX_PATH_POINTS))) return HINT_PATHS_FULL;
  return HINT_LASSO_TOO_SHORT;
}

export type { Draft };

export type EditorState = FichesSlice & FiltersSlice & {
  doc: MapDoc;
  activeMapId: string | null;
  /**
   * Incrémenté à chaque carte chargée (hydrate, replaceDoc : ouverture, import, nouvelle carte) : les
   * vues qui gardent un état propre à la carte (cadrage de la frise) repartent de zéro.
   */
  docLoads: number;
  tool: Tool;
  /** Incrémenté à chaque choix d'outil, même identique (la touche F rouvre le menu du pinceau, comme la bêta). */
  toolPicks: number;
  pingType: PingType;
  fluxColor: FluxColor;
  fluxWidth: number;
  textSize: number;
  /** Élément ouvert dans le panneau. */
  selection: Selection | null;
  /** Première extrémité choisie avec l'outil lien. */
  pending: Ref | null;
  /** Tracé en cours du lasso ou du pinceau flux. */
  drawing: Draft | null;
  /** Message temporaire de la barre d'aide (null : texte de l'outil courant, voir HINTS). */
  hint: string | null;
  saveStatus: string;
  hydrated: boolean;

  /** Change d'outil : annule le lien et le tracé en cours, remet le texte d'aide de l'outil. */
  setTool: (tool: Tool) => void;
  setPingType: (type: PingType) => void;
  /** Menu des balises : choisit le type et active l'outil balise. */
  choosePingType: (type: PingType) => void;
  /** Menu du flux : choisit la couleur et active le pinceau. */
  chooseFluxColor: (color: FluxColor) => void;
  setDrawing: (drawing: Draft | null) => void;
  setFluxColor: (color: FluxColor) => void;
  setFluxWidth: (width: number) => void;
  setTextSize: (size: number) => void;
  setHint: (hint: string | null) => void;
  setSaveStatus: (status: string) => void;
  setActiveMapId: (id: string | null) => void;
  /** Fin de l'hydratation depuis le dépôt (n'enclenche pas de sauvegarde) ; oublie sélection, lien et tracé en cours. */
  hydrate: (doc: MapDoc, activeMapId: string | null) => void;
  /** Remplace le document (import, ouverture d'une carte, nouvelle carte). */
  replaceDoc: (doc: MapDoc, activeMapId?: string | null) => void;

  /**
   * Ouvre la fiche d'un élément existant (sans effet sinon) ; `fiche` ouvre directement l'une de ses
   * fiches supplémentaires (frise), à défaut sa fiche principale.
   */
  open: (k: EntityKind, id: string, fiche?: string) => void;
  /** Ferme la fiche (et quitte le plein écran). */
  close: () => void;
  /** Échap : quitte le plein écran ; sinon annule le lien en cours et ferme la fiche. */
  cancel: () => void;
  cancelPending: () => void;
  /** Outil lien : premier clic mémorise l'extrémité, second clic crée (ou rouvre) le lien. */
  pick: (ref: Ref) => void;

  placePing: (ll: LonLat | null) => void;
  placePoint: (ll: LonLat | null) => void;
  placeText: (ll: LonLat | null) => void;
  addZone: (points: readonly LonLat[]) => void;
  /** Fin d'un trait du pinceau (≥ 2 points), dans la couleur et l'épaisseur du brouillon (par défaut : réglages courants). */
  addFlux: (points: readonly LonLat[], color?: FluxColor, width?: number) => void;

  updateFiche: (k: FicheKind, id: string, fields: FicheFields) => void;
  changePingType: (id: string, type: PingType) => void;
  setCountryNote: (code: string, note: string) => void;
  setCountryDate: (code: string, date: string) => void;
  updateFluxFiche: (color: FluxColor, fields: FicheFields) => void;
  erase: (k: EntityKind, id: string) => void;
  /** Clic avec la gomme : supprime l'élément et met à jour la barre d'aide. */
  gomme: (k: EntityKind, id: string) => void;
};

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min;

const initializer: StateCreator<EditorState> = (set, get) => ({
  ...fichesSlice(set, get),
  ...filtersSlice(set, get),
  doc: blankDoc(),
  activeMapId: null,
  docLoads: 0,
  tool: "select",
  toolPicks: 0,
  pingType: DEFAULT_PING_TYPE,
  fluxColor: DEFAULT_FLUX_COLOR,
  fluxWidth: DEFAULT_FLUX_WIDTH,
  textSize: DEFAULT_TEXT_SIZE,
  selection: null,
  pending: null,
  drawing: null,
  hint: null,
  saveStatus: "",
  hydrated: false,

  setTool: (tool) => set((s) => ({ tool, toolPicks: s.toolPicks + 1, pending: null, drawing: null, hint: null })),
  setPingType: (pingType) => set({ pingType }),
  choosePingType: (pingType) =>
    set((s) => ({
      tool: "ping",
      toolPicks: s.toolPicks + 1,
      pingType,
      pending: null,
      drawing: null,
      hint: hintPingType(pingType),
    })),
  chooseFluxColor: (fluxColor) =>
    set((s) => ({ tool: "flux", toolPicks: s.toolPicks + 1, fluxColor, pending: null, drawing: null, hint: null })),
  setDrawing: (drawing) => set({ drawing }),
  setFluxColor: (fluxColor) => set({ fluxColor }),
  setFluxWidth: (width) => set({ fluxWidth: clamp(width, FLUX_WIDTH_MIN, FLUX_WIDTH_MAX) }),
  setTextSize: (size) => set({ textSize: clamp(size, TEXT_SIZE_MIN, TEXT_SIZE_MAX) }),
  setHint: (hint) => set({ hint }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setActiveMapId: (activeMapId) => set({ activeMapId }),
  hydrate: (doc, activeMapId) =>
    set((s) => ({
      doc,
      activeMapId,
      docLoads: s.docLoads + 1,
      hydrated: true,
      selection: null,
      pending: null,
      drawing: null,
      hint: null,
      panelExpanded: false,
      categoriesOpen: false,
      filter: EMPTY_FILTER,
    })),
  replaceDoc: (doc, activeMapId) =>
    set((s) => ({
      doc,
      activeMapId: activeMapId === undefined ? s.activeMapId : activeMapId,
      docLoads: s.docLoads + 1,
      selection: null,
      pending: null,
      drawing: null,
      hint: null,
      panelExpanded: false,
      categoriesOpen: false,
      filter: EMPTY_FILTER,
    })),

  open: (k, id, fiche) => {
    const { doc } = get();
    if (!ops.entityExists(doc, k, id)) return;
    const owner = selectedElement({ k, id });
    const extra = fiche !== undefined && owner !== null && ops.findExtraFiche(doc, fiche)?.owner === owner;
    set({ selection: extra ? { k, id, fiche } : { k, id } });
  },
  close: () => set({ selection: null, panelExpanded: false }),
  cancel: () =>
    set((s) => (s.panelExpanded ? { panelExpanded: false } : { pending: null, hint: null, selection: null })),
  cancelPending: () => set({ pending: null, hint: null }),
  pick: (ref) => {
    const { pending, doc } = get();
    if (!pending) return set({ pending: ref, hint: hintLinkPending(nameOfRef(doc, ref)) });
    if (pending === ref) return set({ pending: null, hint: null });
    const added = ops.addLink(doc, pending, ref);
    if (!added) return set({ pending: null, hint: ops.isFull(doc, doc.links) ? HINT_FULL : null });
    set({ doc: added.doc, pending: null, hint: null, selection: { k: "l", id: added.id } });
  },

  placePing: (ll) => {
    if (!ll) return set({ hint: HINT_OUTSIDE });
    const added = ops.addPing(get().doc, ll, get().pingType);
    if (!added) return set({ hint: HINT_FULL });
    set({ doc: added.doc, selection: { k: "p", id: added.id } });
  },
  placePoint: (ll) => {
    if (!ll) return set({ hint: HINT_OUTSIDE });
    const added = ops.addPoint(get().doc, ll);
    if (!added) return set({ hint: HINT_FULL });
    set({ doc: added.doc, selection: { k: "o", id: added.id } });
  },
  placeText: (ll) => {
    if (!ll) return set({ hint: HINT_OUTSIDE });
    const added = ops.addText(get().doc, ll, get().textSize);
    if (!added) return set({ hint: HINT_FULL });
    set({ doc: added.doc, selection: { k: "t", id: added.id } });
  },
  addZone: (points) => {
    const { doc } = get();
    const added = ops.addZone(doc, points);
    if (!added) return set({ hint: zoneRefusal(doc, points) });
    set({ doc: added.doc, selection: { k: "z", id: added.id }, hint: null });
  },
  addFlux: (points, color = get().fluxColor, width = get().fluxWidth) => {
    const { doc } = get();
    const added = ops.addFluxStroke(doc, color, points, width);
    if (added) return set({ doc: added.doc });
    if (ops.isFluxFull(doc)) set({ hint: HINT_FULL });
    else if (ops.lacksPathRoom(doc, Math.min(points.length, MAX_PATH_POINTS))) set({ hint: HINT_PATHS_FULL });
  },

  updateFiche: (k, id, fields) => set((s) => ({ doc: ops.updateFiche(s.doc, k, id, fields) })),
  changePingType: (id, type) => set((s) => ({ doc: ops.setPingType(s.doc, id, type) })),
  setCountryNote: (code, note) => set((s) => ({ doc: ops.setCountryNote(s.doc, code, note) })),
  setCountryDate: (code, date) => set((s) => ({ doc: ops.setCountryDate(s.doc, code, date) })),
  updateFluxFiche: (color, fields) => set((s) => ({ doc: ops.updateFluxFiche(s.doc, color, fields) })),
  erase: (k, id) =>
    set((s) => {
      const doc = ops.erase(s.doc, k, id);
      if (doc === s.doc) return {};
      // La fiche se ferme si son élément a disparu (lui-même ou un lien supprimé en cascade),
      // et le lien en cours s'annule si sa première extrémité a disparu.
      const keep = s.selection !== null && ops.entityExists(doc, s.selection.k, s.selection.id);
      const pendingGone = s.pending !== null && !refExists(doc, s.pending);
      return {
        doc,
        selection: keep ? s.selection : null,
        ...(keep ? {} : { panelExpanded: false }),
        ...(pendingGone ? { pending: null, hint: null } : {}),
      };
    }),
  gomme: (k, id) => {
    if (k === "c") return set({ hint: HINT_NO_COUNTRY_ERASE });
    get().erase(k, id);
    set({ hint: k === "flux" ? HINT_FLUX_ERASED : HINT_ERASED });
  },
});

/** Vrai si une fiche est ouverte en plein écran : elle recouvre la carte et les barres d'outils. */
export const isExpanded = (s: EditorState) => s.selection !== null && s.panelExpanded;

export type EditorStore = ReturnType<typeof createEditorStore>;

/** Store indépendant (tests, ou plusieurs éditeurs). */
export function createEditorStore() {
  return createStore<EditorState>()(initializer);
}

/** Store de l'application. */
export const useEditorStore = create<EditorState>()(initializer);
