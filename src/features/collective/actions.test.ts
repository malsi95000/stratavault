// Server Actions de la carte collective (actions.ts, syncActions.ts) : session vérifiée, compte
// attendu, validation avant tout appel, limite par IP, réponses de la base traduites en messages,
// erreurs classées. Les accès aux données (src/lib/supabase/collective.ts, testés à part) sont simulés.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthRateLimits } from "@/features/auth/rateLimit";
import { blockCollectiveAuthor, deleteOwnCollectiveItem, moderateCollectiveItem, reportCollectiveItem } from "./actions";
import { decisionReason } from "./decisionGrounds";
import { INITIAL_COLLECTIVE_STATE } from "./actionState";
import {
  ACTION_SESSION_CHANGED,
  BLOCK_AUTHOR_INVALID,
  BLOCK_AUTHOR_RATE_LIMITED,
  BLOCK_AUTHOR_RESULTS_TEXT,
  COLLECTIVE_SESSION_ENDED,
  HIDDEN_DELETED,
  MODERATE_INVALID,
  MODERATE_RESULTS_TEXT,
  MODERATION_FORBIDDEN,
  REPORT_INVALID,
  REPORT_RATE_LIMITED,
  REPORT_RESULTS_TEXT,
} from "./messages";
import { createCollectiveItem, deleteCollectiveItem, getCollectiveState, loadCollectiveMap } from "./syncActions";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  results: {} as Record<string, () => unknown>,
  fakes: {} as Record<string, ReturnType<typeof vi.fn>>,
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ marker: "client de la session", auth: { getUser: mocks.getUser } }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/lib/supabase/collective", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase/collective")>();
  for (const name of ["blockAuthor", "reportItem", "moderateItem", "deleteItem", "createItem", "updateItem", "getCollectiveState", "loadCollectiveItems"]) {
    mocks.fakes[name] = vi.fn(async () => mocks.results[name]?.());
  }
  return { ...original, ...mocks.fakes };
});

const { CollectiveDataError } = await import("@/lib/supabase/collective");

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
const session = expect.objectContaining({ marker: "client de la session" });
const ping = { ll: [2, 48], type: "crise", title: "T", note: "" };

beforeEach(() => {
  resetAuthRateLimits();
  mocks.results = {};
  for (const fake of Object.values(mocks.fakes)) fake.mockClear();
  mocks.refresh.mockClear();
  mocks.getUser.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: ALICE, email: "a@exemple.fr" } }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("bloquer l'auteur d'un élément", () => {
  it("identifiant revalidé, client de la session, réponse traduite", async () => {
    returns("blockAuthor", "blocked");
    expect(await blockCollectiveAuthor(INITIAL_COLLECTIVE_STATE, form({ item: "p1" }))).toEqual({
      status: "success",
      message: BLOCK_AUTHOR_RESULTS_TEXT.blocked,
    });
    expect(mocks.fakes.blockAuthor).toHaveBeenCalledWith(session, "p1");
    for (const result of ["blocks-full", "own-item", "not-found"] as const) {
      returns("blockAuthor", result);
      expect(await blockCollectiveAuthor(INITIAL_COLLECTIVE_STATE, form({ item: "p1" }))).toEqual({
        status: "error",
        message: BLOCK_AUTHOR_RESULTS_TEXT[result],
      });
    }
    throws("blockAuthor", new CollectiveDataError("rate-limited"));
    expect(await blockCollectiveAuthor(INITIAL_COLLECTIVE_STATE, form({ item: "p1" }))).toEqual({
      status: "error",
      message: BLOCK_AUTHOR_RATE_LIMITED,
    });
  });

  it("identifiant mal formé ou autre compte : refus, sans appel à la base", async () => {
    mocks.fakes.blockAuthor.mockClear();
    expect(await blockCollectiveAuthor(INITIAL_COLLECTIVE_STATE, form({ item: "p 1" }))).toEqual({ status: "error", message: BLOCK_AUTHOR_INVALID });
    expect(await blockCollectiveAuthor(INITIAL_COLLECTIVE_STATE, form({ item: "p1", account: BOB }))).toEqual({
      status: "error",
      message: ACTION_SESSION_CHANGED,
    });
    expect(mocks.fakes.blockAuthor).not.toHaveBeenCalled();
  });
});

