// Effacements demandés par l'utilisateur : données du mode démo (/espace) et copie locale d'un
// compte supprimé (/compte).
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { describe, expect, it, vi } from "vitest";
import { USER_DB_PREFIX } from "@/features/storage";
import { activateStorage, activeStorageMode, clearDemoData, flush, forgetDeletedAccount, getPersistence } from "./storageSession";
import { useEditorStore } from "./store";
import { useViewStore } from "./viewStore";

// Server Actions des cartes : banque distante vide.
vi.mock("@/features/maps/actions", () => {
  const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });
  return {
    listMaps: () => ok([]),
    getMap: () => ok(null),
    createMap: () => ok(null),
    updateMap: () => ok(null),
    renameMap: () => ok(null),
    setMapCover: () => ok(true),
    deleteMap: () => ok(null),
  };
});

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const databases = async () => (await indexedDB.databases()).map((db) => db.name);

describe("effacements à la demande", () => {
  it("compte supprimé : ferme la session de l'éditeur et efface la copie locale du compte", async () => {
    activateStorage({ kind: "account", userId: ALICE });
    await getPersistence().hydrate();
    useEditorStore.getState().setCountryNote("FRA", "x");
    expect(await flush()).toBe(true);
    expect(await databases()).toContain(`${USER_DB_PREFIX}${ALICE}`);

    await forgetDeletedAccount(ALICE);
    expect(activeStorageMode()).toBeNull();
    expect(useEditorStore.getState().doc.notes).toEqual({});
    expect(await databases()).not.toContain(`${USER_DB_PREFIX}${ALICE}`);
  });

  it("démo : efface la base « stratavault » et la vue mémorisée, et ferme la session", async () => {
    const clearView = vi.spyOn(useViewStore.persist, "clearStorage");
    activateStorage({ kind: "demo" });
    await getPersistence().hydrate();
    useEditorStore.getState().setCountryNote("DEU", "démo");
    expect(await flush()).toBe(true);
    expect(await databases()).toContain("stratavault");

    expect(await clearDemoData()).toBe("deleted");
    expect(clearView).toHaveBeenCalledTimes(1);
    expect(activeStorageMode()).toBeNull();
    expect(await databases()).not.toContain("stratavault");
  });

  it("démo : base gardée ouverte ailleurs, effacement en attente qui aboutit à la fermeture", async () => {
    const clearView = vi.spyOn(useViewStore.persist, "clearStorage");
    // Connexion qui ne se ferme pas à la demande d'effacement (autre onglet bloqué), avec une carte.
    const stuck = await openDB("stratavault", 2, {
      upgrade(db) {
        db.createObjectStore("maps", { keyPath: "id" });
        db.createObjectStore("meta");
      },
    });
    await stuck.put("maps", { id: "carte-demo" });
    activateStorage({ kind: "demo" });
    expect(await clearDemoData()).toBe("pending");
    // La vue mémorisée est effacée (les cartes le seront), la session de démo est rouverte.
    expect(clearView).toHaveBeenCalledTimes(1);
    expect(activeStorageMode()).toEqual({ kind: "demo" });
    stuck.close();
    // L'effacement en attente passe avant toute nouvelle ouverture : plus aucune carte.
    const reopened = await openDB("stratavault");
    const remaining = reopened.objectStoreNames.contains("maps") ? await reopened.count("maps") : 0;
    reopened.close();
    expect(remaining).toBe(0);
  }, 10_000);
});
