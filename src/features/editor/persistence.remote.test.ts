// Sauvegarde automatique avec une banque distante (mode compte) : copie locale d'abord, envoi
// ensuite ; une erreur réseau ne perd rien et les modifications sont renvoyées.
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { addPing } from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import { RemoteBankError, createIndexedDbRepository, withBank } from "@/features/storage";
import type { MapBank, MapRepository, RemoteFailure } from "@/features/storage";
import { MAP_CONFLICT, MAP_GONE, createPersistence } from "./persistence";
import {
  ACCOUNT_DRAFT_SAVED,
  ACCOUNT_LOAD_FAILED,
  ACCOUNT_SAVED,
  REMOTE_BANK_OFFLINE,
  REMOTE_LOAD_OFFLINE,
  REMOTE_OFFLINE,
  REMOTE_SIGNED_OUT,
  REMOTE_TOO_LARGE,
  describeRemoteError,
  idleStatus,
  persistenceOptionsFor,
} from "./saveProfiles";
import { createEditorStore } from "./store";

let n = 0;
const RETRY_MS = 20;
/** Attente d'un nouvel essai réussi : large plafond, vérifié souvent. */
const RETRY_WAIT = { timeout: 5_000, interval: 10 };

/** Banque « distante » en mémoire (IndexedDB) qu'on peut couper. */
function fakeRemote() {
  const store = createIndexedDbRepository({ dbName: `remote-${++n}` });
  const state = { failure: null as RemoteFailure | null, updates: 0 };
  const guard = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      if (state.failure) throw new RemoteBankError(state.failure);
      return fn(...args);
    };
  const bank: MapBank = {
    list: guard(() => store.list()),
    get: guard((id: string) => store.get(id)),
    create: guard((name: string, data: MapDoc, id?: string) => store.create(name, data, id)),
    update: (id: string, data: MapDoc, expectedVersion?: string) => {
      state.updates++;
      return guard(() => store.update(id, data, expectedVersion))();
    },
    rename: guard((id: string, name: string) => store.rename(id, name)),
    remove: guard((id: string) => store.remove(id)),
  };
  return { bank, store, state };
}

const account = { delay: 0, ...persistenceOptionsFor({ kind: "account", userId: "u1" }) };
const accountOptions = { ...account, delay: 0, remote: { ...account.remote!, retryDelay: RETRY_MS } };

async function setup(local: MapRepository = createIndexedDbRepository({ dbName: `local-${++n}` })) {
  const remote = fakeRemote();
  const repo = withBank(local, remote.bank);
  const store = createEditorStore();
  const persistence = createPersistence(repo, store, accountOptions);
  await persistence.hydrate();
  return { local, remote, repo, store, persistence };
}

/** Recharge la page : nouvelle persistance sur les mêmes bases. */
async function reload(repo: MapRepository) {
  const store = createEditorStore();
  const persistence = createPersistence(repo, store, accountOptions);
  await persistence.hydrate();
  return { store, persistence };
}