describe("signaler un élément", () => {
  it("entrées revalidées, client de la session, réponse traduite", async () => {
    returns("reportItem", "reported");
    const fields = { item: "p1", reason: "hate", details: "  Propos\r\nhaineux  " };
    expect(await reportCollectiveItem(INITIAL_COLLECTIVE_STATE, form(fields))).toEqual({ status: "success", message: REPORT_RESULTS_TEXT.reported });
    expect(mocks.fakes.reportItem).toHaveBeenCalledWith(session, "p1", "hate", "Propos\nhaineux", false);
    for (const result of ["already-reported", "own-item", "not-found"] as const) {
      returns("reportItem", result);
      expect(await reportCollectiveItem(INITIAL_COLLECTIVE_STATE, form(fields))).toEqual({ status: "error", message: REPORT_RESULTS_TEXT[result] });
    }
  });

  it("entrées invalides : refusées sans appel à Supabase", async () => {
    const cases: Record<string, string>[] = [
      // Contenu illicite : explication et déclaration de bonne foi exigées.
      { item: "p1", reason: "illegal", details: "", goodFaith: "on" },
      { item: "p1", reason: "illegal", details: "Publie l’adresse d’une personne.", goodFaith: "" },
      { item: "p 1", reason: "spam", details: "" },
      { item: "p1", reason: "inconnu", details: "" },
      { item: "p1", reason: "spam", details: "a".repeat(501) },
      { item: "p1", reason: "spam", details: "‮" },
    ];
    for (const fields of cases) {
      expect(await reportCollectiveItem(INITIAL_COLLECTIVE_STATE, form(fields))).toEqual({ status: "error", message: REPORT_INVALID });
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("limite de la base, autre compte ouvert, session terminée", async () => {
    throws("reportItem", new CollectiveDataError("rate-limited"));
    expect(await reportCollectiveItem(INITIAL_COLLECTIVE_STATE, form({ item: "p1", reason: "spam", details: "" }))).toEqual({
      status: "error",
      message: REPORT_RATE_LIMITED,
    });
    expect(await reportCollectiveItem(INITIAL_COLLECTIVE_STATE, form({ account: BOB, item: "p1", reason: "spam", details: "" }))).toEqual({
      status: "error",
      message: ACTION_SESSION_CHANGED,
    });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } });
    expect(await reportCollectiveItem(INITIAL_COLLECTIVE_STATE, form({ item: "p1", reason: "spam", details: "" }))).toEqual({
      status: "error",
      message: COLLECTIVE_SESSION_ENDED,
    });
  });
});

describe("signaler un contenu illicite", () => {
  it("avec l'explication et la déclaration de bonne foi, le signalement part", async () => {
    returns("reportItem", "reported");
    const fields = { item: "p1", reason: "illegal", details: "Publie l’adresse d’une personne.", goodFaith: "on" };
    expect(await reportCollectiveItem(INITIAL_COLLECTIVE_STATE, form(fields))).toEqual({ status: "success", message: REPORT_RESULTS_TEXT.reported });
    expect(mocks.fakes.reportItem).toHaveBeenCalledWith(session, "p1", "illegal", "Publie l’adresse d’une personne.", true);
  });
});

