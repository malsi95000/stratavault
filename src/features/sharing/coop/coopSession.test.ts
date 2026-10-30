// Session de l'éditeur coopératif : chargement, verrou d'édition (prise, renouvellement, inactivité,
// perte), enregistrement avec contrôle de version, rafraîchissement des lecteurs, sortie.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorStore, type EditorStore } from "@/features/editor/store";
import { blankDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import type { CoopResult } from "../coopActions";
import { EDITOR_IDLE_MS, LOCK_LEASE_MS, LOCK_RENEW_MS, REFRESH_MS, SHARED_SAVE_DELAY_MS } from "../limits";
import {
  COOP_CONFLICT,
  COOP_DEMOTED,
  COOP_EDITING,
  COOP_FREE,
  COOP_GONE,
  COOP_IDLE,
  COOP_INVALID,
  COOP_LOST,
  COOP_MINE_ELSEWHERE,
  COOP_QUOTA,
  COOP_READER,
  COOP_REFRESH_FAILED,
  COOP_REFRESH_RATE_LIMITED,
  COOP_SAVED,
  COOP_SAVE_FAILED,
  COOP_TOO_LARGE,
  coopHeldBy,
} from "../messages";
import type { LockResult, MapRole, SharedMapContent, SharedMapState } from "../types";
import { createCoopSession, readOnlyMessage, type CoopApi } from "./coopSession";

const ok = <T>(value: T): CoopResult<T> => ({ ok: true, value });

/** Base simulée : une carte, sa version, un verrou. */
function fakeServer(role: MapRole = "editor") {
  const server = {
    role,
    revision: 10,
    data: blankDoc() as unknown,
    holder: null as "me" | "other" | null,
    /** Bail du titulaire échu (map_sharing_holder ne le voit plus ; il peut être repris). */
    expired: false,
    /** Réseau coupé : toutes les Server Actions échouent. */
    offline: false,
    /** Échec passager des seules prises de verrou. */
    acquireError: false,
    /** Refus des seules lectures de l'état (rafraîchissement). */
    stateError: null as null | "rate-limited" | "unavailable",
    exists: true,
    saves: [] as { doc: MapDoc; revision: number }[],
    releases: 0,
    saveError: null as null | "locked" | "conflict" | "quota" | "too-large" | "invalid" | "unavailable",
  };
  const content = (): SharedMapContent => ({
    id: "m",
    name: "Carte",
    role: server.role,
    revision: server.revision,
    updated: "2026-10-20T10:00:00.000Z",
    data: server.data,
    ownerHandle: "alice",
    ownerName: "Alice",
  });
  const state = (): SharedMapState => ({
    name: "Carte",
    role: server.role,
    revision: server.revision,
    updated: "2026-10-20T10:00:00.000Z",
    lock: server.holder === "me" ? { kind: "mine", expiresAt: "x" } : server.holder === "other" ? { kind: "other", holderName: "Bob" } : { kind: "free" },
  });
  const offline = { ok: false as const, error: "unavailable" as const };
  const api: CoopApi = {
    open: vi.fn(async () => (server.offline ? offline : ok(server.exists ? content() : null))),
    state: vi.fn(async (): Promise<CoopResult<SharedMapState | null>> => {
      if (server.offline) return offline;
      if (server.stateError) return { ok: false, error: server.stateError };
      return ok(server.exists ? state() : null);
    }),
    acquire: vi.fn(async (): Promise<CoopResult<LockResult>> => {
      if (server.offline || server.acquireError) return offline;
      if (!server.exists) return ok({ status: "not-found" });
      if (server.role === "reader") return ok({ status: "read-only" });
      if (server.holder === "other" && !server.expired) return ok({ status: "held", holderName: "Bob" });
      server.holder = "me";
      server.expired = false;
      return ok({ status: "acquired", expiresAt: "2026-10-20T10:02:00.000Z" });
    }),
    release: vi.fn(async () => {
      server.releases += 1;
      const mine = server.holder === "me";
      if (mine) server.holder = null;
      return ok(mine);
    }),
    save: vi.fn(async (doc: MapDoc, revision: number) => {
      if (server.offline) return offline;
      if (server.saveError) return { ok: false as const, error: server.saveError };
      if (server.holder !== "me" || server.expired) return { ok: false as const, error: "locked" as const };
      if (revision !== server.revision) return { ok: false as const, error: "conflict" as const };
      server.saves.push({ doc, revision });
      server.revision += 1;
      server.data = doc;
      return ok({ revision: server.revision, updated: "2026-10-20T10:01:00.000Z" });
    }),
  };
  return { server, api };
}

let store: EditorStore;
let clock = 0;
const now = () => clock;

/** Avance le temps (minuteries et horloge de la session), puis laisse finir les promesses. */
async function advance(ms: number) {
  clock += ms;
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = 0;
  store = createEditorStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ouverture", () => {
  it("un éditeur charge la carte, prend le verrou et peut modifier", async () => {
    const { api } = fakeServer("editor");
    const session = createCoopSession(api, store, now);
    await session.start();
    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().readOnly).toBe(false);
    expect(session.view()).toMatchObject({ phase: "ready", editing: true, role: "editor", name: "Carte", owner: "Alice (@alice)", message: COOP_EDITING });
  });

  it("un lecteur reste en lecture seule et ne prend jamais le verrou", async () => {
    const { api } = fakeServer("reader");
    const session = createCoopSession(api, store, now);
    await session.start();
    expect(api.acquire).not.toHaveBeenCalled();
    expect(store.getState().readOnly).toBe(true);
    expect(session.view()).toMatchObject({ editing: false, message: COOP_READER });
    store.getState().placePoint([2, 48]);
    expect(store.getState().doc.points).toEqual([]);
    await session.take();
    expect(api.acquire).not.toHaveBeenCalled();
  });

  it("à la sortie, le store n'est plus en lecture seule (il sert à l'éditeur du compte ensuite)", async () => {
    const { api } = fakeServer("reader");
    const session = createCoopSession(api, store, now);
    await session.start();
    expect(store.getState().readOnly).toBe(true);
    await session.stop();
    expect(store.getState().readOnly).toBe(false);
  });

  it("verrou tenu par un autre : lecture seule avec son nom", async () => {
    const { server, api } = fakeServer("editor");
    server.holder = "other";
    const session = createCoopSession(api, store, now);
    await session.start();
    expect(store.getState().readOnly).toBe(true);
    expect(session.view()).toMatchObject({ editing: false, lock: { kind: "other", holderName: "Bob" }, message: coopHeldBy("Bob") });
  });

  it("verrou déjà tenu par le compte ailleurs (autre onglet, son espace) : lecture seule, reprise sur demande", async () => {
    const { server, api } = fakeServer("owner");
    server.holder = "me";
    const session = createCoopSession(api, store, now);
    await session.start();
    expect(api.acquire).not.toHaveBeenCalled();
    expect(store.getState().readOnly).toBe(true);
    expect(session.view()).toMatchObject({ phase: "ready", editing: false, lock: { kind: "mine" }, message: COOP_MINE_ELSEWHERE });
    // Le rafraîchissement ne prend pas la main non plus.
    await advance(REFRESH_MS);
    expect(api.acquire).not.toHaveBeenCalled();
    await session.take();
    expect(session.view()).toMatchObject({ editing: true, message: COOP_EDITING });
    expect(store.getState().readOnly).toBe(false);
  });

  it("carte inconnue ou plus accessible : « gone »", async () => {
    const { server, api } = fakeServer();
    server.exists = false;
    const session = createCoopSession(api, store, now);
    await session.start();
    expect(session.view()).toMatchObject({ phase: "gone", message: COOP_GONE });
    expect(store.getState().readOnly).toBe(true);
  });

  it("contenu illisible : échec, rien n'est écrit", async () => {
    const { server, api } = fakeServer();
    server.data = { pas: "une carte" };
    const session = createCoopSession(api, store, now);
    await session.start();
    expect(session.view().phase).toBe("failed");
    expect(api.save).not.toHaveBeenCalled();
  });
});

