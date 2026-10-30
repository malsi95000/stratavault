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
  HINT_READ_ONLY,
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

/**
 * Règles d'une carte où chacun ne modifie que ses propres éléments (carte collective) : posées par la
 * session de cette carte, retirées à sa sortie. Sans règles, tout le document est modifiable (hors
 * lecture seule).
 */
export type EditRules = {
  /** Élément que le compte ne peut ni modifier ni supprimer : sa fiche est en lecture seule. */
  locked: (k: EntityKind, id: string) => boolean;
  /** Vérifie une modification du document : message de refus (barre d'aide), ou null pour l'accepter. */
  check: (prev: MapDoc, next: MapDoc) => string | null;
  /**
   * Faux : ni fiches supplémentaires, ni couleurs et catégories, ni notes des pays et fiches des flux
   * (partagées par tous) ; ces champs et boutons ne sont pas proposés.
   */
  extras: boolean;
  /**
   * Vrai : le compte peut seulement supprimer ses éléments (contributions suspendues, ou compte sans
   * profil). Les fiches sont en lecture seule sauf leur bouton Supprimer, et seuls les outils
   * Sélection et Gomme sont proposés ; `check` refuse tout ajout et toute modification.
   */
  deleteOnly?: boolean;
};

/** Outils disponibles quand le compte peut seulement supprimer ses éléments. */
export const DELETE_ONLY_TOOLS: readonly Tool[] = ["select", "gomme"];

/** Vrai si les règles de la carte ouverte ne permettent que de supprimer ses éléments. */
export const deleteOnly = (s: Pick<EditorState, "editRules">) => s.editRules?.deleteOnly === true;

/** L'outil `tool` peut-il être choisi (lecture seule : Sélection ; suppression seulement : Sélection et Gomme) ? */
function toolAllowed(s: EditorState, tool: Tool): boolean {
  if (s.readOnly) return tool === "select";
  return !deleteOnly(s) || DELETE_ONLY_TOOLS.includes(tool);
}

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
  /**
   * Lecture seule (carte partagée : lecteur, ou carte modifiée par un autre membre) : toute
   * modification du document est ignorée et seul l'outil Sélection reste disponible. Seuls hydrate,
   * replaceDoc et loadSharedDoc remplacent alors le document.
   */
  readOnly: boolean;
  /** Règles d'édition de la carte ouverte (carte collective) ; null : aucune. */
  editRules: EditRules | null;

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
  /** Passe en lecture seule (outil Sélection, lien et tracé en cours annulés) ou en revient. */
  setReadOnly: (readOnly: boolean) => void;
  /** Pose (ou retire, null) les règles d'édition de la carte ouverte. */
  setEditRules: (rules: EditRules | null) => void;
  /**
   * Carte partagée relue (rafraîchissement) : remplace le document en gardant la fiche ouverte si son
   * élément existe toujours, sans repartir de zéro comme une nouvelle carte (cadrage de la frise, filtres).
   */
  loadSharedDoc: (doc: MapDoc) => void;

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

type Patch = Partial<EditorState>;

/**
 * En lecture seule, une modification qui changerait le document est ignorée en entier (avec ce qui
 * l'accompagne : fiche ouverte sur un élément ajouté…) ; seule la barre d'aide le signale.
 */
export function guardReadOnly(state: EditorState, next: Patch): Patch {
  if (!state.readOnly || next.doc === undefined || next.doc === state.doc) return next;
  return { hint: HINT_READ_ONLY };
}

/**
 * Avec des règles d'édition (carte collective), une modification refusée est ignorée en entier, comme
 * en lecture seule, et la barre d'aide en donne la raison.
 */
export function guardEdits(state: EditorState, next: Patch): Patch {
  const guarded = guardReadOnly(state, next);
  if (!state.editRules || guarded.doc === undefined || guarded.doc === state.doc) return guarded;
  const refusal = state.editRules.check(state.doc, guarded.doc);
  return refusal === null ? guarded : { hint: refusal };
}

/** La fiche ouverte existe-t-elle encore dans `doc` (élément, et fiche supplémentaire ouverte) ? */
function selectionStillExists(doc: MapDoc, selection: Selection | null): boolean {
  if (!selection || !ops.entityExists(doc, selection.k, selection.id)) return false;
  return selection.fiche === undefined || ops.findExtraFiche(doc, selection.fiche) !== null;
}