describe("modération", () => {
  it("décision : motif obligatoire, page relue après succès", async () => {
    returns("moderateItem", "hidden");
    const fields = { item: "p1", action: "hide", ground: "hate", reason: "Propos haineux" };
    expect(await moderateCollectiveItem(INITIAL_COLLECTIVE_STATE, form(fields))).toEqual({ status: "success", message: MODERATE_RESULTS_TEXT.hidden });
    // Le motif transmis commence par la règle en cause des conditions d'utilisation.
    expect(mocks.fakes.moderateItem).toHaveBeenCalledWith(session, "p1", "hide", decisionReason("hate", "Propos haineux"), false);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    returns("moderateItem", "own-item");
    expect(await moderateCollectiveItem(INITIAL_COLLECTIVE_STATE, form(fields))).toEqual({ status: "error", message: MODERATE_RESULTS_TEXT["own-item"] });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    for (const bad of [
      { ...fields, reason: " a " },
      { ...fields, action: "ban" },
      { ...fields, ground: "" },
      { ...fields, ground: "no-breach" },
      { ...fields, action: "restore" },
    ]) {
      expect(await moderateCollectiveItem(INITIAL_COLLECTIVE_STATE, form(bad))).toEqual({ status: "error", message: MODERATE_INVALID });
    }
  });

  it("contenu illicite : le texte de loi en cause est exigé et placé dans le motif", async () => {
    returns("moderateItem", "deleted");
    const fields = { item: "p1", action: "delete", ground: "illegal", legalBasis: "Code pénal, art. 223-1-1", reason: "Expose l’adresse d’une personne" };
    expect(await moderateCollectiveItem(INITIAL_COLLECTIVE_STATE, form(fields))).toMatchObject({ status: "success" });
    expect(mocks.fakes.moderateItem).toHaveBeenCalledWith(
      session,
      "p1",
      "delete",
      decisionReason("illegal", "Expose l’adresse d’une personne", "Code pénal, art. 223-1-1"),
      false,
    );
    expect(decisionReason("illegal", "x", "Code pénal, art. 223-1-1")).toContain("Fondement légal : Code pénal, art. 223-1-1.");
    mocks.fakes.moderateItem.mockClear();
    for (const bad of [{ ...fields, legalBasis: "" }, { ...fields, ground: "spam" }]) {
      expect(await moderateCollectiveItem(INITIAL_COLLECTIVE_STATE, form(bad))).toEqual({ status: "error", message: MODERATE_INVALID });
    }
    expect(mocks.fakes.moderateItem).not.toHaveBeenCalled();
  });

  it("suspension de l'auteur : avec un masquage ou une suppression seulement", async () => {
    returns("moderateItem", "deleted");
    const fields = { item: "p1", action: "delete", ground: "spam", reason: "Spam répété", suspend: "on" };
    expect(await moderateCollectiveItem(INITIAL_COLLECTIVE_STATE, form(fields))).toMatchObject({ status: "success" });
    expect(mocks.fakes.moderateItem).toHaveBeenCalledWith(session, "p1", "delete", decisionReason("spam", "Spam répété"), true);
    mocks.fakes.moderateItem.mockClear();
    for (const bad of [
      { ...fields, action: "dismiss", ground: "no-breach" },
      { ...fields, action: "restore", ground: "no-breach" },
      { ...fields, suspend: "oui" },
    ]) {
      expect(await moderateCollectiveItem(INITIAL_COLLECTIVE_STATE, form(bad))).toEqual({ status: "error", message: MODERATE_INVALID });
    }
    expect(mocks.fakes.moderateItem).not.toHaveBeenCalled();
  });

  it("compte qui n'est pas modérateur : refus", async () => {
    throws("moderateItem", new CollectiveDataError("forbidden"));
    expect(await moderateCollectiveItem(INITIAL_COLLECTIVE_STATE, form({ item: "p1", action: "delete", ground: "other-terms", reason: "Motif" }))).toEqual({
      status: "error",
      message: MODERATION_FORBIDDEN,
    });
  });

  it("suppression d'un de ses éléments masqués, depuis un avis", async () => {
    returns("deleteItem", { status: "deleted", step: { from: 1, to: 2 } });
    expect(await deleteOwnCollectiveItem(INITIAL_COLLECTIVE_STATE, form({ item: "p1" }))).toEqual({ status: "success", message: HIDDEN_DELETED });
    expect(mocks.fakes.deleteItem).toHaveBeenCalledWith(session, "p1");
  });
});

describe("session de la carte", () => {
  it("lecture et écritures pour le compte attendu seulement", async () => {
    returns("getCollectiveState", { revision: 1 });
    expect(await getCollectiveState(ALICE)).toEqual({ ok: true, value: { revision: 1 } });
    expect(await getCollectiveState(BOB)).toEqual({ ok: false, error: "unauthorized" });
    returns("loadCollectiveItems", []);
    expect(await loadCollectiveMap(ALICE)).toEqual({ ok: true, value: [] });
  });

  it("contenu revalidé avant l'envoi ; erreurs classées", async () => {
    returns("createItem", { status: "created", authorName: "Alice", createdAt: "x", step: null });
    expect((await createCollectiveItem(ALICE, "ping", "p1", ping)).ok).toBe(true);
    expect(mocks.fakes.createItem).toHaveBeenCalledWith(session, { kind: "ping", id: "p1", data: ping });
    expect(await createCollectiveItem(ALICE, "ping", "p1", { ...ping, title: "a".repeat(201) })).toEqual({ ok: false, error: "invalid" });
    expect(await createCollectiveItem(ALICE, "virus", "p1", ping)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.fakes.createItem).toHaveBeenCalledOnce();
    throws("createItem", new CollectiveDataError("no-profile"));
    expect(await createCollectiveItem(ALICE, "ping", "p1", ping)).toEqual({ ok: false, error: "no-profile" });
    throws("createItem", new CollectiveDataError("forbidden"));
    expect(await createCollectiveItem(ALICE, "ping", "p1", ping)).toEqual({ ok: false, error: "unavailable" });
    throws("createItem", new Error("panne"));
    expect(await createCollectiveItem(ALICE, "ping", "p1", ping)).toEqual({ ok: false, error: "unavailable" });
    expect(await deleteCollectiveItem(ALICE, "p 1")).toEqual({ ok: false, error: "invalid" });
  });
});