describe("enregistrement", () => {
  it("les modifications partent après un court délai, avec la version attendue", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    store.getState().placePoint([2, 48]);
    expect(session.view().unsaved).toBe(true);
    await advance(SHARED_SAVE_DELAY_MS);
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].revision).toBe(10);
    expect(session.view()).toMatchObject({ unsaved: false, saveStatus: COOP_SAVED });
    store.getState().placePoint([3, 49]);
    await advance(SHARED_SAVE_DELAY_MS);
    expect(server.saves[1].revision).toBe(11);
  });

  it("verrou perdu à l'enregistrement : lecture seule et carte relue", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    store.getState().placePoint([2, 48]);
    server.holder = "other";
    server.revision = 20;
    await advance(SHARED_SAVE_DELAY_MS);
    expect(session.view()).toMatchObject({ editing: false, notice: COOP_LOST });
    expect(store.getState().readOnly).toBe(true);
    expect(store.getState().doc.points).toEqual([]);
  });

  it("bail échu sans repreneur : il est repris et l'enregistrement passe, rien n'est perdu", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    store.getState().placePoint([2, 48]);
    server.expired = true;
    await advance(SHARED_SAVE_DELAY_MS);
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].doc.points).toHaveLength(1);
    expect(server.holder).toBe("me");
    expect(session.view()).toMatchObject({ editing: true, notice: "", unsaved: false, saveStatus: COOP_SAVED, message: COOP_EDITING });
    expect(store.getState().readOnly).toBe(false);
    expect(store.getState().doc.points).toHaveLength(1);
  });

  it("réseau coupé plus longtemps que le bail : au retour, le bail est repris et les modifications enregistrées", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    server.offline = true;
    store.getState().placePoint([2, 48]);
    // Renouvellements et enregistrements échouent en silence pendant plus de deux minutes.
    await advance(LOCK_LEASE_MS + 10_000);
    expect(session.view()).toMatchObject({ editing: true, unsaved: true, saveStatus: COOP_SAVE_FAILED });
    server.expired = true;
    server.offline = false;
    // Le nouvel essai d'enregistrement part avant le prochain renouvellement.
    await advance(5_000);
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].doc.points).toHaveLength(1);
    expect(session.view()).toMatchObject({ editing: true, notice: "", unsaved: false, saveStatus: COOP_SAVED });
    expect(store.getState().doc.points).toHaveLength(1);
  });

  it("bail échu et carte modifiée entre-temps par un autre membre : conflit, rien n'est écrasé", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    store.getState().placePoint([2, 48]);
    // Bob a repris le bail échu, enregistré, puis rendu la main.
    server.expired = true;
    server.revision = 20;
    await advance(SHARED_SAVE_DELAY_MS);
    expect(server.saves).toHaveLength(0);
    expect(session.view()).toMatchObject({ editing: false, notice: COOP_CONFLICT });
    expect(store.getState().readOnly).toBe(true);
  });

  it("compte passé lecteur pendant l'édition : message propre, pas « un autre membre a pris la main »", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    store.getState().placePoint([2, 48]);
    server.role = "reader";
    server.holder = null;
    await advance(SHARED_SAVE_DELAY_MS);
    expect(session.view()).toMatchObject({ editing: false, role: "reader", notice: COOP_DEMOTED });
    expect(store.getState().readOnly).toBe(true);
  });

  it("verrou refusé puis reprise impossible (échec passager) : nouvel essai, sans perte", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    store.getState().placePoint([2, 48]);
    server.expired = true;
    server.acquireError = true;
    await advance(SHARED_SAVE_DELAY_MS);
    expect(session.view()).toMatchObject({ editing: true, unsaved: true, saveStatus: COOP_SAVE_FAILED });
    server.acquireError = false;
    await advance(5_000);
    expect(server.saves).toHaveLength(1);
    expect(session.view()).toMatchObject({ editing: true, saveStatus: COOP_SAVED });
  });

  it("carte modifiée ailleurs entre-temps (même compte) : message de conflit, pas « un autre membre a pris la main »", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    store.getState().placePoint([2, 48]);
    // Un autre onglet du compte, qui tient le même verrou, a enregistré entre-temps.
    server.revision = 20;
    await advance(SHARED_SAVE_DELAY_MS);
    expect(session.view()).toMatchObject({ editing: false, notice: COOP_CONFLICT });
    expect(store.getState().readOnly).toBe(true);
  });

  it("contenu refusé : message propre à chaque refus (trop grande, invalide)", async () => {
    for (const [error, message] of [
      ["too-large", COOP_TOO_LARGE],
      ["invalid", COOP_INVALID],
    ] as const) {
      const { server, api } = fakeServer();
      const session = createCoopSession(api, store, now);
      await session.start();
      server.saveError = error;
      store.getState().placePoint([2, 48]);
      await advance(SHARED_SAVE_DELAY_MS);
      expect(session.view(), error).toMatchObject({ editing: true, unsaved: false, saveStatus: message, notice: message });
      await session.stop();
      store = createEditorStore();
    }
  });

  it("échec passager : nouvel essai", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    server.saveError = "unavailable";
    store.getState().placePoint([2, 48]);
    await advance(SHARED_SAVE_DELAY_MS);
    expect(server.saves).toHaveLength(0);
    server.saveError = null;
    await advance(5_000);
    expect(server.saves).toHaveLength(1);
  });

  it("espace du propriétaire plein : avis, pas de nouvel essai tant que la carte ne change pas", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    server.saveError = "quota";
    store.getState().placePoint([2, 48]);
    await advance(SHARED_SAVE_DELAY_MS);
    expect(session.view()).toMatchObject({ editing: true, unsaved: false, saveStatus: COOP_QUOTA, notice: COOP_QUOTA });
    await advance(30_000);
    expect(api.save).toHaveBeenCalledTimes(1);
    // Une nouvelle modification (par exemple un allègement) repart.
    server.saveError = null;
    store.getState().placePoint([3, 49]);
    await advance(SHARED_SAVE_DELAY_MS);
    expect(server.saves).toHaveLength(1);
  });
});

