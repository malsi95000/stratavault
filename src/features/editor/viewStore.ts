// Vue de la carte (planisphère ou globe), mémorisée dans ce navigateur.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import type { MapView } from "./projection";

export type { MapView };

export const DEFAULT_VIEW: MapView = "planisphere";
export const VIEW_STORAGE_KEY = "stratavault-vue";

type ViewState = {
  view: MapView;
  setView: (view: MapView) => void;
};

export const isMapView = (v: unknown): v is MapView => v === "planisphere" || v === "globe";

/** Valeur enregistrée → vue ; la vue par défaut si elle est absente ou inconnue. */
export function readStoredView(persisted: unknown): MapView {
  if (typeof persisted !== "object" || persisted === null || !("view" in persisted)) return DEFAULT_VIEW;
  return isMapView(persisted.view) ? persisted.view : DEFAULT_VIEW;
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
 * le premier rendu client affichent tous deux le planisphère, sans erreur d'hydratation.
 */
export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      view: DEFAULT_VIEW,
      setView: (view) => set({ view }),
    }),
    {
      name: VIEW_STORAGE_KEY,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ view: state.view }),
      merge: (persisted, current) => ({ ...current, view: readStoredView(persisted) }),
      skipHydration: true,
    },
  ),
);

/** Lit la vue mémorisée (à appeler une fois monté, côté client). */
export function rehydrateView(): void {
  void useViewStore.persist.rehydrate();
}
