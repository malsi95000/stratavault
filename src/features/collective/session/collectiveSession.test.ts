// Session de la carte collective : chargement, règles d'édition, publication des éléments du compte
// (ajouts, modifications, suppressions), refus remis en place, pannes réessayées, rafraîchissement,
// sortie. Server Actions simulées.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorStore, deleteOnly, ficheLocked, ficheReadOnly, type EditorStore } from "@/features/editor/store";
import { REFRESH_MS, SYNC_DELAY_MS, SYNC_RETRY_MS } from "../limits";
import {
  COLLECTIVE_READ_ONLY_NO_PROFILE,
  COLLECTIVE_SAVED,
  COLLECTIVE_SAVE_RETRY,
  COLLECTIVE_SESSION_ENDED,
  HINT_DELETE_ONLY,
  HINT_NOT_YOURS,
  REFUSED_CREATE,
  REFUSED_UPDATE,
  collectiveReadOnlySuspended,
} from "../messages";
import type { CollectiveError, CollectiveResult } from "../syncActions";
import type { CollectiveItem, CreateStatus, ItemContent } from "../types";
import { createCollectiveSession, type CollectiveApi } from "./collectiveSession";

const ok = <T>(value: T): CollectiveResult<T> => ({ ok: true, value });
const err = (error: CollectiveError) => ({ ok: false as const, error });

const item = (id: string, mine: boolean, title = ""): CollectiveItem => ({
  kind: "ping",
  id,
  data: { ll: [2, 48], type: "crise", title, note: "" },
  authorName: mine ? "Moi" : "Bob",
  authorHandle: mine ? "moi" : "bob",
  mine,
  createdAt: "2026-10-27T10:00:00.000Z",
  updatedAt: "2026-10-27T10:00:00.000Z",
});

/** Base simulée : éléments, version, profil, et réponse forcée des écritures. */
function fakeServer() {
  const server = {
    items: [item("mine1", true, "Le mien"), item("bob1", false, "Celui de Bob")] as CollectiveItem[],
    revision: 1,
    hasProfile: true,
    suspendedUntil: null as string | null,
    fail: null as CollectiveError | null,
    createStatus: "created" as CreateStatus,
    updateStatus: null as null | "not-found" | "invalid" | "suspended",
  };
  /** Écriture du compte sous le verrou : version avant et après (`changes` : lignes écrites). */
  const write = (changes: number) => {
    const from = server.revision;
    server.revision += changes;
    return { from, to: server.revision };
  };
  const api: CollectiveApi = {
    state: vi.fn(async () =>
      server.fail === "unauthorized"
        ? err("unauthorized")
        : ok({
            revision: server.revision,
            isModerator: false,
            hasProfile: server.hasProfile,
            unreadNotices: 0,
            myItems: 1,
            suspendedUntil: server.suspendedUntil,
          }),
    ),
    load: vi.fn(async () => ok(server.items.map((i) => ({ ...i })))),
    create: vi.fn(async (content: ItemContent) => {
      if (server.fail) return err(server.fail);
      if (server.createStatus !== "created") {
        return ok({ status: server.createStatus, authorName: null, createdAt: null, step: server.createStatus === "suspended" ? null : write(0) });
      }
      server.items.push({
        ...content,
        authorName: "Moi",
        authorHandle: "moi",
        mine: true,
        createdAt: "2026-10-27T11:00:00.000Z",
        updatedAt: "",
      } as CollectiveItem);
      return ok({ status: "created" as const, authorName: "Moi", createdAt: "2026-10-27T11:00:00.000Z", step: write(1) });
    }),
    update: vi.fn(async (content: ItemContent) => {
      if (server.fail) return err(server.fail);
      if (server.updateStatus) return ok({ status: server.updateStatus, step: server.updateStatus === "suspended" ? null : write(0) });
      server.items = server.items.map((i) => (i.id === content.id ? ({ ...i, data: content.data } as CollectiveItem) : i));
      return ok({ status: "updated" as const, step: write(1) });
    }),
    remove: vi.fn(async (id: string) => {
      if (server.fail) return err(server.fail);
      server.items = server.items.filter((i) => i.id !== id);
      return ok({ status: "deleted" as const, step: write(1) });
    }),
  };
  return { server, api };
}

let store: EditorStore;

beforeEach(() => {
  vi.useFakeTimers();
  store = createEditorStore();
});

afterEach(() => {
  vi.useRealTimers();
});

const pingIds = () => store.getState().doc.pings.map((p) => p.id);