describe("messages de lecture seule", () => {
  it("selon le rôle et le verrou", () => {
    expect(readOnlyMessage("editor", { kind: "free" })).toBe(COOP_FREE);
    expect(readOnlyMessage("editor", { kind: "other", holderName: null })).toBe(coopHeldBy(null));
    expect(readOnlyMessage("reader", { kind: "free" })).toBe(COOP_READER);
    // Verrou du compte pris ailleurs (autre onglet, ou éditeur de l'espace du propriétaire).
    expect(readOnlyMessage("owner", { kind: "mine", expiresAt: "x" })).toBe(COOP_MINE_ELSEWHERE);
  });
});

describe("bail du verrou", () => {
  it("renouvelé tant que l'éditeur est actif ; rendu après cinq minutes d'inactivité", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    await advance(LOCK_RENEW_MS);
    expect(api.acquire).toHaveBeenCalledTimes(2);
    session.touch();
    await advance(EDITOR_IDLE_MS - LOCK_RENEW_MS);
    expect(session.view().editing).toBe(true);
    await advance(EDITOR_IDLE_MS);
    expect(session.view()).toMatchObject({ editing: false, notice: COOP_IDLE });
    expect(server.holder).toBe(null);
    expect(store.getState().readOnly).toBe(true);
    // Bouton « Modifier la carte ».
    await session.take();
    expect(session.view()).toMatchObject({ editing: true, notice: "" });
  });

  it("repris par un autre au renouvellement : lecture seule", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    server.holder = "other";
    await advance(LOCK_RENEW_MS);
    expect(session.view()).toMatchObject({ editing: false, lock: { kind: "other", holderName: "Bob" }, notice: COOP_LOST });
  });

  it("passé lecteur au renouvellement : message propre", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    server.role = "reader";
    server.holder = null;
    await advance(LOCK_RENEW_MS);
    expect(session.view()).toMatchObject({ editing: false, role: "reader", notice: COOP_DEMOTED, message: COOP_READER });
  });

  it("prise de main : la carte est relue si elle a changé depuis", async () => {
    const { server, api } = fakeServer();
    server.holder = "other";
    const session = createCoopSession(api, store, now);
    await session.start();
    server.holder = null;
    server.revision = 15;
    server.data = { ...blankDoc(), notes: { FRA: "Paris" } };
    await session.take();
    expect(session.view().editing).toBe(true);
    expect(store.getState().doc.notes).toEqual({ FRA: "Paris" });
    store.getState().setCountryNote("FRA", "Lyon");
    await advance(SHARED_SAVE_DELAY_MS);
    expect(server.saves.at(-1)?.revision).toBe(15);
  });
});

