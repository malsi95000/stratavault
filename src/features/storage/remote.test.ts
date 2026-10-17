import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { COUNTRIES } from "@/data/countries";
import { addPing } from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import type { MapActionResult, RemoteMapInfo } from "@/features/maps/types";
import {
  DEMO_MODE,
  USER_DB_PREFIX,
  createRepositoryFor,
  localDbName,
  otherUsersDatabases,
  storageKey,
  storageModeOf,
} from "./mode";
import { RemoteBankError, createRemoteBank } from "./remote";
import { MapConflictError } from "./types";
import type { RemoteMapsApi } from "./remote";

const ok = <T>(value: T): MapActionResult<T> => ({ ok: true, value });
const INFO: RemoteMapInfo = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Sahel",
  updated: "2026-10-05T12:00:00.000Z",
  revision: 3,
};
/** INFO vue par la banque générique : la révision devient la version, en texte. */
const ENTRY = { id: INFO.id, name: INFO.name, updated: INFO.updated, version: "3" };

/** Server Actions simulées : chaque appel est enregistré. */
function fakeApi(overrides: Partial<RemoteMapsApi> = {}) {
  const api: RemoteMapsApi = {
    listMaps: vi.fn(async () => ok([{ ...INFO, stats: "1 pays annotés", cover: null }])),
    getMap: vi.fn(async () => ok({ ...INFO, data: blankDoc() })),
    createMap: vi.fn(async () => ok(INFO)),
    updateMap: vi.fn(async () => ok(INFO)),
    renameMap: vi.fn(async () => ok({ ...INFO, name: "Nouveau" })),
    setMapCover: vi.fn(async () => ok(true)),
    deleteMap: vi.fn(async () => ok(null)),
    ...overrides,
  };
  return api;
}

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const doc = (): MapDoc => addPing(blankDoc(), [1, 2], "crise", "p1")!.doc;

describe("banque distante", () => {
  it("liste les cartes sans leur contenu, avec les statistiques du serveur", async () => {
    const bank = createRemoteBank(fakeApi(), USER);
    expect(await bank.list()).toEqual([{ ...ENTRY, stats: "1 pays annotés", data: null }]);
  });

  it("liste le logo validé par le serveur et transmet un changement de logo", async () => {
    const cover = { kind: "icon" as const, icon: "anchor" as const, color: "corail" as const };
    const api = fakeApi({ listMaps: vi.fn(async () => ok([{ ...INFO, stats: null, cover }])) });
    const bank = createRemoteBank(api, USER);
    expect(await bank.list()).toEqual([{ ...ENTRY, stats: null, data: null, cover }]);
    expect(await bank.setCover(INFO.id, cover)).toBe(true);
    expect(api.setMapCover).toHaveBeenCalledWith(USER, INFO.id, cover);
    await bank.setCover(INFO.id, null);
    expect(api.setMapCover).toHaveBeenLastCalledWith(USER, INFO.id, null);
    const refused = createRemoteBank(fakeApi({ setMapCover: async () => ({ ok: false, error: "invalid" }) }), USER);
    await expect(refused.setCover(INFO.id, cover)).rejects.toEqual(new RemoteBankError("invalid"));
  });

  it("recompose l'entrée écrite sans que le serveur renvoie le contenu", async () => {
    const api = fakeApi();
    const bank = createRemoteBank(api, USER);
    expect(await bank.create("Sahel", doc())).toEqual({ ...ENTRY, data: doc() });
    expect(await bank.update(INFO.id, doc(), "3")).toEqual({ ...ENTRY, data: doc() });
    expect(await bank.get(INFO.id)).toEqual({ ...ENTRY, data: blankDoc() });
    // Chaque appel désigne le compte pour lequel la page a été ouverte.
    expect(api.updateMap).toHaveBeenCalledWith(USER, INFO.id, doc(), 3);
    // L'identifiant d'une nouvelle carte est toujours choisi par le serveur.
    expect(api.createMap).toHaveBeenCalledWith(USER, "Sahel", doc());
    await bank.create("Sahel", doc(), "m-supprimee");
    expect(api.createMap).toHaveBeenLastCalledWith(USER, "Sahel", doc());
    await bank.list();
    expect(api.listMaps).toHaveBeenCalledWith(USER);
  });

  it("transmet la version attendue et signale un conflit par MapConflictError", async () => {
    const api = fakeApi({ updateMap: vi.fn(async () => ({ ok: false as const, error: "conflict" as const })) });
    const bank = createRemoteBank(api, USER);
    await expect(bank.update(INFO.id, doc(), "3")).rejects.toBeInstanceOf(MapConflictError);
    expect(api.updateMap).toHaveBeenCalledWith(USER, INFO.id, doc(), 3);
  });

  it("version attendue absente ou illisible : conflit, sans aucun envoi (jamais d'écriture sans contrôle)", async () => {
    const api = fakeApi();
    const bank = createRemoteBank(api, USER);
    for (const version of [undefined, "abc", "0", "1.5", "", "-2", "1e400"]) {
      await expect(bank.update(INFO.id, doc(), version)).rejects.toBeInstanceOf(MapConflictError);
    }
    expect(api.updateMap).not.toHaveBeenCalled();
  });

  it("carte absente : null, comme le dépôt local", async () => {
    const bank = createRemoteBank(
      fakeApi({ updateMap: async () => ok(null), renameMap: async () => ok(null), getMap: async () => ok(null) }),
      USER,
    );
    expect(await bank.update(INFO.id, doc(), "3")).toBeNull();
    expect(await bank.rename(INFO.id, "x")).toBeNull();
    expect(await bank.get(INFO.id)).toBeNull();
  });

  it("transforme les refus et les pannes en RemoteBankError", async () => {
    const refused = createRemoteBank(fakeApi({ listMaps: async () => ({ ok: false, error: "unauthorized" }) }), USER);
    await expect(refused.list()).rejects.toEqual(new RemoteBankError("unauthorized"));

    const offline = createRemoteBank(
      fakeApi({ deleteMap: () => Promise.reject(new TypeError("Failed to fetch")) }),
      USER,
    );
    await expect(offline.remove(INFO.id)).rejects.toMatchObject({ reason: "network" });
  });

  it("refuse une carte trop volumineuse avant de l'envoyer", async () => {
    const api = fakeApi();
    const bank = createRemoteBank(api, USER);
    const notes = Object.fromEntries(COUNTRIES.slice(0, 30).map((c) => [c.code, "é".repeat(99_000)]));
    const big: MapDoc = { ...blankDoc(), notes };
    await expect(bank.update(INFO.id, big)).rejects.toMatchObject({ reason: "too-large" });
    await expect(bank.create("Sahel", big)).rejects.toMatchObject({ reason: "too-large" });
    expect(api.updateMap).not.toHaveBeenCalled();
    expect(api.createMap).not.toHaveBeenCalled();
  });
});

