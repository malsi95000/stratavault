import "fake-indexeddb/auto";
import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { addPing } from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import { createIndexedDbRepository } from "@/features/storage";
import type { MapRepository } from "@/features/storage";
import { UNREADABLE_DRAFT_PREFIX } from "@/features/storage/indexeddb";
import {
  LOAD_FAILED,
  LOAD_UNREADABLE,
  SAVE_FAILED,
  SAVE_OK,
  bankCreated,
  bankUpdated,
  createPersistence,
} from "./persistence";
import { createEditorStore } from "./store";

let n = 0;
const setup = async (prepare?: (repo: MapRepository) => Promise<void>) => {
  const dbName = `persist-${++n}`;
  const repo = createIndexedDbRepository({ dbName });
  await prepare?.(repo);
  const store = createEditorStore();
  const persistence = createPersistence(repo, store, { delay: 0 });
  await persistence.hydrate();
  return { repo, store, persistence, dbName };
};

// Document que le schéma refuse (note trop longue), écrit directement dans la base.
const unreadable = (): MapDoc => {
  const doc = addPing(blankDoc(), [1, 1], "crise", "p1")!.doc;
  return { ...doc, notes: { FRA: "x".repeat(100_001) } };
};

const metaKeys = async (dbName: string) => {
  const db = await openDB(dbName);
  const keys = (await db.getAllKeys("meta")).map(String);
  db.close();
  return keys;
};

const unreadableDrafts = async (dbName: string) => {
  const db = await openDB(dbName);
  const keys = (await db.getAllKeys("meta")).map(String).filter((k) => k.startsWith(UNREADABLE_DRAFT_PREFIX));
  const values = await Promise.all(keys.map((k) => db.get("meta", k)));
  db.close();
  return values;
};