describe("ouverture", () => {
  it("charge la carte, pose les règles et laisse contribuer un compte qui a un profil", async () => {
    const { api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().readOnly).toBe(false);
    expect(store.getState().editRules).not.toBeNull();
    expect(pingIds()).toEqual(["mine1", "bob1"]);
    expect(session.view()).toMatchObject({ phase: "ready", canContribute: true });
    expect(session.authorship("p", "bob1")).toEqual({
      mine: false,
      authorName: "Bob",
      authorHandle: "bob",
      createdAt: "2026-10-27T10:00:00.000Z",
    });
    expect(session.authorship("p", "mine1")?.mine).toBe(true);
    expect(session.authorship("c", "FRA")).toBeNull();
  });

  it("sans profil : suppression seulement, avec la raison", async () => {
    const { server, api } = fakeServer();
    server.hasProfile = false;
    const session = createCollectiveSession(api, store);
    await session.start();
    expect(store.getState().readOnly).toBe(false);
    expect(deleteOnly(store.getState())).toBe(true);
    expect(session.view()).toMatchObject({ canContribute: false, message: COLLECTIVE_READ_ONLY_NO_PROFILE });
  });

  it("contributions suspendues : suppression seulement, avec la date de fin, sans lien « Créer mon profil »", async () => {
    const { server, api } = fakeServer();
    server.suspendedUntil = "2026-11-26T10:00:00.000Z";
    const session = createCollectiveSession(api, store);
    await session.start();
    expect(store.getState().readOnly).toBe(false);
    expect(deleteOnly(store.getState())).toBe(true);
    expect(session.view()).toMatchObject({
      canContribute: false,
      suspended: true,
      message: collectiveReadOnlySuspended("2026-11-26T10:00:00.000Z"),
    });
    expect(session.view().message).toContain("26 nov. 2026");
  });

  it("session expirée : échec affiché, carte en lecture seule", async () => {
    const { server, api } = fakeServer();
    server.fail = "unauthorized";
    const session = createCollectiveSession(api, store);
    await session.start();
    expect(session.view()).toMatchObject({ phase: "failed", message: COLLECTIVE_SESSION_ENDED });
    expect(store.getState().readOnly).toBe(true);
  });
});

