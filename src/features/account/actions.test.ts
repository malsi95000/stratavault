import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_AUTH_STATE } from "@/features/auth/formState";
import { NOT_CONFIGURED, RATE_LIMITED, UNAVAILABLE } from "@/features/auth/messages";
import { resetAuthRateLimits } from "@/features/auth/rateLimit";
import { deleteMyAccount } from "./actions";
import {
  ACCOUNT_DELETED,
  CONFIRMATION_REQUIRED,
  DELETE_FAILED,
  SESSION_CHANGED,
  SESSION_ENDED,
  WRONG_PASSWORD,
} from "./messages";

// Client Supabase de la session (getUser, rpc), session temporaire ouverte par le mot de passe
// (withPasswordSession, avec son propre rpc), cookies et en-têtes de Next simulés.
const mocks = vi.hoisted(() => ({
  configured: { value: true },
  ip: { value: "203.0.113.7" },
  jar: new Map<string, string>(),
  getUser: vi.fn(),
  /** rpc du client de la session du navigateur : ne doit jamais servir à supprimer le compte. */
  rpc: vi.fn(),
  /** rpc du client de la session temporaire ouverte par le mot de passe. */
  freshRpc: vi.fn(),
  /** Issue de la connexion par mot de passe : compte ouvert, ou erreur de Supabase Auth. */
  password: { value: { ok: true, userId: "" } as { ok: true; userId: string } | { ok: false; error: unknown } },
  withPasswordSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => (mocks.configured.value ? { auth: { getUser: mocks.getUser }, rpc: mocks.rpc } : null),
}));

vi.mock("@/lib/supabase/passwordCheck", () => ({ withPasswordSession: mocks.withPasswordSession }));

/** Comme withPasswordSession : `run` ne reçoit le client que si le mot de passe a ouvert une session. */
async function fakePasswordSession(_email: string, _password: string, run: (session: unknown) => Promise<unknown>) {
  const result = mocks.password.value;
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, value: await run({ client: { rpc: mocks.freshRpc }, userId: result.userId }) };
}

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `192.0.2.250, ${mocks.ip.value}` }),
  cookies: async () => ({
    getAll: () => [...mocks.jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => mocks.jar.set(name, value),
    delete: (name: string) => mocks.jar.delete(name),
  }),
}));

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMAIL = "alice@exemple.fr";
const PASSWORD = "le mot de passe d’Alice";

const SESSION_COOKIES = ["sb-abcd-auth-token", "sb-abcd-auth-token.0", "sb-abcd-auth-token-code-verifier"];

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
};
const request = (overrides: Record<string, string> = {}) =>
  form({ account: ALICE, password: PASSWORD, confirm: "SUPPRIMER", ...overrides });
const submit = (data: FormData = request()) => deleteMyAccount(INITIAL_AUTH_STATE, data);

const signedInAs = (id: string, email: string | null = EMAIL) =>
  mocks.getUser.mockResolvedValue({ data: { user: { id, email } }, error: null });
const passwordOk = (userId = ALICE) => (mocks.password.value = { ok: true, userId });
const passwordFails = (error: unknown) => (mocks.password.value = { ok: false, error });
const passwordWrong = () => passwordFails(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"));

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.configured.value = true;
  mocks.ip.value = "203.0.113.7";
  mocks.jar.clear();
  for (const name of [...SESSION_COOKIES, "sv-demo", "autre"]) mocks.jar.set(name, "x");
  resetAuthRateLimits();
  for (const fn of [mocks.getUser, mocks.rpc, mocks.freshRpc, mocks.withPasswordSession]) fn.mockReset();
  mocks.withPasswordSession.mockImplementation(fakePasswordSession);
  signedInAs(ALICE);
  passwordOk();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.freshRpc.mockResolvedValue({ data: true, error: null });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // Jamais de mot de passe dans les journaux.
  for (const call of consoleError.mock.calls) expect(JSON.stringify(call)).not.toContain(PASSWORD);
  consoleError.mockRestore();
});

/** Rien n'a été supprimé : ni appel à la fonction de la base, ni cookie effacé. */
function expectNothingDeleted() {
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.freshRpc).not.toHaveBeenCalled();
  for (const name of [...SESSION_COOKIES, "sv-demo"]) expect(mocks.jar.has(name), name).toBe(true);
}

