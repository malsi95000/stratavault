// Accès aux contacts (contacts.ts) : appels des fonctions de la base, statuts attendus, classement
// des erreurs (jamais le message brut), lecture des listes. Client Supabase simulé.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContactDataError,
  acceptContactRequest,
  blockMember,
  cancelContactRequest,
  classifyContactError,
  getContactOverview,
  refuseContactRequest,
  removeContact,
  sendContactRequest,
  unblockMember,
} from "./contacts";

type Reply = { data: unknown; error: { code?: string; message?: string } | null };

const calls: { fn: string; args: unknown }[] = [];
let replies: Record<string, Reply> = {};

const db = {
  rpc: async (fn: string, args?: unknown) => {
    calls.push({ fn, args });
    return replies[fn] ?? { data: null, error: { code: "XX000" } };
  },
} as unknown as Parameters<typeof sendContactRequest>[0];

const reply = (fn: string, data: unknown, error: Reply["error"] = null) => {
  replies[fn] = { data, error };
};

beforeEach(() => {
  calls.length = 0;
  replies = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("classifyContactError", () => {
  it("classe les erreurs levées par la base et les refus d'accès", () => {
    expect(classifyContactError({ code: "P0001", message: "contacts_no_profile" })).toBe("no-profile");
    expect(classifyContactError({ code: "P0001", message: "contacts_rate_limited" })).toBe("rate-limited");
    expect(classifyContactError({ code: "P0001", message: "contacts_invalid" })).toBe("invalid");
    expect(classifyContactError({ code: "P0001", message: "autre chose" })).toBe("unavailable");
    expect(classifyContactError({ code: "42501", message: "contacts_not_authenticated" })).toBe("unauthorized");
    expect(classifyContactError({ code: "PGRST301" })).toBe("unauthorized");
    expect(classifyContactError({ code: "57014" })).toBe("unavailable");
    expect(classifyContactError({})).toBe("unavailable");
  });
});

describe("fonctions d'écriture", () => {
  it("appellent la bonne fonction avec ses paramètres et renvoient le statut", async () => {
    reply("send_contact_request", "not-found");
    expect(await sendContactRequest(db, "bob")).toBe("not-found");
    reply("accept_contact_request", "accepted");
    expect(await acceptContactRequest(db, "r1")).toBe("accepted");
    reply("refuse_contact_request", "refused");
    expect(await refuseContactRequest(db, "r1")).toBe("refused");
    reply("cancel_contact_request", "cancelled");
    expect(await cancelContactRequest(db, "r1")).toBe("cancelled");
    reply("remove_contact", "removed");
    expect(await removeContact(db, "c1")).toBe("removed");
    reply("block_member", "already-blocked");
    expect(await blockMember(db, "contact", "c1")).toBe("already-blocked");
    reply("unblock_member", "unblocked");
    expect(await unblockMember(db, "b1")).toBe("unblocked");
    expect(calls).toEqual([
      { fn: "send_contact_request", args: { p_handle: "bob" } },
      { fn: "accept_contact_request", args: { p_request: "r1" } },
      { fn: "refuse_contact_request", args: { p_request: "r1" } },
      { fn: "cancel_contact_request", args: { p_request: "r1" } },
      { fn: "remove_contact", args: { p_contact: "c1" } },
      { fn: "block_member", args: { p_kind: "contact", p_value: "c1" } },
      { fn: "unblock_member", args: { p_block: "b1" } },
    ]);
  });

  it("un statut inattendu ou une erreur devient une erreur classée", async () => {
    reply("send_contact_request", "deleted-everything");
    await expect(sendContactRequest(db, "bob")).rejects.toEqual(new ContactDataError("unavailable"));
    reply("accept_contact_request", "refused");
    await expect(acceptContactRequest(db, "r1")).rejects.toBeInstanceOf(ContactDataError);
    reply("send_contact_request", null, { code: "P0001", message: "contacts_rate_limited" });
    await expect(sendContactRequest(db, "bob")).rejects.toMatchObject({ kind: "rate-limited" });
    reply("block_member", null, { code: "P0001", message: "contacts_invalid" });
    await expect(blockMember(db, "handle", "bob")).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("getContactOverview", () => {
  it("lit les trois listes et sépare les demandes reçues et envoyées", async () => {
    reply("my_contacts", [{ id: "c1", handle: "bob", display_name: "Bob", avatar_id: "a1", created_at: "2026-10-01" }]);
    reply("my_contact_requests", [
      { id: "r1", direction: "incoming", handle: "carol", display_name: "Carol", avatar_id: null, created_at: "2026-10-03" },
      { id: "r2", direction: "outgoing", handle: null, display_name: null, avatar_id: null, created_at: "2026-10-02" },
    ]);
    reply("my_blocked_members", [
      { id: "b1", handle: "eve", created_at: "2026-10-04" },
      { id: "b2", handle: null, created_at: "2026-10-03" },
    ]);
    expect(await getContactOverview(db)).toEqual({
      contacts: [{ id: "c1", handle: "bob", displayName: "Bob", avatarId: "a1", createdAt: "2026-10-01" }],
      incoming: [{ id: "r1", direction: "incoming", handle: "carol", displayName: "Carol", avatarId: null, createdAt: "2026-10-03" }],
      outgoing: [{ id: "r2", direction: "outgoing", handle: null, displayName: null, avatarId: null, createdAt: "2026-10-02" }],
      blocked: [
        { id: "b1", handle: "eve", createdAt: "2026-10-04" },
        { id: "b2", handle: null, createdAt: "2026-10-03" },
      ],
    });
  });

  it("fonctions absentes : erreur, sauf pour l'export (listes vides) ; toute autre erreur est levée", async () => {
    for (const fn of ["my_contacts", "my_contact_requests", "my_blocked_members"]) reply(fn, null, { code: "PGRST202" });
    await expect(getContactOverview(db)).rejects.toBeInstanceOf(ContactDataError);
    expect(await getContactOverview(db, { missingAsEmpty: true })).toEqual({ contacts: [], incoming: [], outgoing: [], blocked: [] });
    reply("my_contacts", null, { code: "57014" });
    await expect(getContactOverview(db, { missingAsEmpty: true })).rejects.toMatchObject({ kind: "unavailable" });
  });
});