const initializer: StateCreator<EditorState> = (rawSet, get) => {
  // Toutes les modifications passent par la garde de la lecture seule et des règles d'édition, sauf
  // les chargements de carte.
  const set = (partial: Patch | ((state: EditorState) => Patch)) =>
    rawSet((state) => guardEdits(state, typeof partial === "function" ? partial(state) : partial));
  return {
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
    readOnly: false,
    editRules: null,

    setTool: (tool) => {
      if (!toolAllowed(get(), tool)) return;
      set((s) => ({ tool, toolPicks: s.toolPicks + 1, pending: null, drawing: null, hint: null }));
    },
    setPingType: (pingType) => set({ pingType }),
    choosePingType: (pingType) => {
      if (!toolAllowed(get(), "ping")) return;
      set((s) => ({
        tool: "ping",
        toolPicks: s.toolPicks + 1,
        pingType,
        pending: null,
        drawing: null,
        hint: hintPingType(pingType),
      }));
    },
    chooseFluxColor: (fluxColor) => {
      if (!toolAllowed(get(), "flux")) return;
      set((s) => ({ tool: "flux", toolPicks: s.toolPicks + 1, fluxColor, pending: null, drawing: null, hint: null }));
    },
    setDrawing: (drawing) => set({ drawing }),
    setFluxColor: (fluxColor) => set({ fluxColor }),
    setFluxWidth: (width) => set({ fluxWidth: clamp(width, FLUX_WIDTH_MIN, FLUX_WIDTH_MAX) }),
    setTextSize: (size) => set({ textSize: clamp(size, TEXT_SIZE_MIN, TEXT_SIZE_MAX) }),
    setHint: (hint) => set({ hint }),
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setActiveMapId: (activeMapId) => set({ activeMapId }),
    hydrate: (doc, activeMapId) =>
      rawSet((s) => ({
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
      rawSet((s) => ({
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
    setReadOnly: (readOnly) =>
      rawSet(
        readOnly
          ? { readOnly, tool: "select", pending: null, drawing: null, hint: null, categoriesOpen: false }
          : { readOnly, hint: null },
      ),
    setEditRules: (editRules) =>
      rawSet((s) =>
        // Suppression seulement : un outil de dessin en cours est abandonné pour Sélection.
        editRules?.deleteOnly && !DELETE_ONLY_TOOLS.includes(s.tool)
          ? { editRules, tool: "select", pending: null, drawing: null, hint: null }
          : { editRules },
      ),
    loadSharedDoc: (doc) =>
      rawSet((s) => {
        const keep = selectionStillExists(doc, s.selection);
        return {
          doc,
          hydrated: true,
          selection: keep ? s.selection : null,
          ...(keep ? {} : { panelExpanded: false }),
          pending: s.pending !== null && refExists(doc, s.pending) ? s.pending : null,
          drawing: null,
        };
      }),

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
      // Règles d'édition (carte collective) : le lien d'un autre membre entre les mêmes extrémités,
      // qu'on ne peut pas modifier, n'empêche pas d'ajouter le sien.
      const rules = get().editRules;
      const added = ops.addLink(doc, pending, ref, undefined, rules ? (link) => !rules.locked("l", link.id) : undefined);
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
      const before = get().doc;
      get().erase(k, id);
      // Effacement refusé (règles d'édition) : la barre d'aide garde la raison du refus.
      if (get().doc !== before) set({ hint: k === "flux" ? HINT_FLUX_ERASED : HINT_ERASED });
    },
  };
};

/**
 * Vrai si l'élément de la fiche ouverte ne se modifie ni ne se supprime : lecture seule, élément d'un
 * autre membre (carte collective), ou pays et flux dont les fiches sont partagées quand la carte n'en
 * accepte pas.
 */
export function ficheLocked(s: EditorState): boolean {
  if (s.readOnly) return true;
  const rules = s.editRules;
  if (!rules || !s.selection) return false;
  const { k, id } = s.selection;
  if (!rules.extras && (k === "c" || k === "flux")) return true;
  return rules.locked(k, id);
}

/**
 * Vrai si les champs de la fiche ouverte ne se modifient pas : élément verrouillé (ficheLocked), ou
 * compte qui peut seulement supprimer ses éléments (le bouton Supprimer reste).
 */
export const ficheReadOnly = (s: EditorState): boolean => ficheLocked(s) || deleteOnly(s);

/** Vrai si les fiches supplémentaires, couleurs et catégories sont proposées. */
export const extrasAllowed = (s: EditorState) => s.editRules?.extras ?? true;

/** Vrai si une fiche est ouverte en plein écran : elle recouvre la carte et les barres d'outils. */
export const isExpanded = (s: EditorState) => s.selection !== null && s.panelExpanded;

export type EditorStore = ReturnType<typeof createEditorStore>;

/** Store indépendant (tests, ou plusieurs éditeurs). */
export function createEditorStore() {
  return createStore<EditorState>()(initializer);
}

/** Store de l'application. */
export const useEditorStore = create<EditorState>()(initializer);