describe("persistance de l'éditeur", () => {
  it("hydrate depuis le brouillon et la carte active", async () => {
    const doc = addPing(blankDoc(), [1, 1], "crise", "p1")!.doc;
    const { store } = await setup(async (repo) => {
      await repo.setDraft(doc);
      await repo.create("Carte", doc, "m1");
      await repo.setActiveId("m1");
    });
    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().doc).toEqual(doc);
    expect(store.getState().activeMapId).toBe("m1");
  });

  it("ignore un brouillon invalide et une carte active disparue", async () => {
    const { store } = await setup(async (repo) => {
      await repo.setActiveId("disparue");
      // Brouillon corrompu écrit directement dans la base.
      await repo.setDraft({ notes: "x" } as unknown as MapDoc);
    });
    expect(store.getState().doc).toEqual(blankDoc());
    expect(store.getState().activeMapId).toBeNull();
  });

  it("brouillon illisible : le met de côté et reprend la carte active, sans rien écraser", async () => {
    const saved = addPing(blankDoc(), [3, 3], "armes", "p3")!.doc;
    const bad = unreadable();
    const { repo, store, persistence, dbName } = await setup(async (r) => {
      await r.create("Carte", saved, "m1");
      await r.setActiveId("m1");
      await r.setDraft(bad);
    });
    expect(store.getState().doc).toEqual(saved);
    expect(store.getState().activeMapId).toBe("m1");
    expect(store.getState().saveStatus).toBe(LOAD_UNREADABLE);
    expect(await unreadableDrafts(dbName)).toEqual([bad]);
    store.getState().setCountryDate("DEU", "2024-01-01");
    await persistence.flush();
    expect((await repo.get("m1"))?.data).toEqual({ ...saved, dates: { DEU: "2024-01-01" } });
    expect(await unreadableDrafts(dbName)).toEqual([bad]);
  });

  it("carte active illisible : n'est plus la carte active et n'est jamais écrasée", async () => {
    const bad = unreadable();
    const { repo, store, persistence, dbName } = await setup(async (r) => {
      await r.create("Carte", bad, "m1");
      await r.setActiveId("m1");
      await r.setDraft(bad);
    });
    expect(store.getState().doc).toEqual(blankDoc());
    expect(store.getState().activeMapId).toBeNull();
    expect(store.getState().saveStatus).toBe(LOAD_UNREADABLE);
    expect(await repo.getActiveId()).toBeNull();
    store.getState().setCountryNote("DEU", "a");
    await persistence.flush();
    expect((await repo.get("m1"))?.data).toEqual(bad);
    expect(await unreadableDrafts(dbName)).toEqual([bad]);
    // Rechargement : la carte illisible ne redevient pas active.
    const again = createEditorStore();
    await createPersistence(repo, again, { delay: 0 }).hydrate();
    expect(again.getState().doc.notes).toEqual({ DEU: "a" });
    expect(again.getState().activeMapId).toBeNull();
  });

  it("une note trop longue ne fait plus perdre la carte au rechargement", async () => {
    const { repo, store, persistence } = await setup();
    store.getState().placePing([1, 1]);
    store.getState().setCountryNote("FRA", "x".repeat(100_001));
    expect(await persistence.saveToBank("Ma carte")).toBe("created");
    await persistence.flush();
    const again = createEditorStore();
    await createPersistence(repo, again, { delay: 0 }).hydrate();
    expect(again.getState().doc).toEqual(store.getState().doc);
    expect(again.getState().doc.notes.FRA).toHaveLength(100_000);
    expect(again.getState().activeMapId).toBe(store.getState().activeMapId);
  });

  it("sauvegarde automatiquement le brouillon et la carte active", async () => {
    const { repo, store, persistence } = await setup(async (r) => {
      await r.create("Carte", blankDoc(), "m1");
      await r.setActiveId("m1");
    });
    store.getState().setCountryNote("FRA", "Note");
    expect(await persistence.flush()).toBe(true);
    expect(store.getState().saveStatus).toBe(SAVE_OK);
    expect(await repo.getDraft()).toEqual({ ...blankDoc(), notes: { FRA: "Note" } });
    expect(((await repo.get("m1"))?.data as MapDoc).notes).toEqual({ FRA: "Note" });
  });

  it("enchaîne la sauvegarde après le délai sans appel explicite", async () => {
    const { repo, store } = await setup();
    store.getState().setCountryDate("FRA", "2024-01-01");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await repo.getDraft()).toEqual({ ...blankDoc(), dates: { FRA: "2024-01-01" } });
  });

  it("affiche l'erreur d'enregistrement", async () => {
    const { repo, store, persistence } = await setup();
    repo.setDraft = () => Promise.reject(new Error("quota"));
    store.getState().setCountryNote("FRA", "Note");
    expect(await persistence.flush()).toBe(false);
    expect(store.getState().saveStatus).toBe(SAVE_FAILED);
  });

  it("enregistre dans la banque puis met à jour", async () => {
    const { repo, store, persistence } = await setup();
    store.getState().setCountryNote("FRA", "Note");
    expect(persistence.needsBankPrompt()).toBe(true);
    expect(await persistence.saveToBank()).toBe("needs-name");
    expect(await persistence.saveToBank("  Ma carte ")).toBe("created");
    expect(store.getState().saveStatus).toBe(bankCreated("Ma carte"));
    const id = store.getState().activeMapId;
    expect(id).not.toBeNull();
    expect(await repo.getActiveId()).toBe(id);
    expect(persistence.needsBankPrompt()).toBe(false);
    expect(await persistence.saveToBank()).toBe("updated");
    expect(store.getState().saveStatus).toBe(bankUpdated("Ma carte"));
  });

  it("ouvre une carte, en démarre une nouvelle, renomme et supprime", async () => {
    const other = addPing(blankDoc(), [2, 2], "maritime", "p9")!.doc;
    const { repo, store, persistence } = await setup(async (r) => {
      await r.create("Autre", other, "m2");
    });
    expect(await persistence.openMap("absent")).toBe("unavailable");
    // Carte illisible : rien ne change, ni l'éditeur ni la carte.
    const bad = unreadable();
    await repo.create("Illisible", bad, "m3");
    expect(await persistence.openMap("m3")).toBe("unavailable");
    expect(store.getState().doc).toEqual(blankDoc());
    expect(store.getState().activeMapId).toBeNull();
    expect((await repo.get("m3"))?.data).toEqual(bad);
    expect(await persistence.openMap("m2")).toBe("opened");
    expect(store.getState().doc).toEqual(other);
    expect(store.getState().activeMapId).toBe("m2");
    expect(await repo.getDraft()).toEqual(other);

    expect(await persistence.renameMap("m2", "  ")).toBe(false);
    expect(await persistence.renameMap("m2", "Renommée")).toBe(true);
    expect((await repo.get("m2"))?.name).toBe("Renommée");

    await persistence.deleteMap("m2");
    expect(store.getState().activeMapId).toBeNull();
    expect(await repo.getActiveId()).toBeNull();

    expect(await persistence.newMap()).toBe("done");
    expect(store.getState().doc).toEqual(blankDoc());
  });

  it("brouillon illisible : déplacé une seule fois, pas recopié à chaque chargement", async () => {
    const bad = unreadable();
    const { repo, dbName } = await setup(async (r) => {
      await r.setDraft(bad);
    });
    for (let i = 0; i < 2; i++) await createPersistence(repo, createEditorStore(), { delay: 0 }).hydrate();
    expect(await unreadableDrafts(dbName)).toEqual([bad]);
    expect(await metaKeys(dbName)).not.toContain("draft");
  });

  it("lecture de la carte active impossible : garde le brouillon, n'écrit rien, ne perd rien au rechargement", async () => {
    const work = addPing(blankDoc(), [1, 1], "crise", "pWORK")!.doc;
    const saved = addPing(blankDoc(), [2, 2], "armes", "pBANK")!.doc;
    const repo = createIndexedDbRepository({ dbName: `persist-${++n}` });
    await repo.create("Carte", saved, "m1");
    await repo.setActiveId("m1");
    await repo.setDraft(work);
    const get = repo.get.bind(repo);
    repo.get = () => Promise.reject(new Error("Failed to read large IndexedDB value"));

    const store = createEditorStore();
    const persistence = createPersistence(repo, store, { delay: 0 });
    await persistence.hydrate();
    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().doc).toEqual(work);
    expect(store.getState().activeMapId).toBeNull();
    expect(store.getState().saveStatus).toBe(LOAD_FAILED);

    store.getState().setCountryNote("FRA", "x");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await persistence.flush()).toBe(false);
    expect(await repo.getDraft()).toEqual(work);
    expect(await repo.getActiveId()).toBe("m1");

    // Rechargement une fois la lecture rétablie : brouillon et carte de la banque intacts.
    repo.get = get;
    const again = createEditorStore();
    const next = createPersistence(repo, again, { delay: 0 });
    await next.hydrate();
    expect(again.getState().doc).toEqual(work);
    expect(again.getState().activeMapId).toBe("m1");
    expect((await repo.get("m1"))?.data).toEqual(saved);
  });

  it("lecture du brouillon impossible : document vierge, rien n'est écrit jusqu'à une action explicite", async () => {
    const work = addPing(blankDoc(), [1, 1], "crise", "pWORK")!.doc;
    const other = addPing(blankDoc(), [2, 2], "maritime", "p9")!.doc;
    const repo = createIndexedDbRepository({ dbName: `persist-${++n}` });
    await repo.setDraft(work);
    await repo.create("Autre", other, "m2");
    const getDraft = repo.getDraft.bind(repo);
    repo.getDraft = () => Promise.reject(new Error("lecture"));
    const store = createEditorStore();
    const persistence = createPersistence(repo, store, { delay: 0 });
    await persistence.hydrate();
    expect(store.getState().doc).toEqual(blankDoc());
    expect(store.getState().saveStatus).toBe(LOAD_FAILED);

    store.getState().setCountryNote("FRA", "x");
    expect(await persistence.flush()).toBe(false);
    expect(await getDraft()).toEqual(work);
    // Changer de carte demande de confirmer la perte des modifications non enregistrées.
    expect(await persistence.openMap("m2")).toBe("unsaved");
    expect(store.getState().doc.notes).toEqual({ FRA: "x" });
    expect(await persistence.openMap("m2", { discard: true })).toBe("opened");
    expect(store.getState().doc).toEqual(other);
    // La sauvegarde automatique a repris.
    store.getState().setCountryNote("DEU", "y");
    expect(await persistence.flush()).toBe(true);
    expect(await getDraft()).toEqual({ ...other, notes: { DEU: "y" } });
    expect((await repo.get("m2"))?.data).toEqual({ ...other, notes: { DEU: "y" } });
  });

  it("importer reprend la sauvegarde automatique après un échec de lecture", async () => {
    const imported = addPing(blankDoc(), [4, 4], "crise", "pIMP")!.doc;
    const repo = createIndexedDbRepository({ dbName: `persist-${++n}` });
    repo.getActiveId = () => Promise.reject(new Error("lecture"));
    const store = createEditorStore();
    const persistence = createPersistence(repo, store, { delay: 0 });
    await persistence.hydrate();
    expect(store.getState().saveStatus).toBe(LOAD_FAILED);
    await persistence.importDoc(imported);
    expect(await persistence.flush()).toBe(true);
    expect(await repo.getDraft()).toEqual(imported);
  });

  it("importer avant la fin du chargement : l'import n'est pas remplacé par le brouillon et il est enregistré", async () => {
    const draft = addPing(blankDoc(), [1, 1], "crise", "pDRAFT")!.doc;
    const imported = addPing(blankDoc(), [4, 4], "crise", "pIMP")!.doc;
    const repo = createIndexedDbRepository({ dbName: `persist-${++n}` });
    await repo.setDraft(draft);
    const store = createEditorStore();
    const persistence = createPersistence(repo, store, { delay: 0 });
    // Pas d'appel préalable à hydrate() : l'import l'attend lui-même.
    await persistence.importDoc(imported);
    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().doc).toEqual(imported);
    expect(await persistence.flush()).toBe(true);
    expect(await repo.getDraft()).toEqual(imported);
  });

  it("enregistrer dans la banque après un échec de lecture : le brouillon devient la copie de la nouvelle carte", async () => {
    const work = addPing(blankDoc(), [1, 1], "crise", "pWORK")!.doc;
    const saved = addPing(blankDoc(), [2, 2], "armes", "pBANK")!.doc;
    const repo = createIndexedDbRepository({ dbName: `persist-${++n}` });
    await repo.create("Carte", saved, "m1");
    await repo.setActiveId("m1");
    await repo.setDraft(work);
    const get = repo.get.bind(repo);
    repo.get = () => Promise.reject(new Error("lecture"));
    const store = createEditorStore();
    const persistence = createPersistence(repo, store, { delay: 0 });
    await persistence.hydrate();
    expect(store.getState().saveStatus).toBe(LOAD_FAILED);
    repo.get = get;

    store.getState().placePing([5, 5]);
    const current = store.getState().doc;
    expect(current.pings).toHaveLength(2);
    expect(await persistence.saveToBank("Nouvelle")).toBe("created");
    expect(store.getState().saveStatus).toBe(bankCreated("Nouvelle"));
    const id = store.getState().activeMapId!;
    expect(await repo.getDraft()).toEqual(current);
    expect((await repo.get(id))?.data).toEqual(current);
    expect((await repo.get("m1"))?.data).toEqual(saved);

    // Rechargement : la nouvelle carte s'affiche telle qu'enregistrée et le reste après une modification.
    const again = createEditorStore();
    const next = createPersistence(repo, again, { delay: 0 });
    await next.hydrate();
    expect(again.getState().activeMapId).toBe(id);
    expect(again.getState().doc).toEqual(current);
    again.getState().setCountryNote("FRA", "x");
    expect(await next.flush()).toBe(true);
    expect((await repo.get(id))?.data).toEqual({ ...current, notes: { FRA: "x" } });
  });

  it("enregistrer dans la banque après un échec de lecture du brouillon : l'ancien brouillon ne revient pas", async () => {
    const work = addPing(blankDoc(), [1, 1], "crise", "pWORK")!.doc;
    const repo = createIndexedDbRepository({ dbName: `persist-${++n}` });
    await repo.setDraft(work);
    const getDraft = repo.getDraft.bind(repo);
    repo.getDraft = () => Promise.reject(new Error("lecture"));
    const store = createEditorStore();
    const persistence = createPersistence(repo, store, { delay: 0 });
    await persistence.hydrate();
    expect(store.getState().doc).toEqual(blankDoc());
    repo.getDraft = getDraft;

    store.getState().setCountryNote("DEU", "y");
    const current = store.getState().doc;
    expect(await persistence.saveToBank("Nouvelle")).toBe("created");
    const id = store.getState().activeMapId!;
    const again = createEditorStore();
    await createPersistence(repo, again, { delay: 0 }).hydrate();
    expect(again.getState().activeMapId).toBe(id);
    expect(again.getState().doc).toEqual(current);
  });

  it("échec de lecture, modification, enregistrement dans la banque, rechargement : la carte enregistrée fait foi", async () => {
    const work = addPing(blankDoc(), [1, 1], "crise", "pWORK")!.doc;
    const saved = addPing(blankDoc(), [2, 2], "armes", "pBANK")!.doc;
    const repo = createIndexedDbRepository({ dbName: `persist-${++n}` });
    await repo.create("Carte", saved, "m1");
    await repo.setActiveId("m1");
    await repo.setDraft(work);
    const getActiveId = repo.getActiveId.bind(repo);
    repo.getActiveId = () => Promise.reject(new Error("lecture"));
    const store = createEditorStore();
    const persistence = createPersistence(repo, store, { delay: 0 });
    await persistence.hydrate();
    expect(store.getState().saveStatus).toBe(LOAD_FAILED);
    repo.getActiveId = getActiveId;

    store.getState().setCountryNote("FRA", "a");
    expect(await persistence.saveToBank("Nouvelle")).toBe("created");
    const id = store.getState().activeMapId!;
    // Nouvelle modification dans la même session.
    store.getState().setCountryDate("FRA", "2024-05-01");
    expect(await persistence.flush()).toBe(true);
    const current = store.getState().doc;
    expect((await repo.get(id))?.data).toEqual(current);
    expect((await repo.get("m1"))?.data).toEqual(saved);

    const again = createEditorStore();
    const next = createPersistence(repo, again, { delay: 0 });
    await next.hydrate();
    expect(again.getState().activeMapId).toBe(id);
    expect(again.getState().doc).toEqual(current);
    again.getState().setCountryNote("DEU", "b");
    expect(await next.flush()).toBe(true);
    expect((await repo.get(id))?.data).toEqual({ ...current, notes: { ...current.notes, DEU: "b" } });
    expect((await repo.get("m1"))?.data).toEqual(saved);
  });

  it("enregistrement dans la banque dont l'écriture du brouillon échoue : l'ancien brouillon n'écrase pas la nouvelle carte", async () => {
    const work = addPing(blankDoc(), [1, 1], "crise", "pWORK")!.doc;
    const saved = addPing(blankDoc(), [2, 2], "armes", "pBANK")!.doc;
    const repo = createIndexedDbRepository({ dbName: `persist-${++n}` });
    await repo.create("Carte", saved, "m1");
    await repo.setActiveId("m1");
    await repo.setDraft(work);
    const get = repo.get.bind(repo);
    repo.get = () => Promise.reject(new Error("lecture"));
    const store = createEditorStore();
    const persistence = createPersistence(repo, store, { delay: 0 });
    await persistence.hydrate();
    repo.get = get;

    store.getState().placePing([5, 5]);
    const current = store.getState().doc;
    const setDraft = repo.setDraft.bind(repo);
    repo.setDraft = () => Promise.reject(new Error("quota"));
    expect(await persistence.saveToBank("Nouvelle")).toBe("created");
    expect(store.getState().saveStatus).toBe(SAVE_FAILED);
    const id = store.getState().activeMapId!;
    expect((await repo.get(id))?.data).toEqual(current);
    repo.setDraft = setDraft;

    // Rechargement sans nouvelle écriture réussie : l'ancien brouillon n'est rattaché à aucune carte.
    const again = createEditorStore();
    const next = createPersistence(repo, again, { delay: 0 });
    await next.hydrate();
    expect(again.getState().activeMapId).not.toBe(id);
    again.getState().setCountryNote("DEU", "b");
    expect(await next.flush()).toBe(true);
    expect((await repo.get(id))?.data).toEqual(current);
    expect((await repo.get("m1"))?.data).toEqual(saved);

    // Une écriture qui réussit ensuite rattache bien la carte : elle s'affiche au rechargement suivant.
    expect(await persistence.flush()).toBe(true);
    const third = createEditorStore();
    await createPersistence(repo, third, { delay: 0 }).hydrate();
    expect(third.getState().activeMapId).toBe(id);
    expect(third.getState().doc).toEqual(current);
  });

  it("enregistrer dans la banque après un échec d'écriture : le brouillon périmé ne prend pas la place de la carte", async () => {
    const { repo, store, persistence } = await setup();
    store.getState().setCountryNote("FRA", "ancien");
    expect(await persistence.flush()).toBe(true);
    const setDraft = repo.setDraft.bind(repo);
    repo.setDraft = () => Promise.reject(new Error("quota"));
    store.getState().setCountryNote("FRA", "nouveau");
    expect(await persistence.flush()).toBe(false);
    const current = store.getState().doc;
    expect(await persistence.saveToBank("Carte")).toBe("created");
    const id = store.getState().activeMapId!;
    repo.setDraft = setDraft;
    const again = createEditorStore();
    const next = createPersistence(repo, again, { delay: 0 });
    await next.hydrate();
    if (again.getState().activeMapId === id) expect(again.getState().doc).toEqual(current);
    again.getState().setCountryDate("FRA", "2024-01-01");
    expect(await next.flush()).toBe(true);
    if (again.getState().activeMapId !== id) expect((await repo.get(id))?.data).toEqual(current);
  });

  it("rouvrir la carte active garde la modification en attente", async () => {
    const repo = createIndexedDbRepository({ dbName: `persist-${++n}` });
    const store = createEditorStore();
    // Délai long : la modification est encore en attente au moment de l'ouverture.
    const persistence = createPersistence(repo, store, { delay: 60_000 });
    await persistence.hydrate();
    expect(await persistence.saveToBank("A")).toBe("created");
    const id = store.getState().activeMapId!;
    store.getState().setCountryNote("FRA", "x");
    expect(await persistence.openMap(id)).toBe("opened");
    expect(store.getState().doc.notes).toEqual({ FRA: "x" });
    expect(((await repo.get(id))?.data as MapDoc).notes).toEqual({ FRA: "x" });
    expect(((await repo.getDraft()) as MapDoc).notes).toEqual({ FRA: "x" });
    persistence.dispose();
  });

  it("n'abandonne pas des modifications non enregistrées en changeant de carte", async () => {
    const other = addPing(blankDoc(), [2, 2], "maritime", "p9")!.doc;
    const { repo, store, persistence } = await setup(async (r) => {
      await r.create("Autre", other, "mB");
    });
    const setDraft = repo.setDraft.bind(repo);
    repo.setDraft = () => Promise.reject(new Error("quota"));
    store.getState().setCountryNote("FRA", "Note");
    expect(await persistence.openMap("mB")).toBe("unsaved");
    expect(store.getState().doc.notes).toEqual({ FRA: "Note" });
    expect(store.getState().activeMapId).toBeNull();
    expect(await persistence.newMap()).toBe("unsaved");
    expect(store.getState().doc.notes).toEqual({ FRA: "Note" });
    // L'écriture refonctionne : flush() réessaie sans attendre une nouvelle modification.
    repo.setDraft = setDraft;
    expect(await persistence.flush()).toBe(true);
    expect(store.getState().saveStatus).toBe(SAVE_OK);
    expect((await repo.getDraft() as MapDoc).notes).toEqual({ FRA: "Note" });
    expect(await persistence.openMap("mB")).toBe("opened");
    expect(store.getState().doc).toEqual(other);
  });

  it("une écriture échouée est réessayée par le changement de carte", async () => {
    const { repo, store, persistence } = await setup();
    const setDraft = repo.setDraft.bind(repo);
    repo.setDraft = () => Promise.reject(new Error("quota"));
    store.getState().setCountryNote("FRA", "Note");
    expect(await persistence.flush()).toBe(false);
    repo.setDraft = setDraft;
    // Aucune nouvelle modification : newMap() réécrit le document avant de le remplacer.
    expect(await persistence.newMap()).toBe("done");
    expect(store.getState().doc).toEqual(blankDoc());
  });
});
