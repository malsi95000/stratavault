// Cloisonnement local par compte : changement de session et déconnexion.
import "fake-indexeddb/auto";
import { deleteDB, openDB } from "idb";
import { describe, expect, it, vi } from "vitest";
import { USER_DB_PREFIX } from "@/features/storage";
import { createIndexedDbRepository } from "@/features/storage";
import { activateStorage, activeStorageMode, finishSignOut, flush, getPersistence, prepareSignOut } from "./storageSession";
import type { SignOutChecks } from "./storageSession";
import { useEditorStore } from "./store";

// Server Actions des cartes : banque distante vide, joignable sauf si `offline` est vrai.
const network = vi.hoisted(() => ({ offline: false, conflict: false, slowGet: null as Promise<void> | null }));
vi.mock("@/features/maps/actions", () => {
  const ok = <T>(value: T) =>
    network.offline ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve({ ok: true as const, value });
  const info = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Carte",
    updated: "2026-10-05T12:00:00.000Z",
    revision: 1,
  };
  return {
    listMaps: () => ok([]),
    getMap: async () => {
      if (network.slowGet) await network.slowGet;
      return ok(null);
    },
    createMap: () => ok(info),
    // Carte modifiée sur un autre appareil depuis la version envoyée.
    updateMap: () => (network.conflict ? Promise.resolve({ ok: false as const, error: "conflict" as const }) : ok(info)),
    renameMap: () => ok(null),
    setMapCover: () => ok(true),
    deleteMap: () => ok(null),
  };
});

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const databases = async () => (await indexedDB.databases()).map((db) => db.name);

/** Questions de la déconnexion, aux réponses fixées ; les appels sont comptés. */
function checks(answers: { beforeLeave?: boolean; confirmLoss?: boolean } = {}) {
  const spies = {
    beforeLeave: vi.fn(async () => answers.beforeLeave ?? true),
    confirmLoss: vi.fn(async () => answers.confirmLoss ?? true),
  };
  return spies satisfies SignOutChecks;
}

/** Déconnexion complète réussie (le serveur a fermé la session entre les deux étapes). */
async function signOutFully(userId: string, answers: Parameters<typeof checks>[0] = {}) {
  const spies = checks(answers);
  const ready = await prepareSignOut(userId, spies);
  if (ready) await finishSignOut(userId);
  return { ready, ...spies };
}

