import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { addPing } from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import { openDB } from "idb";
import type { MapDoc } from "@/features/map-doc/types";
import { UNREADABLE_DRAFT_PREFIX, createIndexedDbRepository } from "./indexeddb";

let n = 0;
// Une base neuve par test, et une horloge qui avance d'une minute à chaque écriture.
const fresh = () => {
  let t = Date.UTC(2026, 0, 1);
  return createIndexedDbRepository({ dbName: `test-${++n}`, now: () => new Date((t += 60_000)) });
};

describe("dépôt IndexedDB", () => {
  it("crée, lit et liste les cartes de la plus récente à la plus ancienne", async () => {
    const repo = fresh();
    const a = await repo.create("Carte A", blankDoc());
    const b = await repo.create("Carte B", addPing(blankDoc(), [1, 2], "crise", "p1")!.doc);
    expect(a.id).not.toBe(b.id);
    expect((await repo.list()).map((e) => e.name)).toEqual(["Carte B", "Carte A"]);
    expect(((await repo.get(b.id))?.data as MapDoc).pings[0].type).toBe("crise");
    expect(await repo.get("absent")).toBeNull();
  });

  it("met à jour le contenu et la date d'une carte existante seulement", async () => {
    const repo = fresh();
    const a = await repo.create("Carte A", blankDoc());
    await repo.create("Carte B", blankDoc());
    const updated = await repo.update(a.id, addPing(blankDoc(), [0, 0], "armes")!.doc);
    expect(updated && updated.updated > a.updated).toBe(true);
    expect((await repo.list())[0].id).toBe(a.id);
    expect(await repo.update("absent", blankDoc())).toBeNull();
    expect(await repo.list()).toHaveLength(2);
  });

  it("crée une carte avec un id imposé", async () => {
    const repo = fresh();
    await repo.create("Carte sans titre", blankDoc(), "abc123");
    expect((await repo.get("abc123"))?.name).toBe("Carte sans titre");
  });

  it("renomme et supprime", async () => {
    const repo = fresh();
    const a = await repo.create("Carte A", blankDoc());
    expect((await repo.rename(a.id, "Nouveau nom"))?.name).toBe("Nouveau nom");
    expect((await repo.get(a.id))?.name).toBe("Nouveau nom");
    expect(await repo.rename("absent", "x")).toBeNull();
    await repo.remove(a.id);
    expect(await repo.list()).toEqual([]);
    await expect(repo.remove("absent")).resolves.toBeUndefined();
  });

  it("enregistre le brouillon et l'id de la carte active", async () => {
    const repo = fresh();
    expect(await repo.getDraft()).toBeNull();
    expect(await repo.getActiveId()).toBeNull();
    const doc = addPing(blankDoc(), [3, 4], "maritime", "p1")!.doc;
    await repo.setDraft(doc);
    expect(await repo.getDraft()).toEqual(doc);
    await repo.setActiveId("abc");
    expect(await repo.getActiveId()).toBe("abc");
    await repo.setActiveId(null);
    expect(await repo.getActiveId()).toBeNull();
  });

  it("met de côté le brouillon courant en le déplaçant", async () => {
    const dbName = `test-${++n}`;
    const repo = createIndexedDbRepository({ dbName });
    const bad = { notes: "x" };
    await repo.setDraft(bad as unknown as MapDoc);
    await repo.setAsideDraft();
    expect(await repo.getDraft()).toBeNull();
    // Sans brouillon, rien n'est mis de côté.
    await repo.setAsideDraft();
    const db = await openDB(dbName);
    const keys = (await db.getAllKeys("meta")).map(String);
    expect(keys).toHaveLength(1);
    expect(keys[0].startsWith(UNREADABLE_DRAFT_PREFIX)).toBe(true);
    expect(await db.get("meta", keys[0])).toEqual(bad);
    db.close();
  });

  it("renvoie les entrées sans les valider, même corrompues", async () => {
    const repo = fresh();
    await repo.create("Corrompue", {} as MapDoc, "x");
    await repo.create("Carte", blankDoc(), "y");
    const list = await repo.list();
    expect(list.map((e) => e.id)).toEqual(["y", "x"]);
    expect(list[1].data).toEqual({});
  });

  it("conserve les données entre deux ouvertures de la base", async () => {
    const name = `test-persist-${++n}`;
    const first = createIndexedDbRepository({ dbName: name });
    await first.create("Carte", blankDoc(), "m1");
    const second = createIndexedDbRepository({ dbName: name });
    expect((await second.get("m1"))?.name).toBe("Carte");
  });

  it("répare une base vide en version 1 (sans tables) et garde les données d'une base en version 1", async () => {
    const empty = `vide-${++n}`;
    (await openDB(empty, 1)).close();
    const repaired = createIndexedDbRepository({ dbName: empty });
    await repaired.setDraft(blankDoc());
    expect(await repaired.getDraft()).toEqual(blankDoc());

    const old = `ancienne-${++n}`;
    const v1 = await openDB(old, 1, {
      upgrade(database) {
        database.createObjectStore("maps", { keyPath: "id" }).createIndex("updated", "updated");
        database.createObjectStore("meta");
      },
    });
    await v1.put("maps", { id: "m1", name: "Carte", updated: "2026-01-01T00:00:00.000Z", version: "1", data: blankDoc() });
    v1.close();
    expect((await createIndexedDbRepository({ dbName: old }).get("m1"))?.name).toBe("Carte");
  });
});
