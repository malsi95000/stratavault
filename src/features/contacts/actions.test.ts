// Server Actions des contacts (actions.ts) : session vérifiée, compte attendu, validation avant tout
// appel, limite par IP, réponses de la base traduites en messages, erreurs classées. Les accès aux
// données (src/lib/supabase/contacts.ts, testés à part) sont simulés.
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITED } from "@/features/auth/messages";
import { resetAuthRateLimits } from "@/features/auth/rateLimit";
import {
  answerContactRequest,
  blockMember,
  cancelContactRequest,
  removeContact,
  sendContactRequest,
  unblockMember,
} from "./actions";
import { INITIAL_CONTACT_STATE } from "./actionState";
import {
  BLOCK_MESSAGES,
  CONTACTS_FULL,
  CONTACT_RATE_LIMITED,
  CONTACT_REMOVED,
  CONTACT_SESSION_CHANGED,
  CONTACT_SESSION_ENDED,
  CONTACT_UNAVAILABLE,
  HANDLE_REQUIRED,
  MEMBER_UNBLOCKED,
  NO_PROFILE,
  RELATION_GONE,
  REQUEST_ACCEPTED,
  REQUEST_CANCELLED,
  REQUEST_REFUSED,
  SEND_MESSAGES,
} from "./messages";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REF = "12345678-1234-4234-8234-123456789abc";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  results: {} as Record<string, () => unknown>,
  fakes: {} as Record<string, ReturnType<typeof vi.fn>>,
  refresh: vi.fn(),
  ip: { value: "203.0.113.9" },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ marker: "client de la session", auth: { getUser: mocks.getUser } }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": mocks.ip.value }) }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));

vi.mock("@/lib/supabase/contacts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase/contacts")>();
  const names = [
    "sendContactRequest",
    "acceptContactRequest",
    "refuseContactRequest",
    "cancelContactRequest",
    "removeContact",
    "blockMember",
    "unblockMember",
  ];
  for (const name of names) mocks.fakes[name] = vi.fn(async () => mocks.results[name]?.());
  return { ...original, ...mocks.fakes };
});

const { ContactDataError } = await import("@/lib/supabase/contacts");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries({ account: ALICE, ...fields })) data.append(name, value);
  return data;
};
const returns = (name: string, value: unknown) => {
  mocks.results[name] = () => value;
};
const throws = (name: string, error: unknown) => {
  mocks.results[name] = () => {
    throw error;
  };
};
const run = (action: typeof sendContactRequest, fields: Record<string, string>) => action(INITIAL_CONTACT_STATE, form(fields));

beforeEach(() => {
  resetAuthRateLimits();
  mocks.ip.value = "203.0.113.9";
  mocks.results = {};
  for (const fake of Object.values(mocks.fakes)) fake.mockClear();
  mocks.refresh.mockClear();
  mocks.getUser.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: ALICE, email: "a@exemple.fr" } }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendContactRequest", () => {
  it("envoie l'identifiant normalisé avec le client de la session, puis relit la page", async () => {
    returns("sendContactRequest", "sent");
    expect(await run(sendContactRequest, { handle: " @Bob " })).toEqual({ status: "success", message: SEND_MESSAGES.sent });
    expect(mocks.fakes.sendContactRequest).toHaveBeenCalledWith(expect.objectContaining({ marker: "client de la session" }), "bob");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("bouton qui quitte la page (« after » = leave) : succès sans relire la page", async () => {
    returns("sendContactRequest", "sent");
    expect(await run(sendContactRequest, { handle: "bob", after: "leave" })).toEqual({ status: "success", message: SEND_MESSAGES.sent });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(await run(sendContactRequest, { handle: "bob", after: "autre" })).toMatchObject({ status: "success" });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("chaque réponse de la base a son message ; « introuvable » ne dit rien de plus", async () => {
    for (const result of ["not-found", "self", "already-contacts", "already-sent", "incoming-pending", "outgoing-full", "contacts-full", "unavailable"] as const) {
      returns("sendContactRequest", result);
      expect(await run(sendContactRequest, { handle: "bob" }), result).toEqual({ status: "error", message: SEND_MESSAGES[result] });
    }
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("saisie qui n'est pas un identifiant : refusée sans appel à Supabase", async () => {
    for (const handle of ["alice@exemple.fr", "a", ""]) {
      expect(await run(sendContactRequest, { handle }), handle).toEqual({ status: "error", message: HANDLE_REQUIRED });
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.fakes.sendContactRequest).not.toHaveBeenCalled();
  });

  it("erreurs de la base classées : pas de profil, limite atteinte, session, panne", async () => {
    const cases = [
      ["no-profile", NO_PROFILE],
      ["rate-limited", CONTACT_RATE_LIMITED],
      ["unauthorized", CONTACT_SESSION_ENDED],
      ["unavailable", CONTACT_UNAVAILABLE],
    ] as const;
    for (const [kind, message] of cases) {
      throws("sendContactRequest", new ContactDataError(kind));
      expect(await run(sendContactRequest, { handle: "bob" }), kind).toEqual({ status: "error", message });
    }
    throws("sendContactRequest", new Error("détail interne"));
    expect(await run(sendContactRequest, { handle: "bob" })).toEqual({ status: "error", message: CONTACT_UNAVAILABLE });
  });
});

describe("session et compte attendu", () => {
  it("rien n'est fait sans session, pour un autre compte, ou si Supabase est injoignable", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await run(sendContactRequest, { handle: "bob" })).toEqual({ status: "error", message: CONTACT_SESSION_ENDED });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }, error: null });
    expect(await run(removeContact, { contact: REF })).toEqual({ status: "error", message: CONTACT_SESSION_CHANGED });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    expect(await run(unblockMember, { block: REF })).toEqual({ status: "error", message: CONTACT_UNAVAILABLE });
    for (const fake of Object.values(mocks.fakes)) expect(fake).not.toHaveBeenCalled();
  });

  it("limite par IP avant tout appel à Supabase", async () => {
    returns("sendContactRequest", "not-found");
    for (let i = 0; i < 60; i += 1) await run(sendContactRequest, { handle: "bob" });
    mocks.getUser.mockClear();
    expect(await run(sendContactRequest, { handle: "bob" })).toEqual({ status: "error", message: RATE_LIMITED });
    expect(mocks.getUser).not.toHaveBeenCalled();
    mocks.ip.value = "198.51.100.1";
    expect((await run(sendContactRequest, { handle: "bob" })).message).toBe(SEND_MESSAGES["not-found"]);
  });
});

