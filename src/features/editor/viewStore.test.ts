import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEW, VIEW_STORAGE_KEY, readStoredView, rehydrateView, safeLocalStorage, useViewStore } from "./viewStore";

/** localStorage simulé (Vitest tourne sans navigateur). */
function fakeWindow(storage: Partial<Storage>) {
  vi.stubGlobal("window", { localStorage: storage });
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    storage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  useViewStore.setState({ view: DEFAULT_VIEW });
});

describe("préférence de vue", () => {
  it("planisphère par défaut, y compris côté serveur (sans window)", () => {
    expect(DEFAULT_VIEW).toBe("planisphere");
    expect(useViewStore.getState().view).toBe("planisphere");
    expect(safeLocalStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
    expect(() => safeLocalStorage.setItem(VIEW_STORAGE_KEY, "x")).not.toThrow();
  });

  it("valide la valeur enregistrée", () => {
    expect(readStoredView({ view: "globe" })).toBe("globe");
    expect(readStoredView({ view: "planisphere" })).toBe("planisphere");
    expect(readStoredView({ view: "sphere" })).toBe("planisphere");
    expect(readStoredView({ view: { toString: "globe" } })).toBe("planisphere");
    expect(readStoredView(null)).toBe("planisphere");
    expect(readStoredView("globe")).toBe("planisphere");
  });

  it("mémorise le choix et le relit au chargement suivant", async () => {
    const { data, storage } = memoryStorage();
    fakeWindow(storage);
    useViewStore.getState().setView("globe");
    expect(JSON.parse(data.get(VIEW_STORAGE_KEY)!)).toMatchObject({ state: { view: "globe" } });

    useViewStore.setState({ view: "planisphere" });
    data.set(VIEW_STORAGE_KEY, JSON.stringify({ state: { view: "globe" }, version: 0 }));
    await useViewStore.persist.rehydrate();
    expect(useViewStore.getState().view).toBe("globe");
  });

  it("ignore une valeur illisible ou inconnue", async () => {
    const { storage } = memoryStorage({ [VIEW_STORAGE_KEY]: "{pas du json" });
    fakeWindow(storage);
    await useViewStore.persist.rehydrate();
    expect(useViewStore.getState().view).toBe("planisphere");

    const other = memoryStorage({ [VIEW_STORAGE_KEY]: JSON.stringify({ state: { view: "3d" }, version: 0 }) });
    fakeWindow(other.storage);
    await useViewStore.persist.rehydrate();
    expect(useViewStore.getState().view).toBe("planisphere");
  });

  it("fonctionne quand le stockage est refusé (navigation privée, cookies bloqués)", () => {
    const refuse = () => {
      throw new DOMException("refusé", "SecurityError");
    };
    fakeWindow({ getItem: refuse, setItem: refuse, removeItem: refuse });
    expect(() => rehydrateView()).not.toThrow();
    expect(() => useViewStore.getState().setView("globe")).not.toThrow();
    expect(useViewStore.getState().view).toBe("globe");
  });
});