describe("deleteMyAccount", () => {
  it("supprime le compte, puis efface les cookies de session et du mode démo", async () => {
    expect(await submit()).toEqual({ status: "success", message: ACCOUNT_DELETED, fieldErrors: {} });
    // Mot de passe vérifié pour l'adresse du compte vérifié (getUser), pas pour une adresse envoyée.
    expect(mocks.withPasswordSession).toHaveBeenCalledWith(EMAIL, PASSWORD, expect.any(Function));
    // La fonction de la base est appelée avec le jeton de la session ouverte par le mot de passe
    // (exigé par la base), jamais avec celui du cookie de session.
    expect(mocks.freshRpc).toHaveBeenCalledExactlyOnceWith("delete_my_account");
    expect(mocks.rpc).not.toHaveBeenCalled();
    for (const name of [...SESSION_COOKIES, "sv-demo"]) expect(mocks.jar.has(name), name).toBe(false);
    expect(mocks.jar.has("autre")).toBe(true);
  });

  it("exige SUPPRIMER en toutes lettres, sans rien demander à Supabase", async () => {
    for (const confirm of ["", "supprimer", "SUPPRIME", "OUI"]) {
      const state = await submit(request({ confirm }));
      expect(state.status).toBe("error");
      expect(state.fieldErrors).toEqual({ confirm: CONFIRMATION_REQUIRED });
    }
    // Espaces autour du mot : acceptés.
    expect((await submit(request({ confirm: " SUPPRIMER " }))).status).toBe("success");
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it("exige le mot de passe", async () => {
    const state = await submit(request({ password: "" }));
    expect(Object.keys(state.fieldErrors)).toEqual(["password"]);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expectNothingDeleted();
  });

  it("refuse sans session (cookie absent, révoqué ou expiré)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    expect(await submit()).toMatchObject({ status: "error", message: SESSION_ENDED });
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Session not found", 403, "session_not_found"),
    });
    expect(await submit()).toMatchObject({ status: "error", message: SESSION_ENDED });
    expect(mocks.withPasswordSession).not.toHaveBeenCalled();
    expectNothingDeleted();
  });

  it("Supabase injoignable : message générique, rien de supprimé", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    expect(await submit()).toMatchObject({ status: "error", message: UNAVAILABLE });
    expectNothingDeleted();
  });

  it("ne supprime jamais un autre compte que celui de la page", async () => {
    // Déconnexion puis connexion de Bob dans un autre onglet : le cookie est désormais le sien.
    signedInAs(BOB, "bob@exemple.fr");
    expect(await submit()).toMatchObject({ status: "error", message: SESSION_CHANGED });
    expect(await submit(request({ account: "" }))).toMatchObject({ message: SESSION_CHANGED });
    expect(mocks.withPasswordSession).not.toHaveBeenCalled();
    expectNothingDeleted();
  });

  it("mauvais mot de passe : erreur sous le champ, rien de supprimé", async () => {
    passwordWrong();
    expect(await submit()).toEqual({
      status: "error",
      message: WRONG_PASSWORD,
      fieldErrors: { password: WRONG_PASSWORD },
    });
    expectNothingDeleted();
  });

  it("refuse un mot de passe qui ouvrirait un autre compte que celui de la session", async () => {
    passwordOk(BOB);
    expect(await submit()).toMatchObject({ message: WRONG_PASSWORD });
    expectNothingDeleted();
  });

  it("vérification du mot de passe limitée ou impossible chez Supabase : messages génériques", async () => {
    passwordFails(new AuthApiError("Too many requests", 429, "over_request_rate_limit"));
    expect(await submit()).toMatchObject({ message: RATE_LIMITED });
    passwordFails(new AuthRetryableFetchError("fetch failed", 0));
    expect(await submit()).toMatchObject({ message: UNAVAILABLE });
    mocks.withPasswordSession.mockRejectedValue(new TypeError("fetch failed"));
    expect(await submit()).toMatchObject({ message: UNAVAILABLE });
    expectNothingDeleted();
  });

  it("limite les tentatives par IP, avant tout appel à Supabase", async () => {
    passwordWrong();
    // Un compte différent à chaque essai : seule la limite par IP joue.
    for (let i = 0; i < 10; i += 1) {
      const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
      signedInAs(id);
      expect(await submit(request({ account: id }))).toMatchObject({ message: WRONG_PASSWORD });
    }
    mocks.getUser.mockClear();
    expect(await submit()).toMatchObject({ status: "error", message: RATE_LIMITED });
    expect(mocks.getUser).not.toHaveBeenCalled();
    // Autre visiteur : pas concerné.
    mocks.ip.value = "198.51.100.4";
    signedInAs(ALICE);
    passwordOk();
    expect((await submit()).status).toBe("success");
  });

  it("limite les essais de mot de passe par compte, quelle que soit l'IP", async () => {
    passwordWrong();
    for (let i = 0; i < 5; i += 1) {
      mocks.ip.value = `198.51.100.${i + 1}`;
      expect(await submit()).toMatchObject({ message: WRONG_PASSWORD });
    }
    mocks.ip.value = "198.51.100.200";
    passwordOk();
    expect(await submit()).toMatchObject({ status: "error", message: RATE_LIMITED });
    expect(mocks.withPasswordSession).toHaveBeenCalledTimes(5);
    expectNothingDeleted();
  });

  it("échec de la fonction de la base : rien n'est effacé du navigateur", async () => {
    mocks.freshRpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await submit()).toMatchObject({ status: "error", message: DELETE_FAILED });
    expect(mocks.jar.has(SESSION_COOKIES[0])).toBe(true);
    // Authentification trop ancienne pour la base (28000) : rien n'est supprimé.
    mocks.freshRpc.mockResolvedValue({
      data: null,
      error: { code: "28000", message: "account_reauthentication_required" },
    });
    expect(await submit()).toMatchObject({ status: "error", message: DELETE_FAILED });
    // Jeton refusé par la base (42501, ou PGRST3xx de PostgREST) : session terminée.
    mocks.freshRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "account_session_ended" } });
    expect(await submit()).toMatchObject({ message: SESSION_ENDED });
    expect(mocks.jar.has(SESSION_COOKIES[0])).toBe(true);
    // Seul le code est journalisé.
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("boom");
  });

  it("comptes non configurés : rien n'est tenté", async () => {
    mocks.configured.value = false;
    expect(await submit()).toMatchObject({ status: "error", message: NOT_CONFIGURED });
    expect(mocks.withPasswordSession).not.toHaveBeenCalled();
  });
});