describe("réponses, annulation, retrait, déblocage", () => {
  it("accepter ou refuser une demande reçue", async () => {
    returns("acceptContactRequest", "accepted");
    expect(await run(answerContactRequest, { request: REF, answer: "accept" })).toEqual({ status: "success", message: REQUEST_ACCEPTED });
    returns("acceptContactRequest", "contacts-full");
    expect(await run(answerContactRequest, { request: REF, answer: "accept" })).toEqual({ status: "error", message: CONTACTS_FULL });
    returns("acceptContactRequest", "not-found");
    expect(await run(answerContactRequest, { request: REF, answer: "accept" })).toEqual({ status: "error", message: RELATION_GONE });
    returns("refuseContactRequest", "refused");
    expect(await run(answerContactRequest, { request: REF, answer: "refuse" })).toEqual({ status: "success", message: REQUEST_REFUSED });
    expect(mocks.fakes.refuseContactRequest).toHaveBeenCalledWith(expect.anything(), REF);
  });

  it("annuler, retirer, débloquer ; une référence qui n'existe plus le dit", async () => {
    returns("cancelContactRequest", "cancelled");
    expect((await run(cancelContactRequest, { request: REF })).message).toBe(REQUEST_CANCELLED);
    returns("removeContact", "removed");
    expect((await run(removeContact, { contact: REF })).message).toBe(CONTACT_REMOVED);
    returns("unblockMember", "unblocked");
    expect((await run(unblockMember, { block: REF })).message).toBe(MEMBER_UNBLOCKED);
    for (const [name, action, field] of [
      ["cancelContactRequest", cancelContactRequest, "request"],
      ["removeContact", removeContact, "contact"],
      ["unblockMember", unblockMember, "block"],
    ] as const) {
      returns(name, "not-found");
      expect(await run(action, { [field]: REF }), name).toEqual({ status: "error", message: RELATION_GONE });
    }
  });

  it("références ou réponses mal formées : refusées sans appel à Supabase", async () => {
    expect((await run(answerContactRequest, { request: REF, answer: "maybe" })).message).toBe(RELATION_GONE);
    expect((await run(answerContactRequest, { request: "x", answer: "accept" })).message).toBe(RELATION_GONE);
    expect((await run(cancelContactRequest, { request: REF.toUpperCase() })).message).toBe(RELATION_GONE);
    expect((await run(removeContact, {})).message).toBe(RELATION_GONE);
    expect((await run(unblockMember, { block: "' or 1=1 --" })).message).toBe(RELATION_GONE);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

describe("blockMember", () => {
  it("par identifiant (normalisé), par demande ou par contact", async () => {
    returns("blockMember", "blocked");
    expect(await run(blockMember, { kind: "handle", value: "@Bob" })).toEqual({ status: "success", message: BLOCK_MESSAGES.blocked });
    expect(mocks.fakes.blockMember).toHaveBeenLastCalledWith(expect.anything(), "handle", "bob");
    await run(blockMember, { kind: "request", value: REF });
    expect(mocks.fakes.blockMember).toHaveBeenLastCalledWith(expect.anything(), "request", REF);
    await run(blockMember, { kind: "contact", value: REF });
    expect(mocks.fakes.blockMember).toHaveBeenLastCalledWith(expect.anything(), "contact", REF);
  });

  it("introuvable par identifiant : même message qu'une demande ; autres réponses", async () => {
    returns("blockMember", "not-found");
    expect((await run(blockMember, { kind: "handle", value: "bob" })).message).toBe(SEND_MESSAGES["not-found"]);
    expect((await run(blockMember, { kind: "contact", value: REF })).message).toBe(BLOCK_MESSAGES["not-found"]);
    for (const result of ["already-blocked", "self", "blocks-full"] as const) {
      returns("blockMember", result);
      expect((await run(blockMember, { kind: "handle", value: "bob" })).message, result).toBe(BLOCK_MESSAGES[result]);
    }
  });

  it("type ou valeur invalides : refusés sans appel à Supabase", async () => {
    for (const fields of [
      { kind: "account", value: ALICE } as Record<string, string>,
      { kind: "request", value: "bob" },
      { kind: "handle", value: "a" },
      {},
    ]) {
      expect((await run(blockMember, fields)).status, JSON.stringify(fields)).toBe("error");
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.fakes.blockMember).not.toHaveBeenCalled();
  });
});