const withPing = (id = "p1"): MapDoc => addPing(blankDoc(), [1, 1], "crise", id)!.doc;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("persistance avec une banque distante", () => {
  it("enregistre le brouillon localement puis la carte active dans la banque", async () => {
    const { local, remote, store, persistence } = await setup();
    store.getState().setCountryNote("FRA", "brouillon");
    expect(await persistence.flush()).toBe(true);
    expect(store.getState().saveStatus).toBe(ACCOUNT_DRAFT_SAVED);
    expect(await remote.store.list()).toEqual([]);

    expect(await persistence.saveToBank("Sahel")).toBe("created");
    const id = store.getState().activeMapId!;
    store.getState().setCountryNote("FRA", "envoyée");
    expect(await persistence.flush()).toBe(true);
    expect(store.getState().saveStatus).toBe(ACCOUNT_SAVED);
    expect(((await remote.store.get(id))?.data as MapDoc).notes).toEqual({ FRA: "envoyée" });
    expect(await local.list()).toEqual([]);
    expect(await local.getPendingSync()).toBe(false);
    expect(persistence.hasUnsentChanges()).toBe(false);
  });

  it("serveur injoignable : la modification reste dans ce navigateur, puis repart au rechargement", async () => {
    const { local, remote, repo, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    remote.state.failure = "network";
    store.getState().setCountryNote("FRA", "hors ligne");
    expect(await persistence.flush()).toBe(false);
    expect(store.getState().saveStatus).toBe(REMOTE_OFFLINE);
    expect(persistence.hasUnsentChanges()).toBe(true);
    // Seul l'envoi a échoué : quitter l'éditeur ne perd rien.
    expect(persistence.keptLocally()).toBe(true);
    expect((await local.getDraft()) as MapDoc).toMatchObject({ notes: { FRA: "hors ligne" } });
    expect(await local.getPendingSync()).toBe(true);
    expect(await local.getActiveId()).toBe(id);
    persistence.dispose();

    // Rechargement, réseau revenu : la copie locale l'emporte et part dans la banque.
    remote.state.failure = null;
    const next = await reload(repo);
    expect(next.store.getState().doc.notes).toEqual({ FRA: "hors ligne" });
    expect(next.store.getState().activeMapId).toBe(id);
    expect(await next.persistence.flush()).toBe(true);
    expect(((await remote.store.get(id))?.data as MapDoc).notes).toEqual({ FRA: "hors ligne" });
    expect(await local.getPendingSync()).toBe(false);
  });

  it("réessaie automatiquement après une erreur réseau", async () => {
    const { remote, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    remote.state.failure = "network";
    store.getState().setCountryNote("FRA", "x");
    expect(await persistence.flush()).toBe(false);
    expect(store.getState().saveStatus).toBe(REMOTE_OFFLINE);
    remote.state.failure = null;
    // Attente conditionnelle (et non un délai fixe) : la suite complète charge la machine.
    await vi.waitFor(async () => {
      expect(store.getState().saveStatus).toBe(ACCOUNT_SAVED);
      expect(((await remote.store.get(id))?.data as MapDoc).notes).toEqual({ FRA: "x" });
    }, RETRY_WAIT);
    persistence.dispose();
  });

  it("« Enregistrer dans la banque » hors ligne : aucune promesse de nouvel essai, rien n'est créé ensuite", async () => {
    const { remote, store, persistence } = await setup();
    store.getState().setCountryNote("FRA", "brouillon");
    remote.state.failure = "network";
    expect(await persistence.saveToBank("Sahel")).toBe("failed");
    expect(store.getState().saveStatus).toBe(REMOTE_BANK_OFFLINE);
    expect(store.getState().activeMapId).toBeNull();
    remote.state.failure = null;
    await wait(RETRY_MS * 4);
    expect(await remote.store.list()).toEqual([]);
    // La carte reste à enregistrer : la page le propose encore (avant de la quitter ou de se déconnecter).
    expect(persistence.needsBankPrompt()).toBe(true);
  });

  it("« Mettre à jour la banque » hors ligne : la carte active est réellement renvoyée plus tard", async () => {
    const { remote, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    store.getState().setCountryNote("FRA", "à envoyer");
    remote.state.failure = "network";
    expect(await persistence.saveToBank()).toBe("failed");
    expect(store.getState().saveStatus).toBe(REMOTE_OFFLINE);
    expect(persistence.hasUnsentChanges()).toBe(true);
    remote.state.failure = null;
    await vi.waitFor(async () => {
      expect(store.getState().saveStatus).toBe(ACCOUNT_SAVED);
      expect(((await remote.store.get(id))?.data as MapDoc).notes).toEqual({ FRA: "à envoyer" });
    }, RETRY_WAIT);
    expect(persistence.hasUnsentChanges()).toBe(false);
  });

  it("session fermée pendant le chargement : la carte lue n'est pas affichée et rien n'est écrit", async () => {
    const first = await setup();
    await first.persistence.saveToBank("Secret");
    first.store.getState().setCountryNote("FRA", "secret");
    expect(await first.persistence.flush()).toBe(true);
    first.persistence.dispose();

    const store = createEditorStore();
    const persistence = createPersistence(first.repo, store, accountOptions);
    const loading = persistence.hydrate();
    persistence.dispose();
    await loading;
    expect(store.getState().hydrated).toBe(false);
    expect(store.getState().doc.notes).toEqual({});
    expect(store.getState().activeMapId).toBeNull();
    // Une écriture demandée après la fermeture ne recopie pas le store (autre session) dans cette base.
    store.getState().hydrate(blankDoc(), null);
    store.getState().setCountryNote("DEU", "autre compte");
    expect(await persistence.flush()).toBe(true);
    expect(((await first.local.getDraft()) as MapDoc).notes).toEqual({ FRA: "secret" });
  });

  it("session expirée : message clair, pas de nouvel essai en boucle", async () => {
    const { remote, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    remote.state.failure = "unauthorized";
    const before = remote.state.updates;
    store.getState().setCountryNote("FRA", "x");
    expect(await persistence.flush()).toBe(false);
    await wait(RETRY_MS * 4);
    expect(store.getState().saveStatus).toBe(REMOTE_SIGNED_OUT);
    // Un seul essai : celui de flush().
    expect(remote.state.updates).toBe(before + 1);
    persistence.dispose();
  });

  it("sans modification en attente, la banque fait foi (carte modifiée depuis un autre appareil)", async () => {
    const { remote, repo, store, persistence } = await setup();
    store.getState().setCountryNote("FRA", "ici");
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    persistence.dispose();
    await remote.store.update(id, withPing("ailleurs"));

    const next = await reload(repo);
    expect(next.store.getState().doc).toEqual(withPing("ailleurs"));
    expect(next.store.getState().activeMapId).toBe(id);
  });

  it("la version reçue de la banque devient la copie locale : un chargement hors ligne ne la perd pas", async () => {
    const { local, remote, repo, store, persistence } = await setup();
    store.getState().setCountryNote("FRA", "v3");
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    persistence.dispose();
    // Un autre appareil enregistre une version plus récente.
    await remote.store.update(id, withPing("v5"));

    // Rechargement en ligne, sans modification : la v5 est affichée et gardée comme copie locale.
    const online = await reload(repo);
    expect(online.store.getState().doc).toEqual(withPing("v5"));
    expect(await local.getDraft()).toEqual(withPing("v5"));
    online.persistence.dispose();

    // Rechargement hors ligne : la v5 s'affiche, et la modification suivante la complète.
    remote.state.failure = "network";
    const offline = await reload(repo);
    expect(offline.store.getState().doc).toEqual(withPing("v5"));
    offline.store.getState().setCountryNote("DEU", "edit");
    expect(await offline.persistence.flush()).toBe(false);
    offline.persistence.dispose();

    remote.state.failure = null;
    const back = await reload(repo);
    expect(await back.persistence.flush()).toBe(true);
    const sent = (await remote.store.get(id))?.data as MapDoc;
    expect(sent.notes).toEqual({ DEU: "edit" });
    expect(sent.pings.map((p) => p.id)).toEqual(["v5"]);
  });

  it("carte active supprimée de la banque ailleurs : détachée, son contenu reste dans l'éditeur", async () => {
    const { local, remote, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    await remote.store.remove(id);
    store.getState().setCountryNote("FRA", "gardée");
    expect(await persistence.flush()).toBe(true);
    expect(store.getState().saveStatus).toBe(MAP_GONE);
    expect(store.getState().activeMapId).toBeNull();
    expect(store.getState().doc.notes).toEqual({ FRA: "gardée" });
    expect(await local.getActiveId()).toBeNull();
    expect(persistence.needsBankPrompt()).toBe(true);
  });

  it("« Mettre à jour la banque » d'une carte supprimée ailleurs : recréée sous un nouvel identifiant", async () => {
    const { remote, store, persistence } = await setup();
    store.getState().setCountryNote("FRA", "a");
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    await remote.store.remove(id);
    expect(await persistence.saveToBank()).toBe("created");
    const recreated = store.getState().activeMapId!;
    // Jamais l'ancien identifiant : une copie périmée de la carte supprimée ne peut pas la viser.
    expect(recreated).not.toBe(id);
    expect(await remote.store.get(id)).toBeNull();
    expect(((await remote.store.get(recreated))?.data as MapDoc).notes).toEqual({ FRA: "a" });
    // La carte recréée est suivie normalement : la modification suivante part avec sa version.
    store.getState().setCountryNote("FRA", "b");
    expect(await persistence.flush()).toBe(true);
    expect(((await remote.store.get(recreated))?.data as MapDoc).notes).toEqual({ FRA: "b" });
  });

  it("carte supprimée ailleurs pendant l'envoi : « Nouvelle carte » et « Continuer » ne remplacent rien sans accord", async () => {
    for (const action of ["new", "open"] as const) {
      const { remote, store, persistence } = await setup();
      await persistence.saveToBank("Sahel");
      const other = await remote.store.create("Autre", blankDoc());
      await remote.store.remove(store.getState().activeMapId!);
      store.getState().setCountryNote("FRA", "non envoyée");
      const replace = (discard: boolean) =>
        action === "new" ? persistence.newMap({ discard }) : persistence.openMap(other.id, { discard });
      expect(await replace(false)).toBe("unsaved");
      expect(store.getState().doc.notes).toEqual({ FRA: "non envoyée" });
      // La carte est détachée : l'appelant propose de l'enregistrer (needsBankPrompt).
      expect(persistence.needsBankPrompt()).toBe(true);
      // Après accord explicite (discard), le remplacement a lieu.
      expect(await replace(true)).toBe(action === "new" ? "done" : "opened");
      expect(store.getState().doc).toEqual(blankDoc());
    }
  });

  it("n'envoie pas de nouveau une carte qui vient d'être créée ou relue au chargement", async () => {
    const { remote, repo, store, persistence } = await setup();
    store.getState().setCountryNote("FRA", "a");
    await persistence.saveToBank("A");
    expect(remote.state.updates).toBe(0);
    persistence.dispose();
    await reload(repo);
    expect(remote.state.updates).toBe(0);
  });

  it("« Continuer » fait remonter la carte en tête de la banque, comme la bêta", async () => {
    const { remote, store, persistence } = await setup();
    store.getState().setCountryNote("FRA", "a");
    await persistence.saveToBank("A");
    const a = store.getState().activeMapId!;
    await wait(5);
    const b = await remote.store.create("B", withPing("pB"));
    expect((await remote.store.list()).map((m) => m.id)).toEqual([b.id, a]);

    await wait(5);
    expect(await persistence.openMap(a)).toBe("opened");
    expect(store.getState().saveStatus).toBe(ACCOUNT_SAVED);
    expect((await remote.store.list()).map((m) => m.id)).toEqual([a, b.id]);
    expect(((await remote.store.get(a))?.data as MapDoc).notes).toEqual({ FRA: "a" });
  });

  it("marque le brouillon « à envoyer » avant de l'écrire : une page fermée entre les deux ne perd rien", async () => {
    const base = createIndexedDbRepository({ dbName: `local-${++n}` });
    let dies = false;
    // La page « meurt » pendant l'écriture du brouillon.
    const local: MapRepository = {
      ...base,
      setDraft: (data) => (dies ? Promise.reject(new Error("page fermée")) : base.setDraft(data)),
    };
    const { store, persistence } = await setup(local);
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    dies = true;
    store.getState().setCountryNote("FRA", "x");
    expect(await persistence.flush()).toBe(false);
    expect(await base.getPendingSync()).toBe(true);
    expect(await base.getActiveId()).toBe(id);
    expect(persistence.keptLocally()).toBe(false);
  });

  it("serveur injoignable au chargement : la copie locale est affichée et sauvegardée ici", async () => {
    const local = createIndexedDbRepository({ dbName: `local-${++n}` });
    await local.setDraft(withPing());
    await local.setActiveId("m1");
    // Version de la banque dont dérive la copie locale (écrite avec elle au dernier chargement en ligne).
    await local.setSyncBase({ id: "m1", version: "1" });
    const remote = fakeRemote();
    await remote.store.create("Sahel", withPing(), "m1");
    remote.state.failure = "network";
    const store = createEditorStore();
    const repo = withBank(local, remote.bank);
    const persistence = createPersistence(repo, store, accountOptions);
    await persistence.hydrate();
    expect(store.getState().doc).toEqual(withPing());
    expect(store.getState().activeMapId).toBe("m1");
    expect(persistence.loadFailed()).toBe(false);
    expect(store.getState().saveStatus).toBe(REMOTE_LOAD_OFFLINE);

    store.getState().setCountryNote("FRA", "x");
    expect(await persistence.flush()).toBe(false);
    expect(store.getState().saveStatus).toBe(REMOTE_OFFLINE);
    expect(await local.getDraft()).toMatchObject({ notes: { FRA: "x" } });
    expect(await local.getPendingSync()).toBe(true);
    persistence.dispose();

    // Réseau revenu : la carte active est mise à jour (pas de doublon dans la banque).
    remote.state.failure = null;
    const next = await reload(repo);
    expect(next.store.getState().activeMapId).toBe("m1");
    expect(await next.persistence.flush()).toBe(true);
    expect(await remote.store.list()).toHaveLength(1);
    expect(((await remote.store.get("m1"))?.data as MapDoc).notes).toEqual({ FRA: "x" });
  });

  it("serveur injoignable au chargement sans copie locale lisible : rien n'est écrit automatiquement", async () => {
    const local = createIndexedDbRepository({ dbName: `local-${++n}` });
    await local.setActiveId("m1");
    const remote = fakeRemote();
    remote.state.failure = "network";
    const store = createEditorStore();
    const persistence = createPersistence(withBank(local, remote.bank), store, accountOptions);
    await persistence.hydrate();
    expect(persistence.loadFailed()).toBe(true);
    expect(store.getState().activeMapId).toBeNull();
    expect(store.getState().saveStatus).toBe(ACCOUNT_LOAD_FAILED);
    store.getState().setCountryNote("FRA", "x");
    expect(await persistence.flush()).toBe(false);
    expect(await local.getDraft()).toBeNull();
    expect(await local.getActiveId()).toBe("m1");
  });
});

/** Un autre appareil enregistre une nouvelle version de la carte `id` dans la banque. */
const otherDevice = (remote: ReturnType<typeof fakeRemote>, id: string, note: string) =>
  remote.store.update(id, { ...blankDoc(), notes: { FRA: note } });

const bankNotes = async (remote: ReturnType<typeof fakeRemote>, id: string) =>
  ((await remote.store.get(id))?.data as MapDoc).notes;

describe("plusieurs appareils : une version plus récente n'est jamais écrasée", () => {
  it("sauvegarde automatique d'un document périmé : conflit, la carte est détachée et reste ici", async () => {
    const { local, remote, store, persistence } = await setup();
    store.getState().setCountryNote("FRA", "v1");
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    await otherDevice(remote, id, "autre appareil");

    store.getState().setCountryNote("FRA", "ici");
    expect(await persistence.flush()).toBe(false);
    expect(store.getState().saveStatus).toBe(MAP_CONFLICT);
    expect(await bankNotes(remote, id)).toEqual({ FRA: "autre appareil" });
    // La version de ce navigateur reste dans l'éditeur et le brouillon local, hors banque.
    expect(store.getState().activeMapId).toBeNull();
    expect(store.getState().doc.notes).toEqual({ FRA: "ici" });
    expect(await local.getDraft()).toMatchObject({ notes: { FRA: "ici" } });
    expect(await local.getActiveId()).toBeNull();
    expect(await local.getPendingSync()).toBe(false);
    expect(persistence.keptLocally()).toBe(true);
    expect(persistence.needsBankPrompt()).toBe(true);

    // Les modifications suivantes restent locales : rien n'est envoyé à la carte de l'autre appareil.
    store.getState().setCountryNote("FRA", "ici 2");
    expect(await persistence.flush()).toBe(true);
    expect(await bankNotes(remote, id)).toEqual({ FRA: "autre appareil" });
  });

  it("« Mettre à jour la banque » ne remplace pas une version plus récente", async () => {
    const { remote, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    await otherDevice(remote, id, "autre appareil");
    expect(await persistence.saveToBank()).toBe("failed");
    expect(store.getState().saveStatus).toBe(MAP_CONFLICT);
    expect(await bankNotes(remote, id)).toEqual({ FRA: "autre appareil" });
    expect(store.getState().activeMapId).toBeNull();
  });

  it("enchaîne les envois sans conflit avec lui-même (version suivie à chaque envoi)", async () => {
    const { remote, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    for (const note of ["a", "b", "c"]) {
      store.getState().setCountryNote("FRA", note);
      expect(await persistence.flush()).toBe(true);
    }
    expect(await persistence.saveToBank()).toBe("updated");
    store.getState().setCountryNote("FRA", "d");
    expect(await persistence.flush()).toBe(true);
    expect(await bankNotes(remote, id)).toEqual({ FRA: "d" });
    expect(store.getState().activeMapId).toBe(id);
  });

  it("une écriture lancée avant le conflit ne rattache pas la carte détachée", async () => {
    const { remote, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    await otherDevice(remote, id, "autre appareil");
    store.getState().setCountryNote("FRA", "1");
    const first = persistence.flush();
    // Nouvelle modification pendant l'envoi : écriture mise en file avec l'ancienne carte active.
    store.getState().setCountryNote("FRA", "2");
    const second = persistence.flush();
    expect(await first).toBe(false);
    await second;
    expect(await bankNotes(remote, id)).toEqual({ FRA: "autre appareil" });
    expect(store.getState().activeMapId).toBeNull();
  });

  it("« Mettre à jour la banque » pendant un envoi automatique en conflit : rien n'est écrasé", async () => {
    const { remote, store, persistence } = await setup();
    store.getState().setCountryNote("FRA", "v1");
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    await otherDevice(remote, id, "autre appareil");
    store.getState().setCountryNote("FRA", "ici");
    // Clic pendant l'aller-retour de la sauvegarde automatique : la tâche attend dans la file.
    const auto = persistence.flush();
    const manual = persistence.saveToBank();
    expect(await auto).toBe(false);
    expect(await manual).toBe("failed");
    expect(store.getState().saveStatus).toBe(MAP_CONFLICT);
    expect(await bankNotes(remote, id)).toEqual({ FRA: "autre appareil" });
    expect(store.getState().activeMapId).toBeNull();
    expect(store.getState().doc.notes).toEqual({ FRA: "ici" });
  });

  it("« Mettre à jour la banque » après une carte supprimée ailleurs dans la file : pas de recréation", async () => {
    const { remote, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    await remote.store.remove(id);
    store.getState().setCountryNote("FRA", "ici");
    const auto = persistence.flush();
    const manual = persistence.saveToBank();
    expect(await auto).toBe(true);
    expect(await manual).toBe("failed");
    expect(store.getState().saveStatus).toBe(MAP_GONE);
    expect(await remote.store.list()).toHaveLength(0);
    expect(store.getState().activeMapId).toBeNull();
  });

  it("copie locale sans version de référence : jamais envoyée sans contrôle", async () => {
    const local = createIndexedDbRepository({ dbName: `local-${++n}` });
    await local.setDraft(withPing());
    await local.setActiveId("m1");
    await local.setPendingSync(true);
    const remote = fakeRemote();
    await remote.store.create("Sahel", blankDoc(), "m1");
    await otherDevice(remote, "m1", "autre appareil");
    const store = createEditorStore();
    const persistence = createPersistence(withBank(local, remote.bank), store, accountOptions);
    await persistence.hydrate();
    expect(await persistence.flush()).toBe(false);
    expect(store.getState().saveStatus).toBe(MAP_CONFLICT);
    expect(remote.state.updates).toBe(0);
    expect(await bankNotes(remote, "m1")).toEqual({ FRA: "autre appareil" });
    expect(store.getState().doc).toEqual(withPing());
  });

  it("au rechargement, les modifications en attente partent avec leur version : pas d'écrasement", async () => {
    const { local, remote, repo, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    remote.state.failure = "network";
    store.getState().setCountryNote("FRA", "hors ligne");
    expect(await persistence.flush()).toBe(false);
    persistence.dispose();
    remote.state.failure = null;
    await otherDevice(remote, id, "autre appareil");

    const next = await reload(repo);
    expect(await next.persistence.flush()).toBe(false);
    expect(next.store.getState().saveStatus).toBe(MAP_CONFLICT);
    expect(await bankNotes(remote, id)).toEqual({ FRA: "autre appareil" });
    expect(next.store.getState().doc.notes).toEqual({ FRA: "hors ligne" });
    expect(await local.getActiveId()).toBeNull();
  });

  it("au rechargement en ligne, la version reçue devient la référence : la modification suivante passe", async () => {
    const { remote, repo, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    persistence.dispose();
    await otherDevice(remote, id, "autre appareil");

    const next = await reload(repo);
    expect(next.store.getState().doc.notes).toEqual({ FRA: "autre appareil" });
    next.store.getState().setCountryNote("FRA", "suite");
    expect(await next.persistence.flush()).toBe(true);
    expect(await bankNotes(remote, id)).toEqual({ FRA: "suite" });
  });

  it("« Continuer » envoie la carte ouverte à sa version : une modification ailleurs entre-temps est détectée", async () => {
    const { remote, store, persistence } = await setup();
    const other = await remote.store.create("Autre", blankDoc());
    expect(await persistence.openMap(other.id)).toBe("opened");
    expect(store.getState().activeMapId).toBe(other.id);
    await otherDevice(remote, other.id, "autre appareil");
    store.getState().setCountryNote("FRA", "ici");
    expect(await persistence.flush()).toBe(false);
    expect(await bankNotes(remote, other.id)).toEqual({ FRA: "autre appareil" });
  });
});

describe("deux onglets de ce navigateur sur la même carte (base locale partagée)", () => {
  it("l'onglet qui enregistre dans la banque y reste rattaché après le conflit de l'autre", async () => {
    const { local, remote, repo, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const id = store.getState().activeMapId!;
    const second = await reload(repo);
    expect(second.store.getState().activeMapId).toBe(id);

    // Onglet 1 enregistre ; l'onglet 2, en retard d'une version, est en conflit et se détache.
    store.getState().setCountryNote("FRA", "onglet 1");
    expect(await persistence.flush()).toBe(true);
    second.store.getState().setCountryNote("FRA", "onglet 2");
    expect(await second.persistence.flush()).toBe(false);
    expect(second.store.getState().saveStatus).toBe(MAP_CONFLICT);
    expect(MAP_CONFLICT).toContain("sur un autre appareil ou dans un autre onglet");
    expect(await local.getActiveId()).toBeNull();

    // Onglet 1 enregistre encore : la carte active est réécrite dans la base partagée.
    store.getState().setCountryNote("FRA", "onglet 1 bis");
    expect(await persistence.flush()).toBe(true);
    expect(await bankNotes(remote, id)).toEqual({ FRA: "onglet 1 bis" });
    expect(await local.getActiveId()).toBe(id);
    expect(await local.getSyncBase()).toMatchObject({ id });
    expect(await local.getPendingSync()).toBe(false);
    persistence.dispose();
    second.persistence.dispose();

    // Rechargement de l'onglet 1 : la carte est toujours celle de la banque.
    const next = await reload(repo);
    expect(next.store.getState().activeMapId).toBe(id);
    expect(next.store.getState().doc.notes).toEqual({ FRA: "onglet 1 bis" });
    next.store.getState().setCountryNote("FRA", "suite");
    expect(await next.persistence.flush()).toBe(true);
    expect(await bankNotes(remote, id)).toEqual({ FRA: "suite" });
  });

  it("une autre carte rattachée par l'autre onglet est d'abord détachée : son brouillon n'est jamais renvoyé ailleurs", async () => {
    const { local, remote, repo, store, persistence } = await setup();
    await persistence.saveToBank("Sahel");
    const first = store.getState().activeMapId!;
    const second = await reload(repo);
    // L'onglet 2 ouvre une autre carte de la banque : elle devient la carte active de la base partagée.
    const other = await remote.store.create("Autre", blankDoc());
    expect(await second.persistence.openMap(other.id)).toBe("opened");
    expect(await local.getActiveId()).toBe(other.id);

    // L'onglet 1 modifie sa carte : l'envoi part vers sa carte, et la base partagée la suit.
    store.getState().setCountryNote("FRA", "onglet 1");
    expect(await persistence.flush()).toBe(true);
    expect(await bankNotes(remote, first)).toEqual({ FRA: "onglet 1" });
    expect(await bankNotes(remote, other.id)).toEqual({});
    expect(await local.getActiveId()).toBe(first);
    expect(await local.getSyncBase()).toMatchObject({ id: first });
  });
});

describe("profils de sauvegarde", () => {
  it("démo : réglages de la bêta ; compte : délai plus long et banque distante", () => {
    expect(persistenceOptionsFor({ kind: "demo" })).toMatchObject({ delay: 250 });
    expect(persistenceOptionsFor({ kind: "demo" }).remote).toBeUndefined();
    expect(persistenceOptionsFor({ kind: "account", userId: "u" })).toMatchObject({ delay: 1000 });
    expect(idleStatus({ kind: "demo" }, true)).toBe("Enregistrement automatique dans ce navigateur");
    expect(idleStatus({ kind: "account", userId: "u" }, true)).toBe("Enregistrement automatique dans votre compte");
    // Sans carte active, seul le brouillon local est enregistré automatiquement.
    expect(idleStatus({ kind: "account", userId: "u" }, false)).toBe("Enregistrement automatique dans ce navigateur");
  });

  it("décrit chaque erreur distante ; seules les pannes passagères sont réessayées", () => {
    expect(describeRemoteError(new RemoteBankError("network"))).toEqual({ status: REMOTE_OFFLINE, retry: true });
    expect(describeRemoteError(new RemoteBankError("unavailable"))).toEqual({ status: REMOTE_OFFLINE, retry: true });
    expect(describeRemoteError(new Error("autre"))).toEqual({ status: REMOTE_OFFLINE, retry: true });
    expect(describeRemoteError(new RemoteBankError("unauthorized")).retry).toBe(false);
    expect(describeRemoteError(new RemoteBankError("too-large"))).toEqual({ status: REMOTE_TOO_LARGE, retry: false });
    expect(describeRemoteError(new RemoteBankError("invalid")).retry).toBe(false);
    expect(describeRemoteError(new RemoteBankError("quota")).retry).toBe(false);
    expect(describeRemoteError(new RemoteBankError("conflict"))).toEqual({ status: MAP_CONFLICT, retry: false });
  });
});