describe("rafraîchissement des lecteurs", () => {
  it("la carte est relue quand sa version change, la fiche ouverte reste", async () => {
    const { server, api } = fakeServer("reader");
    const session = createCoopSession(api, store, now);
    await session.start();
    store.getState().open("c", "FRA");
    server.revision = 11;
    server.data = { ...blankDoc(), notes: { FRA: "Paris" } };
    server.holder = "other";
    await advance(REFRESH_MS);
    expect(store.getState().doc.notes).toEqual({ FRA: "Paris" });
    expect(store.getState().selection).toEqual({ k: "c", id: "FRA" });
    expect(session.view().message).toBe(readOnlyMessage("reader", { kind: "other", holderName: "Bob" }));
  });

  it("onglet masqué : aucun rafraîchissement en arrière-plan ; de nouveau visible, la carte est relue tout de suite", async () => {
    const { server, api } = fakeServer("reader");
    const session = createCoopSession(api, store, now);
    await session.start();
    const reads = vi.mocked(api.state).mock.calls.length;
    session.setHidden(true);
    server.revision = 11;
    server.data = { ...blankDoc(), notes: { FRA: "Paris" } };
    await advance(10 * REFRESH_MS);
    expect(api.state).toHaveBeenCalledTimes(reads);
    expect(store.getState().doc.notes).toEqual({});
    session.setHidden(false);
    await advance(0);
    expect(api.state).toHaveBeenCalledTimes(reads + 1);
    expect(store.getState().doc.notes).toEqual({ FRA: "Paris" });
    // Les rafraîchissements périodiques reprennent.
    await advance(REFRESH_MS);
    expect(api.state).toHaveBeenCalledTimes(reads + 2);
  });

  it("limite des lectures atteinte ou réseau coupé : un avis le dit, les essais continuent, l'avis part au premier qui réussit", async () => {
    const { server, api } = fakeServer("reader");
    const session = createCoopSession(api, store, now);
    await session.start();
    server.stateError = "rate-limited";
    await advance(REFRESH_MS);
    expect(session.view().notice).toBe(COOP_REFRESH_RATE_LIMITED);
    server.stateError = "unavailable";
    await advance(REFRESH_MS);
    expect(session.view().notice).toBe(COOP_REFRESH_FAILED);
    server.stateError = null;
    server.revision = 11;
    server.data = { ...blankDoc(), notes: { FRA: "Paris" } };
    await advance(REFRESH_MS);
    expect(session.view().notice).toBe("");
    expect(store.getState().doc.notes).toEqual({ FRA: "Paris" });
  });

  it("un avis qui n'est pas celui du rafraîchissement reste affiché", async () => {
    const { server, api } = fakeServer("editor");
    const session = createCoopSession(api, store, now);
    await session.start();
    // Inactivité : la main est rendue avec un avis, qui reste après les rafraîchissements suivants.
    await advance(EDITOR_IDLE_MS + LOCK_RENEW_MS);
    expect(session.view().notice).toBe(COOP_IDLE);
    server.revision = 11;
    await advance(REFRESH_MS);
    expect(session.view().notice).toBe(COOP_IDLE);
  });

  it("accès retiré : « gone »", async () => {
    const { server, api } = fakeServer("reader");
    const session = createCoopSession(api, store, now);
    await session.start();
    server.exists = false;
    await advance(REFRESH_MS);
    expect(session.view().phase).toBe("gone");
  });
});

