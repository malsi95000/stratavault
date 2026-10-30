// Server Actions du partage (actions.ts, coopActions.ts) : session vérifiée, compte attendu, validation
// avant tout appel, limite par IP, réponses de la base traduites en messages, erreurs classées. Les
// accès aux données (src/lib/supabase/sharing.ts, testés à part) sont simulés.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITED } from "@/features/auth/messages";
import { resetAuthRateLimits } from "@/features/auth/rateLimit";
import { blankDoc } from "@/features/map-doc/schema";
import {
  acceptLink,
  answerInvitation,
  cancelInvitation,
  createLink,
  inviteContact,
  leaveMap,
  previewLink,
  removeMember,
  revokeLink,
  setMemberRole,
} from "./actions";
import { INITIAL_SHARING_STATE } from "./actionState";
import { acquireMapLock, getSharedMapState, openSharedMap, releaseMapLock, saveSharedMap } from "./coopActions";
import {
  INVITE_MESSAGES,
  JOIN_MESSAGES,
  LINKS_FULL,
  LINK_CREATED,
  MAP_LEFT,
  MEMBER_REMOVED,
  SHARE_GONE,
  SHARING_INVALID,
  SHARING_NO_PROFILE,
  SHARING_RATE_LIMITED,
  SHARING_SESSION_CHANGED,
  SHARING_SESSION_ENDED,
  SHARING_UNAVAILABLE,
} from "./messages";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MAP = "12345678-1234-4234-8234-123456789abc";
const REF = "87654321-4321-4321-8321-cba987654321";
const TOKEN = "f".repeat(64);

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

vi.mock("@/lib/supabase/sharing", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase/sharing")>();
  const names = [
    "inviteContact",
    "cancelInvitation",
    "createLink",
    "revokeLink",
    "setMemberRole",
    "removeMember",
    "answerInvitation",
    "previewLink",
    "acceptLink",
    "leaveMap",
    "openSharedMap",
    "getSharedMapState",
    "acquireLock",
    "releaseLock",
    "saveSharedMap",
  ];
  for (const name of names) mocks.fakes[name] = vi.fn(async () => mocks.results[name]?.());
  return { ...original, ...mocks.fakes };
});

const { SharingDataError } = await import("@/lib/supabase/sharing");

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
const run = (action: typeof inviteContact, fields: Record<string, string>) => action(INITIAL_SHARING_STATE, form(fields));
const session = expect.objectContaining({ marker: "client de la session" });

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