describe("choix du dépôt", () => {
  const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("démo : la base historique, sans changement (aucune migration des données existantes)", () => {
    expect(storageModeOf(null)).toEqual(DEMO_MODE);
    expect(localDbName(DEMO_MODE)).toBe("stratavault");
  });

  it("compte : une base locale propre à l'utilisateur", () => {
    const mode = storageModeOf({ userId: ALICE, email: "a@exemple.fr" });
    expect(mode).toEqual({ kind: "account", userId: ALICE });
    expect(localDbName(mode)).toBe(`${USER_DB_PREFIX}${ALICE}`);
    expect(storageKey(mode)).not.toBe(storageKey(DEMO_MODE));
  });

  it("repère les bases laissées par d'autres comptes, jamais la démo ni la sienne", () => {
    const mode = storageModeOf({ userId: ALICE, email: null });
    const names = ["stratavault", `${USER_DB_PREFIX}${ALICE}`, `${USER_DB_PREFIX}bob`, "autre-site"];
    expect(otherUsersDatabases(names, mode)).toEqual([`${USER_DB_PREFIX}bob`]);
    expect(otherUsersDatabases(names, DEMO_MODE)).toEqual([`${USER_DB_PREFIX}${ALICE}`, `${USER_DB_PREFIX}bob`]);
  });

  it("démo : tout reste local, aucune Server Action n'est appelée", async () => {
    const api = fakeApi();
    const repo = createRepositoryFor(DEMO_MODE, { remote: api });
    await repo.create("Locale", doc());
    expect((await repo.list()).map((m) => m.name)).toContain("Locale");
    expect(api.createMap).not.toHaveBeenCalled();
    expect(api.listMaps).not.toHaveBeenCalled();
  });

  it("compte : les cartes passent par les Server Actions, le brouillon reste dans la base de l'utilisateur", async () => {
    const api = fakeApi();
    const alice = createRepositoryFor({ kind: "account", userId: ALICE }, { remote: api });
    await alice.create("Distante", doc());
    expect(api.createMap).toHaveBeenCalledWith(ALICE, "Distante", doc());
    await alice.setDraft(doc());
    await alice.setActiveId(INFO.id);

    // La démo et un autre compte ne voient pas ce brouillon.
    const demo = createRepositoryFor(DEMO_MODE, { remote: api });
    const bob = createRepositoryFor({ kind: "account", userId: "bob" }, { remote: api });
    expect(await demo.getDraft()).not.toEqual(doc());
    expect(await bob.getDraft()).toBeNull();
    expect(await bob.getActiveId()).toBeNull();
    expect(await alice.getDraft()).toEqual(doc());
  });
});