describe("publication", () => {
  it("un ajout, une modification et une suppression du compte sont publiés après un court délai", async () => {
    const { server, api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    store.getState().placePing([10, 10]);
    const added = store.getState().doc.pings.at(-1)!.id;
    expect(session.view().unsaved).toBe(true);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(api.create).toHaveBeenCalledOnce();
    expect(session.view()).toMatchObject({ status: COLLECTIVE_SAVED, unsaved: false });
    expect(session.authorship("p", added)).toMatchObject({ mine: true, authorName: "Moi" });

    store.getState().updateFiche("p", "mine1", { title: "Renommé" });
    store.getState().erase("p", added);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(api.update).toHaveBeenCalledOnce();
    expect(api.remove).toHaveBeenCalledWith(added);
    expect(server.items.map((i) => i.id)).toEqual(["mine1", "bob1"]);
    expect(server.items[0].data).toMatchObject({ title: "Renommé" });
  });

  it("l'élément d'un autre membre ne se modifie pas : rien n'est envoyé", async () => {
    const { api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    store.getState().updateFiche("p", "bob1", { title: "Volé" });
    store.getState().erase("p", "bob1");
    expect(pingIds()).toContain("bob1");
    expect(store.getState().hint).toBe(HINT_NOT_YOURS);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS * 2);
    expect(api.update).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("ajout refusé par la base : retiré de la carte, avec un avis", async () => {
    const { server, api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    server.createStatus = "author-full";
    store.getState().placePing([10, 10]);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(pingIds()).toEqual(["mine1", "bob1"]);
    expect(session.view().notice).toBe(REFUSED_CREATE["author-full"]);
    server.createStatus = "created";
    server.fail = "rate-limited";
    store.getState().placePing([11, 11]);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(pingIds()).toEqual(["mine1", "bob1"]);
    expect(session.view().notice).toBe(REFUSED_CREATE["rate-limited"]);
  });

  it("suspension prononcée entre-temps : l'envoi refusé est remis, la carte passe en lecture seule", async () => {
    const { server, api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    server.createStatus = "suspended";
    store.getState().placePing([10, 10]);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(pingIds()).toEqual(["mine1", "bob1"]);
    expect(session.view()).toMatchObject({ canContribute: false, suspended: true, notice: REFUSED_CREATE.suspended });
    expect(deleteOnly(store.getState())).toBe(true);
    // Le rafraîchissement donne la date ; une fois la suspension levée, la contribution reprend.
    server.suspendedUntil = "2026-11-26T10:00:00.000Z";
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(session.view().message).toBe(collectiveReadOnlySuspended("2026-11-26T10:00:00.000Z"));
    server.suspendedUntil = null;
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(session.view()).toMatchObject({ canContribute: true, suspended: false, message: "" });
    expect(store.getState().readOnly).toBe(false);
    expect(deleteOnly(store.getState())).toBe(false);
  });

  it("suspendu ou sans profil : il supprime encore ses éléments (fiche ou gomme), sans rien ajouter ni modifier", async () => {
    for (const setup of [(s: { hasProfile: boolean }) => (s.hasProfile = false), (s: { suspendedUntil: string | null }) => (s.suspendedUntil = "2026-11-26T10:00:00.000Z")]) {
      store = createEditorStore();
      const { server, api } = fakeServer();
      server.items.push(item("mine2", true, "Le mien aussi"));
      setup(server);
      const session = createCollectiveSession(api, store);
      await session.start();

      // Seuls Sélection et Gomme se choisissent.
      store.getState().setTool("ping");
      expect(store.getState().tool).toBe("select");
      store.getState().setTool("gomme");
      expect(store.getState().tool).toBe("gomme");

      // Ni ajout ni modification : refusés par les règles, avec la raison ; rien n'est envoyé.
      store.getState().placePing([10, 10]);
      expect(store.getState().hint).toBe(HINT_DELETE_ONLY);
      store.getState().updateFiche("p", "mine1", { title: "Modifié" });
      expect(store.getState().doc.pings.find((p) => p.id === "mine1")?.title).toBe("Le mien");

      // Fiche du sien : champs en lecture seule, bouton Supprimer présent ; celle d'un autre : rien.
      store.getState().open("p", "mine1");
      expect(ficheReadOnly(store.getState())).toBe(true);
      expect(ficheLocked(store.getState())).toBe(false);
      store.getState().open("p", "bob1");
      expect(ficheLocked(store.getState())).toBe(true);

      // Suppression par la fiche, puis à la gomme : envoyées à la base.
      store.getState().erase("p", "mine1");
      store.getState().gomme("p", "mine2");
      store.getState().gomme("p", "bob1");
      expect(store.getState().hint).toBe(HINT_NOT_YOURS);
      expect(pingIds()).toEqual(["bob1"]);
      await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
      expect(api.remove).toHaveBeenCalledWith("mine1");
      expect(api.remove).toHaveBeenCalledWith("mine2");
      expect(api.create).not.toHaveBeenCalled();
      expect(api.update).not.toHaveBeenCalled();
      expect(server.items.map((i) => i.id)).toEqual(["bob1"]);
      expect(session.view().unsaved).toBe(false);
      await session.stop();
    }
  });

  it("à la sortie, une suppression pas encore envoyée l'est aussi pour un compte suspendu", async () => {
    const { server, api } = fakeServer();
    server.suspendedUntil = "2026-11-26T10:00:00.000Z";
    const session = createCollectiveSession(api, store);
    await session.start();
    store.getState().erase("p", "mine1");
    await session.stop();
    expect(api.remove).toHaveBeenCalledWith("mine1");
    expect(store.getState().editRules).toBeNull();
  });

  it("modification refusée pour suspension : remise telle que la base la connaît", async () => {
    const { server, api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    server.updateStatus = "suspended";
    store.getState().updateFiche("p", "mine1", { title: "Modifié" });
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(store.getState().doc.pings.find((p) => p.id === "mine1")?.title).toBe("Le mien");
    expect(session.view()).toMatchObject({ suspended: true, notice: REFUSED_UPDATE.suspended });
  });

  it("élément masqué entre-temps : la modification le retire de la carte, avec un avis", async () => {
    const { server, api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    server.updateStatus = "not-found";
    store.getState().updateFiche("p", "mine1", { title: "Modifié" });
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(pingIds()).toEqual(["bob1"]);
    expect(session.view().notice).toBe(REFUSED_UPDATE["not-found"]);
    // Rien ne reste à envoyer : l'élément n'est plus connu.
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS * 2);
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("panne passagère : nouvel essai, sans rien perdre", async () => {
    const { server, api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    server.fail = "unavailable";
    store.getState().placePing([10, 10]);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(session.view()).toMatchObject({ status: COLLECTIVE_SAVE_RETRY, unsaved: true });
    expect(pingIds()).toHaveLength(3);
    server.fail = null;
    await vi.advanceTimersByTimeAsync(SYNC_RETRY_MS);
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(session.view()).toMatchObject({ status: COLLECTIVE_SAVED, unsaved: false });
  });

  it("session expirée pendant l'envoi : échec affiché", async () => {
    const { server, api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    server.fail = "unauthorized";
    store.getState().placePing([10, 10]);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(session.view()).toMatchObject({ phase: "failed", message: COLLECTIVE_SESSION_ENDED });
  });
});

describe("rafraîchissement et sortie", () => {
  it("la carte est relue quand sa version change, en gardant la fiche ouverte", async () => {
    const { server, api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    store.getState().open("p", "bob1");
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(api.load).toHaveBeenCalledTimes(1);
    server.items.push(item("bob2", false));
    server.revision += 1;
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(api.load).toHaveBeenCalledTimes(2);
    expect(pingIds()).toEqual(["mine1", "bob1", "bob2"]);
    expect(store.getState().selection).toEqual({ k: "p", id: "bob1" });
    expect(session.view().version).toBeGreaterThan(0);
  });

  it("les écritures du compte ne font pas relire la carte ; celle d'un autre membre, si", async () => {
    const { server, api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    expect(api.load).toHaveBeenCalledTimes(1);
    // Contributions répétées : chaque écriture suit la version connue, aucune lecture complète.
    for (let i = 0; i < 5; i += 1) {
      store.getState().placePing([10 + i, 10]);
      await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
      store.getState().updateFiche("p", "mine1", { title: `Titre ${i}` });
      await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
      await vi.advanceTimersByTimeAsync(REFRESH_MS);
    }
    store.getState().erase("p", "mine1");
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS + REFRESH_MS);
    expect(api.create).toHaveBeenCalledTimes(5);
    expect(api.update).toHaveBeenCalledTimes(5);
    expect(api.remove).toHaveBeenCalledOnce();
    expect(api.load).toHaveBeenCalledTimes(1);

    // Un autre membre écrit entre deux écritures du compte : la version d'avant ne correspond plus,
    // la carte est relue au passage suivant (et l'élément de l'autre apparaît).
    server.items.push(item("bob2", false));
    server.revision += 1;
    store.getState().placePing([30, 30]);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(api.load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(api.load).toHaveBeenCalledTimes(2);
    expect(pingIds()).toContain("bob2");
    await session.stop();
  });

  it("après un blocage, la carte est relue sans attendre un changement de version", async () => {
    const { server, api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    // La base ne montre plus les éléments de l'auteur bloqué ; la version de la carte n'a pas changé.
    server.items = server.items.filter((i) => i.id !== "bob1");
    session.reload();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.load).toHaveBeenCalledTimes(2);
    expect(pingIds()).toEqual(["mine1"]);
    await session.stop();
  });

  it("un profil créé entre-temps ouvre la contribution", async () => {
    const { server, api } = fakeServer();
    server.hasProfile = false;
    const session = createCollectiveSession(api, store);
    await session.start();
    server.hasProfile = true;
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(session.view().canContribute).toBe(true);
    expect(store.getState().readOnly).toBe(false);
  });

  it("à la sortie, ce qui reste est envoyé et les règles sont retirées", async () => {
    const { api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    store.getState().placePing([10, 10]);
    await session.stop();
    expect(api.create).toHaveBeenCalledOnce();
    expect(store.getState().editRules).toBeNull();
    // Plus rien ne réagit aux changements du store.
    store.getState().placePing([12, 12]);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS + REFRESH_MS);
    expect(api.create).toHaveBeenCalledOnce();
  });

  it("à la sortie, le store n'est plus en lecture seule (il sert à la page suivante)", async () => {
    const { server, api } = fakeServer();
    server.fail = "unauthorized";
    const session = createCollectiveSession(api, store);
    await session.start();
    expect(store.getState().readOnly).toBe(true);
    await session.stop();
    expect(store.getState().readOnly).toBe(false);
    expect(store.getState().editRules).toBeNull();
  });

  it("fermeture de l'onglet : tout s'arrête, rien n'est envoyé", async () => {
    const { api } = fakeServer();
    const session = createCollectiveSession(api, store);
    await session.start();
    store.getState().placePing([10, 10]);
    session.abandon();
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS + REFRESH_MS);
    expect(api.create).not.toHaveBeenCalled();
    expect(store.getState().readOnly).toBe(true);
  });
});