describe("sortie", () => {
  it("enregistre ce qui reste, libère le verrou, ne réagit plus au store", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    store.getState().placePoint([2, 48]);
    const stopped = session.stop();
    // La page suivante réutilise le store tout de suite : rien de ce qu'elle y met n'est envoyé.
    store.setState(store.getInitialState(), true);
    await stopped;
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].doc.points).toHaveLength(1);
    expect(server.releases).toBe(1);
    store.getState().placePoint([5, 5]);
    await advance(SHARED_SAVE_DELAY_MS + REFRESH_MS + LOCK_RENEW_MS);
    expect(server.saves).toHaveLength(1);
    expect(store.getState().readOnly).toBe(false);
  });

  it("onglet fermé ou mis en cache : plus rien n'est envoyé et la carte passe en lecture seule", async () => {
    const { server, api } = fakeServer();
    const session = createCoopSession(api, store, now);
    await session.start();
    store.getState().placePoint([2, 48]);
    session.abandon();
    expect(store.getState().readOnly).toBe(true);
    expect(session.view()).toMatchObject({ editing: false, unsaved: false });
    store.getState().placePoint([3, 49]);
    expect(store.getState().doc.points).toHaveLength(1);
    await advance(SHARED_SAVE_DELAY_MS + REFRESH_MS + LOCK_RENEW_MS);
    expect(server.saves).toHaveLength(0);
  });

  it("un lecteur ne libère rien", async () => {
    const { server, api } = fakeServer("reader");
    const session = createCoopSession(api, store, now);
    await session.start();
    await session.stop();
    expect(server.releases).toBe(0);
  });
});
