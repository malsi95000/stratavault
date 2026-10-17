// Vue de l'éditeur (planisphère, globe ou frise chronologique), mémorisée dans ce navigateur.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import type { MapView } from "./projection";

export type { MapView };

/** Vue de l'éditeur : l'une des deux projections de la carte, ou la frise chronologique (EDI-07). */
export type EditorView = MapView | "frise";

export const DEFAULT_VIEW: MapView = "planisphere";
export const VIEW_STORAGE_KEY = "stratavault-vue";

type ViewState = {
  view: EditorView;
  /** Projection de la carte : la vue courante, ou la dernière carte affichée quand la frise est ouverte. */
  mapView: MapView;
  setView: (view: EditorView) => void;
};

export const isMapView = (v: unknown): v is MapView => v === "planisphere" || v === "globe";
export const isEditorView = (v: unknown): v is EditorView => isMapView(v) || v === "frise";

/** Valeur enregistrée → vue ; la vue par défaut si elle est absente ou inconnue. */
export function readStoredView(persisted: unknown): EditorView {
  if (typeof persisted !== "object" || persisted === null || !("view" in persisted)) return DEFAULT_VIEW;
  return isEditorView(persisted.view) ? persisted.view : DEFAULT_VIEW;
}

/** Valeur enregistrée → projection de la carte (la vue elle-même si c'est une carte, sinon `mapView`). */
export function readStoredMapView(persisted: unknown): MapView {
  if (typeof persisted !== "object" || persisted === null) return DEFAULT_VIEW;
  if ("view" in persisted && isMapView(persisted.view)) return persisted.view;
  return "mapView" in persisted && isMapView(persisted.mapView) ? persisted.mapView : DEFAULT_VIEW;
}

/**
 * localStorage sans erreur : absent côté serveur, refusé (navigation privée, cookies bloqués) ou plein.
 * La préférence est alors simplement oubliée.
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return typeof window === "undefined" ? null : window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(name, value);
    } catch {
      // Préférence non mémorisée : sans conséquence.
    }
  },
  removeItem: (name) => {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(name);
    } catch {
      // Idem.
    }
  },
};

/**
 * La vue est lue après le montage (skipHydration, puis rehydrate dans un effet) : le rendu serveur et
 * le premier rendu client affichent tous deux le planisphère, sans erreur d'hydratation. La frise
 * s'ouvre par-dessus la carte, qui garde sa projection, son cadrage et son zoom.
 */
export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      view: DEFAULT_VIEW,
      mapView: DEFAULT_VIEW,
      setView: (view) => set(isMapView(view) ? { view, mapView: view } : { view }),
    }),
    {
      name: VIEW_STORAGE_KEY,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ view: state.view, mapView: state.mapView }),
      merge: (persisted, current) => ({
        ...current,
        view: readStoredView(persisted),
        mapView: readStoredMapView(persisted),
      }),
      skipHydration: true,
    },
  ),
);

/** Lit la vue mémorisée (à appeler une fois monté, côté client). */
export function rehydrateView(): void {
  void useViewStore.persist.rehydrate();
}