describe("session de stockage", () => {
  it("changer de compte vide l'éditeur : aucune carte d'un compte ne s'affiche dans un autre", async () => {
    activateStorage({ kind: "account", userId: ALICE });
    await getPersistence().hydrate();
    useEditorStore.getState().setCountryNote("FRA", "secret d'Alice");
    expect(await flush()).toBe(true);

    activateStorage({ kind: "account", userId: BOB });
    expect(useEditorStore.getState().hydrated).toBe(false);
    expect(useEditorStore.getState().doc.notes).toEqual({});
    await getPersistence().hydrate();
    expect(useEditorStore.getState().doc.notes).toEqual({});
  });

  it("la démo garde la base historique, séparée des comptes", async () => {
    activateStorage({ kind: "demo" });
    await getPersistence().hydrate();
    expect(useEditorStore.getState().doc.notes).toEqual({});
    useEditorStore.getState().setCountryNote("DEU", "démo");
    expect(await flush()).toBe(true);
    const db = await openDB("stratavault");
    expect(await db.get("meta", "draft")).toMatchObject({ notes: { DEU: "démo" } });
    db.close();
  });

  it("la démo efface la copie d'un compte resté connecté, sauf une carte jamais envoyée", async () => {
    activateStorage({ kind: "account", userId: BOB });
    await getPersistence().hydrate();
    useEditorStore.getState().setCountryNote("FRA", "hors banque");
    expect(await flush()).toBe(true);
    // Session expirée (pas de déconnexion) : la démo s'ouvre dans ce navigateur.
    activateStorage({ kind: "demo" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await databases()).toContain(`${USER_DB_PREFIX}${BOB}`);

    activateStorage({ kind: "account", userId: BOB });
    await getPersistence().hydrate();
    expect(await getPersistence().saveToBank("Carte de Bob")).toBe("created");
    activateStorage({ kind: "demo" });
    await vi.waitFor(async () => expect(await databases()).not.toContain(`${USER_DB_PREFIX}${BOB}`));
  });

  it("activer un compte efface les bases laissées par d'autres comptes", async () => {
    activateStorage({ kind: "account", userId: BOB });
    await getPersistence().hydrate();
    await vi.waitFor(async () => expect(await databases()).not.toContain(`${USER_DB_PREFIX}${ALICE}`));
    expect(await databases()).toContain("stratavault");
  });

  it("déconnexion : envoie, efface la base locale du compte et ferme la session", async () => {
    activateStorage({ kind: "account", userId: ALICE });
    await getPersistence().hydrate();
    useEditorStore.getState().setCountryNote("FRA", "x");
    const { ready, beforeLeave, confirmLoss } = await signOutFully(ALICE);
    expect(ready).toBe(true);
    // La carte en cours est d'abord soumise aux questions (carte hors banque à enregistrer).
    expect(beforeLeave).toHaveBeenCalledTimes(1);
    // Brouillon écrit, aucune carte active : rien à envoyer, pas de confirmation de perte.
    expect(confirmLoss).not.toHaveBeenCalled();
    expect(activeStorageMode()).toBeNull();
    expect(useEditorStore.getState().doc.notes).toEqual({});
    expect(await databases()).not.toContain(`${USER_DB_PREFIX}${ALICE}`);
    expect(() => getPersistence()).toThrow();
  });

  it("carte hors banque : si l'utilisateur annule, il reste connecté et rien n'est effacé", async () => {
    activateStorage({ kind: "account", userId: ALICE });
    await getPersistence().hydrate();
    useEditorStore.getState().setCountryNote("FRA", "seulement ici");
    const { ready } = await signOutFully(ALICE, { beforeLeave: false });
    expect(ready).toBe(false);
    expect(activeStorageMode()).toEqual({ kind: "account", userId: ALICE });
    expect(useEditorStore.getState().doc.notes).toEqual({ FRA: "seulement ici" });
    expect(await databases()).toContain(`${USER_DB_PREFIX}${ALICE}`);
    await signOutFully(ALICE);
  });

  it("déconnexion refusée par le serveur (hors ligne) : rien n'est effacé, le compte se rouvre tel quel", async () => {
    activateStorage({ kind: "account", userId: ALICE });
    await getPersistence().hydrate();
    useEditorStore.getState().setCountryNote("FRA", "gardée");
    expect(await prepareSignOut(ALICE, checks())).toBe(true);
    expect(activeStorageMode()).toBeNull();
    // endSession() a échoué : pas de finishSignOut, la session est rouverte.
    activateStorage({ kind: "account", userId: ALICE });
    await getPersistence().hydrate();
    expect(useEditorStore.getState().doc.notes).toEqual({ FRA: "gardée" });
    await signOutFully(ALICE);
  });

  it("modifications en attente d'envoi dans un autre onglet : la perte est confirmée avant d'effacer", async () => {
    activateStorage({ kind: "account", userId: ALICE });
    await getPersistence().hydrate();
    // Autre onglet du même compte : son envoi a échoué, le drapeau « à envoyer » est dans la base.
    const otherTab = createIndexedDbRepository({ dbName: `${USER_DB_PREFIX}${ALICE}` });
    await otherTab.setPendingSync(true);
    const { ready, confirmLoss } = await signOutFully(ALICE, { confirmLoss: false });
    expect(ready).toBe(false);
    expect(confirmLoss).toHaveBeenCalledTimes(1);
    expect(await databases()).toContain(`${USER_DB_PREFIX}${ALICE}`);
    await otherTab.setPendingSync(false);
    await signOutFully(ALICE);
  });

  it("déconnexion pendant le chargement de la carte : elle ne s'affiche ni dans le compte suivant ni en démo", async () => {
    // Alice a une carte active ; sa lecture dans la banque est lente.
    activateStorage({ kind: "account", userId: ALICE });
    await getPersistence().hydrate();
    await getPersistence().saveToBank("Carte d'Alice");
    useEditorStore.getState().setCountryNote("FRA", "secret d'Alice");
    expect(await flush()).toBe(true);
    activateStorage({ kind: "demo" });

    let release = () => {};
    network.slowGet = new Promise<void>((resolve) => (release = resolve));
    activateStorage({ kind: "account", userId: ALICE });
    const loading = getPersistence().hydrate();
    const left = prepareSignOut(ALICE, { beforeLeave: async () => true, confirmLoss: async () => true });
    // La déconnexion n'attend pas la lecture distante ici : l'onglet passe à un autre compte.
    activateStorage({ kind: "account", userId: BOB });
    release();
    network.slowGet = null;
    await loading;
    await left;
    await getPersistence().hydrate();
    expect(useEditorStore.getState().doc.notes).toEqual({});
    expect(useEditorStore.getState().activeMapId).toBeNull();
    await signOutFully(BOB);
    await finishSignOut(ALICE);
  });

  it("base du compte effacée par un autre onglet : la session se ferme et rien ne la recrée", async () => {
    activateStorage({ kind: "account", userId: ALICE });
    const persistence = getPersistence();
    await persistence.hydrate();
    useEditorStore.getState().setCountryNote("FRA", "secret d'Alice");
    expect(await flush()).toBe(true);

    // Déconnexion dans un autre onglet : il efface la base locale du compte.
    await deleteDB(`${USER_DB_PREFIX}${ALICE}`);
    expect(activeStorageMode()).toBeNull();
    expect(useEditorStore.getState().doc.notes).toEqual({});
    // Une écriture encore en attente dans cet onglet échoue au lieu de recréer la base.
    useEditorStore.getState().setCountryNote("FRA", "après");
    await persistence.flush();
    expect(await databases()).not.toContain(`${USER_DB_PREFIX}${ALICE}`);
  });

  it("déconnexion avec des modifications non envoyées : rien n'est effacé si l'utilisateur renonce", async () => {
    activateStorage({ kind: "account", userId: ALICE });
    const persistence = getPersistence();
    await persistence.hydrate();
    expect(await persistence.saveToBank("Carte")).toBe("created");
    // La banque devient injoignable.
    network.offline = true;
    useEditorStore.getState().setCountryNote("FRA", "non envoyée");

    expect((await signOutFully(ALICE, { confirmLoss: false })).ready).toBe(false);
    expect(activeStorageMode()).toEqual({ kind: "account", userId: ALICE });
    expect(await databases()).toContain(`${USER_DB_PREFIX}${ALICE}`);

    expect((await signOutFully(ALICE, { confirmLoss: true })).ready).toBe(true);
    expect(await databases()).not.toContain(`${USER_DB_PREFIX}${ALICE}`);
    network.offline = false;
  });

  it("carte modifiée sur un autre appareil pendant l'envoi : sa version, détachée, est proposée à l'enregistrement", async () => {
    activateStorage({ kind: "account", userId: ALICE });
    const persistence = getPersistence();
    await persistence.hydrate();
    expect(await persistence.saveToBank("Carte")).toBe("created");
    network.conflict = true;
    useEditorStore.getState().setCountryNote("FRA", "version de cet appareil");

    // Première question (carte dans la banque : rien à proposer), puis, après le conflit, la carte
    // détachée est proposée à l'enregistrement ; l'utilisateur annule : rien n'est effacé.
    const spies = checks();
    spies.beforeLeave.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await prepareSignOut(ALICE, spies)).toBe(false);
    expect(spies.beforeLeave).toHaveBeenCalledTimes(2);
    expect(useEditorStore.getState().activeMapId).toBeNull();
    expect(useEditorStore.getState().doc.notes).toEqual({ FRA: "version de cet appareil" });
    expect(await databases()).toContain(`${USER_DB_PREFIX}${ALICE}`);
    network.conflict = false;
    await signOutFully(ALICE);
  });
});
