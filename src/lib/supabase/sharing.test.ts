// Accès au partage des cartes (sharing.ts) : appels des fonctions de la base, statuts attendus,
// classement des erreurs (jamais le message brut), lecture des listes et de l'état. Client simulé.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blankDoc } from "@/features/map-doc/schema";
import {
  SharingDataError,
  acceptLink,
  acquireLock,
  answerInvitation,
  classifySharingError,
  createLink,
  getMapShares,
  getSharedMapState,
  inviteContact,
  listMapInvitations,
  listMapShareRows,
  listSharedWithMe,
  openSharedMap,
  previewLink,
  saveSharedMap,
} from "./sharing";

type Reply = { data: unknown; error: { code?: string; message?: string } | null };

const calls: { fn: string; args: unknown }[] = [];
let replies: Record<string, Reply> = {};

const db = {
  rpc: (fn: string, args?: unknown) => {
    calls.push({ fn, args });
    const result = Promise.resolve(replies[fn] ?? { data: null, error: { code: "XX000" } });
    return Object.assign(result, {
      maybeSingle: async () => {
        const { data, error } = await result;
        return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
      },
    });
  },
} as unknown as Parameters<typeof inviteContact>[0];

const reply = (fn: string, data: unknown, error: Reply["error"] = null) => {
  replies[fn] = { data, error };
};

const MAP = "12345678-1234-4234-8234-123456789abc";
const TOKEN = "a".repeat(64);