describe("partager une carte", () => {
  it("inviter un contact : entrées revalidées, client de la session, page relue", async () => {
    returns("inviteContact", "invited");
    expect(await run(inviteContact, { map: MAP, contact: REF, role: "editor" })).toEqual({ status: "success", message: INVITE_MESSAGES.invited });
    expect(mocks.fakes.inviteContact).toHaveBeenCalledWith(session, MAP, REF, "editor");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    for (const result of ["not-found", "already-member", "already-invited", "map-full", "unavailable"] as const) {
      returns("inviteContact", result);
      expect(await run(inviteContact, { map: MAP, contact: REF, role: "editor" })).toEqual({ status: "error", message: INVITE_MESSAGES[result] });
    }
  });

  it("entrées invalides : refusées sans appel à Supabase", async () => {
    for (const fields of [
      { map: "x", contact: REF, role: "editor" },
      { map: MAP, contact: REF, role: "owner" },
      { map: MAP.toUpperCase(), contact: REF, role: "reader" },
    ]) {
      expect(await run(inviteContact, fields)).toEqual({ status: "error", message: SHARING_INVALID });
    }
    for (const fields of [
      { map: MAP, role: "reader", maxUses: "7", hours: "24" },
      { map: MAP, role: "reader", maxUses: "5", hours: "48" },
      { map: MAP, role: "reader", maxUses: "5e0", hours: "24" },
    ]) {
      expect(await run(createLink, fields)).toEqual({ status: "error", message: SHARING_INVALID });
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("créer un lien : le jeton est renvoyé une fois ; 10 liens actifs au plus", async () => {
    returns("createLink", TOKEN);
    expect(await run(createLink, { map: MAP, role: "reader", maxUses: "5", hours: "168" })).toEqual({
      status: "success",
      message: LINK_CREATED,
      link: TOKEN,
    });
    expect(mocks.fakes.createLink).toHaveBeenCalledWith(session, MAP, { role: "reader", maxUses: 5, hours: 168 });
    throws("createLink", new SharingDataError("links-full"));
    expect(await run(createLink, { map: MAP, role: "reader", maxUses: "5", hours: "168" })).toEqual({ status: "error", message: LINKS_FULL });
  });

  it("révoquer, annuler, changer de rôle, retirer : réponses et références", async () => {
    returns("revokeLink", "not-found");
    expect(await run(revokeLink, { link: REF })).toEqual({ status: "error", message: SHARE_GONE });
    returns("cancelInvitation", "cancelled");
    expect((await run(cancelInvitation, { invitation: REF })).status).toBe("success");
    returns("setMemberRole", "updated");
    expect((await run(setMemberRole, { member: REF, role: "reader" })).status).toBe("success");
    expect(mocks.fakes.setMemberRole).toHaveBeenCalledWith(session, REF, "reader");
    returns("removeMember", "removed");
    expect(await run(removeMember, { member: REF })).toEqual({ status: "success", message: MEMBER_REMOVED });
    expect(await run(removeMember, { member: "x" })).toEqual({ status: "error", message: SHARE_GONE });
  });

  it("erreurs classées : profil, limite, session, panne", async () => {
    const cases = [
      ["no-profile", SHARING_NO_PROFILE],
      ["rate-limited", SHARING_RATE_LIMITED],
      ["unauthorized", SHARING_SESSION_ENDED],
      ["unavailable", SHARING_UNAVAILABLE],
    ] as const;
    for (const [kind, message] of cases) {
      throws("inviteContact", new SharingDataError(kind));
      expect(await run(inviteContact, { map: MAP, contact: REF, role: "editor" }), kind).toEqual({ status: "error", message });
    }
    throws("inviteContact", new Error("détail interne"));
    expect(await run(inviteContact, { map: MAP, contact: REF, role: "editor" })).toEqual({ status: "error", message: SHARING_UNAVAILABLE });
  });

  it("autre compte ouvert, session finie, limite par IP : rien n'est fait", async () => {
    expect(await run(leaveMap, { map: MAP, account: "autre" })).toEqual({ status: "error", message: SHARING_SESSION_CHANGED });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", message: "x", status: 400 } });
    expect(await run(leaveMap, { map: MAP })).toEqual({ status: "error", message: SHARING_SESSION_ENDED });
    mocks.getUser.mockResolvedValue({ data: { user: { id: ALICE } }, error: null });
    returns("leaveMap", "left");
    mocks.ip.value = "198.51.100.7";
    let last = await run(leaveMap, { map: MAP });
    expect(last).toEqual({ status: "success", message: MAP_LEFT });
    for (let i = 0; i < 60; i += 1) last = await run(leaveMap, { map: MAP });
    expect(last).toEqual({ status: "error", message: RATE_LIMITED });
    expect(mocks.fakes.leaveMap).toHaveBeenCalledTimes(60);
  });
});

describe("rejoindre une carte", () => {
  it("invitation acceptée : la carte rejointe est renvoyée ; refusée : message", async () => {
    returns("answerInvitation", { status: "joined", mapId: MAP });
    expect(await run(answerInvitation, { invitation: REF, answer: "accept" })).toEqual({
      status: "success",
      message: JOIN_MESSAGES.joined,
      mapId: MAP,
    });
    expect(mocks.fakes.answerInvitation).toHaveBeenCalledWith(session, REF, true);
    returns("answerInvitation", { status: "refused", mapId: null });
    expect(await run(answerInvitation, { invitation: REF, answer: "refuse" })).toEqual({ status: "success", message: JOIN_MESSAGES.refused });
    returns("answerInvitation", { status: "map-full", mapId: null });
    expect(await run(answerInvitation, { invitation: REF, answer: "accept" })).toEqual({ status: "error", message: JOIN_MESSAGES["map-full"] });
    expect(await run(answerInvitation, { invitation: REF, answer: "peut-être" })).toEqual({ status: "error", message: JOIN_MESSAGES["not-found"] });
  });

  it("lien : jeton revalidé ; aperçu, puis entrée (déjà membre ou propriétaire : la carte s'ouvre)", async () => {
    expect(await run(previewLink, { token: "abc" })).toEqual({ status: "error", message: JOIN_MESSAGES["not-found"] });
    expect(await run(acceptLink, { token: TOKEN.toUpperCase() })).toEqual({ status: "error", message: JOIN_MESSAGES["not-found"] });
    expect(mocks.getUser).not.toHaveBeenCalled();
    const preview = { mapName: "C", role: "reader", ownerHandle: "alice", ownerName: "Alice", expiresAt: "t", myRole: null };
    returns("previewLink", preview);
    expect(await run(previewLink, { token: TOKEN })).toEqual({ status: "success", message: "", preview });
    returns("previewLink", null);
    expect(await run(previewLink, { token: TOKEN })).toEqual({ status: "error", message: JOIN_MESSAGES["not-found"] });
    for (const status of ["joined", "already-member", "owner"] as const) {
      returns("acceptLink", { status, mapId: MAP });
      expect(await run(acceptLink, { token: TOKEN })).toEqual({ status: "success", message: JOIN_MESSAGES[status], mapId: MAP });
    }
    returns("acceptLink", { status: "not-found", mapId: null });
    expect(await run(acceptLink, { token: TOKEN })).toEqual({ status: "error", message: JOIN_MESSAGES["not-found"] });
    // Aucune page à relire : le navigateur ouvre la carte.
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("éditeur coopératif", () => {
  it("compte attendu et identifiant de carte revalidés", async () => {
    expect(await openSharedMap("autre", MAP)).toEqual({ ok: false, error: "unauthorized" });
    expect(await getSharedMapState(ALICE, "x")).toEqual({ ok: false, error: "invalid" });
    returns("acquireLock", { status: "acquired", expiresAt: "e" });
    expect(await acquireMapLock(ALICE, MAP)).toEqual({ ok: true, value: { status: "acquired", expiresAt: "e" } });
    returns("releaseLock", true);
    expect(await releaseMapLock(ALICE, MAP)).toEqual({ ok: true, value: true });
    expect(mocks.fakes.releaseLock).toHaveBeenCalledWith(session, MAP);
  });

  it("enregistrement : carte revalidée, version exigée, erreurs de la base classées", async () => {
    returns("saveSharedMap", { revision: 8, updated: "t" });
    expect(await saveSharedMap(ALICE, MAP, blankDoc(), 7)).toEqual({ ok: true, value: { revision: 8, updated: "t" } });
    expect(await saveSharedMap(ALICE, MAP, { pas: "une carte" } as never, 7)).toEqual({ ok: false, error: "invalid" });
    expect(await saveSharedMap(ALICE, MAP, blankDoc(), 0)).toEqual({ ok: false, error: "conflict" });
    for (const kind of ["locked", "conflict", "too-large", "rate-limited"] as const) {
      throws("saveSharedMap", new SharingDataError(kind));
      expect(await saveSharedMap(ALICE, MAP, blankDoc(), 7)).toEqual({ ok: false, error: kind });
    }
    throws("saveSharedMap", new SharingDataError("links-full"));
    expect(await saveSharedMap(ALICE, MAP, blankDoc(), 7)).toEqual({ ok: false, error: "unavailable" });
  });
});