beforeEach(() => {
  calls.length = 0;
  replies = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("classifySharingError", () => {
  it("classe les erreurs levées par la base et les refus d'accès", () => {
    expect(classifySharingError({ code: "P0001", message: "sharing_no_profile" })).toBe("no-profile");
    expect(classifySharingError({ code: "P0001", message: "sharing_rate_limited" })).toBe("rate-limited");
    expect(classifySharingError({ code: "P0001", message: "maps_locked" })).toBe("locked");
    expect(classifySharingError({ code: "P0001", message: "maps_conflict" })).toBe("conflict");
    expect(classifySharingError({ code: "P0001", message: "maps_too_large" })).toBe("too-large");
    // Écriture d'un éditeur dans un compte de propriétaire plein ; contraintes de la table des cartes.
    expect(classifySharingError({ code: "P0001", message: "maps_quota_exceeded" })).toBe("quota");
    expect(classifySharingError({ code: "23514", message: 'violates check constraint "maps_data_size"' })).toBe("too-large");
    expect(classifySharingError({ code: "23514", message: "autre" })).toBe("invalid");
    expect(classifySharingError({ code: "P0001", message: "autre" })).toBe("unavailable");
    expect(classifySharingError({ code: "42501" })).toBe("unauthorized");
    expect(classifySharingError({ code: "PGRST301" })).toBe("unauthorized");
    expect(classifySharingError({})).toBe("unavailable");
  });
});

describe("partager", () => {
  it("invitation : bons paramètres, statut prévu ; statut inconnu refusé", async () => {
    reply("invite_contact_to_map", "invited");
    expect(await inviteContact(db, MAP, "c1", "reader")).toBe("invited");
    expect(calls[0]).toEqual({ fn: "invite_contact_to_map", args: { p_map: MAP, p_contact: "c1", p_role: "reader" } });
    reply("invite_contact_to_map", "autre");
    await expect(inviteContact(db, MAP, "c1", "reader")).rejects.toThrow(SharingDataError);
  });

  it("lien : le jeton doit avoir la forme attendue ; carte introuvable et liens pleins sont des statuts", async () => {
    const options = { role: "editor", maxUses: 5, hours: 24 } as const;
    reply("create_map_link", [{ status: "created", token: TOKEN }]);
    expect(await createLink(db, MAP, options)).toBe(TOKEN);
    expect(calls[0].args).toEqual({ p_map: MAP, p_role: "editor", p_max_uses: 5, p_hours: 24 });
    for (const data of [[{ status: "created", token: "court" }], [{ status: "created", token: null }], [{ status: "autre", token: TOKEN }], []]) {
      reply("create_map_link", data);
      await expect(createLink(db, MAP, options)).rejects.toMatchObject({ kind: "unavailable" });
    }
    reply("create_map_link", [{ status: "links-full", token: null }]);
    await expect(createLink(db, MAP, options)).rejects.toMatchObject({ kind: "links-full" });
    reply("create_map_link", [{ status: "not-found", token: null }]);
    await expect(createLink(db, MAP, options)).rejects.toMatchObject({ kind: "not-found" });
    reply("create_map_link", null, { code: "P0001", message: "sharing_rate_limited" });
    await expect(createLink(db, MAP, options)).rejects.toMatchObject({ kind: "rate-limited" });
  });

  it("partages d'une carte rangés par sorte, sans jamais de jeton", async () => {
    reply("my_map_shares", [
      { map_id: MAP, kind: "member", id: "m1", handle: "bob", display_name: "Bob", role: "editor", uses: null, max_uses: null, created_at: "t1", expires_at: null },
      { map_id: MAP, kind: "invitation", id: "i1", handle: "carol", display_name: "Carol", role: "reader", uses: null, max_uses: null, created_at: "t2", expires_at: "t3" },
      { map_id: MAP, kind: "link", id: "l1", handle: null, display_name: null, role: "reader", uses: 1, max_uses: 5, created_at: "t4", expires_at: "t5" },
    ]);
    expect(await getMapShares(db, MAP)).toEqual({
      members: [{ id: "m1", handle: "bob", displayName: "Bob", role: "editor", since: "t1" }],
      invitations: [{ id: "i1", handle: "carol", displayName: "Carol", role: "reader", createdAt: "t2", expiresAt: "t3" }],
      links: [{ id: "l1", role: "reader", uses: 1, maxUses: 5, createdAt: "t4", expiresAt: "t5" }],
    });
    expect(calls[0].args).toEqual({ p_map: MAP });
    reply("my_map_shares", [{ map_id: MAP, kind: "member", id: "m1", handle: "bob", display_name: "Bob", role: "owner", created_at: "t" }]);
    await expect(getMapShares(db, MAP)).rejects.toThrow(SharingDataError);
  });

  it("export : une base d'avant le partage n'a aucun partage", async () => {
    reply("my_map_shares", null, { code: "PGRST202" });
    expect(await listMapShareRows(db, null, { missingAsEmpty: true })).toEqual([]);
    await expect(listMapShareRows(db, null)).rejects.toThrow(SharingDataError);
  });
});

describe("rejoindre", () => {
  it("réponse et carte de l'invitation ou du lien", async () => {
    reply("answer_map_invitation", [{ status: "joined", map_id: MAP }]);
    expect(await answerInvitation(db, "i1", true)).toEqual({ status: "joined", mapId: MAP });
    expect(calls[0].args).toEqual({ p_invitation: "i1", p_accept: true });
    reply("accept_map_link", [{ status: "not-found", map_id: null }]);
    expect(await acceptLink(db, TOKEN)).toEqual({ status: "not-found", mapId: null });
    reply("accept_map_link", []);
    await expect(acceptLink(db, TOKEN)).rejects.toThrow(SharingDataError);
  });

  it("aperçu d'un lien ; aucun aperçu pour un lien inutilisable", async () => {
    reply("preview_map_link", [{ map_name: "Sahel", role: "editor", owner_handle: "alice", owner_display_name: "Alice", expires_at: "t", my_role: null }]);
    expect(await previewLink(db, TOKEN)).toEqual({ mapName: "Sahel", role: "editor", ownerHandle: "alice", ownerName: "Alice", expiresAt: "t", myRole: null });
    reply("preview_map_link", []);
    expect(await previewLink(db, TOKEN)).toBe(null);
  });

  it("listes du compte : cartes partagées (statistiques lues) et invitations reçues", async () => {
    reply("maps_shared_with_me", [
      { id: MAP, name: "C", role: "reader", updated_at: "2026-10-20T10:00:00Z", stats: { notes: 1, links: 0, pings: 0, zones: 0, texts: 0 }, owner_handle: "alice", owner_display_name: "Alice", joined_at: "t" },
    ]);
    const [shared] = await listSharedWithMe(db);
    expect(shared).toMatchObject({ id: MAP, role: "reader", ownerName: "Alice", updated: "2026-10-20T10:00:00.000Z" });
    expect(shared.stats).toContain("1 pays annotés");
    reply("my_map_invitations", null, { code: "PGRST202" });
    expect(await listMapInvitations(db, { missingAsEmpty: true })).toEqual([]);
  });
});

describe("éditeur coopératif", () => {
  it("carte ouverte (contenu non validé), état et verrou", async () => {
    reply("open_shared_map", [
      { id: MAP, name: "C", role: "editor", revision: 7, updated_at: "2026-10-20T10:00:00Z", data: { x: 1 }, owner_handle: "alice", owner_display_name: null },
    ]);
    expect(await openSharedMap(db, MAP)).toMatchObject({ role: "editor", revision: 7, data: { x: 1 }, ownerName: null });
    reply("open_shared_map", []);
    expect(await openSharedMap(db, MAP)).toBe(null);

    const row = { name: "C", role: "reader", revision: 7, updated_at: "t", lock_mine: false, lock_held: true, lock_holder_name: "Bob", lock_expires_at: "e" };
    reply("shared_map_state", [row]);
    expect((await getSharedMapState(db, MAP))?.lock).toEqual({ kind: "other", holderName: "Bob" });
    reply("shared_map_state", [{ ...row, lock_mine: true }]);
    expect((await getSharedMapState(db, MAP))?.lock).toEqual({ kind: "mine", expiresAt: "e" });
    reply("shared_map_state", [{ ...row, lock_held: false }]);
    expect((await getSharedMapState(db, MAP))?.lock).toEqual({ kind: "free" });

    reply("acquire_map_lock", [{ status: "held", holder_name: null, expires_at: "e" }]);
    expect(await acquireLock(db, MAP)).toEqual({ status: "held", holderName: null });
    reply("acquire_map_lock", [{ status: "inconnu", holder_name: null, expires_at: null }]);
    await expect(acquireLock(db, MAP)).rejects.toThrow(SharingDataError);
  });

  it("enregistrement par update_map_data (format portable, version attendue) ; verrou d'un autre : « locked »", async () => {
    reply("update_map_data", [{ id: MAP, name: "C", updated_at: "2026-10-20T10:00:00Z", revision: 8 }]);
    expect(await saveSharedMap(db, MAP, blankDoc(), 7)).toEqual({ revision: 8, updated: "2026-10-20T10:00:00.000Z" });
    expect(calls[0]).toEqual({
      fn: "update_map_data",
      args: { p_id: MAP, p_data: expect.any(String), p_expected_revision: 7 },
    });
    // Une carte sans ajout v2 part au format v1 (accepté aussi par la base d'avant la bêta 2.1).
    expect(Object.keys(JSON.parse((calls[0].args as { p_data: string }).p_data))).toHaveLength(9);
    reply("update_map_data", null, { code: "P0001", message: "maps_locked" });
    await expect(saveSharedMap(db, MAP, blankDoc(), 7)).rejects.toMatchObject({ kind: "locked" });
    reply("update_map_data", []);
    expect(await saveSharedMap(db, MAP, blankDoc(), 7)).toBe(null);
  });
});
