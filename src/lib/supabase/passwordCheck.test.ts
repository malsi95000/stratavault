import { AuthApiError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withPasswordSession } from "./passwordCheck";

// Client supabase-js simulé : on vérifie les options du client temporaire, que `use` reçoit ce
// client (et lui seul) une fois le mot de passe accepté, et la fermeture de sa session ensuite.
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  client: null as unknown,
}));

vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient: mocks.createClient,
}));

// La session du navigateur ne doit jamais être lue ni écrite.
vi.mock("next/headers", () => ({
  cookies: () => {
    throw new Error("cookies() ne doit pas être appelé");
  },
}));

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projet.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  for (const fn of [mocks.createClient, mocks.signInWithPassword, mocks.signOut]) fn.mockReset();
  mocks.client = { auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut } };
  mocks.createClient.mockReturnValue(mocks.client);
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const signedIn = () =>
  mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: ALICE }, session: {} }, error: null });

describe("withPasswordSession", () => {
  it("client temporaire sans persistance ni renouvellement, passé à `use`, puis session fermée", async () => {
    signedIn();
    const order: string[] = [];
    mocks.signOut.mockImplementation(async () => (order.push("signOut"), { error: null }));
    const use = vi.fn(async () => (order.push("use"), "fait"));
    expect(await withPasswordSession("alice@exemple.fr", "secret", use)).toEqual({ ok: true, value: "fait" });
    expect(mocks.createClient).toHaveBeenCalledWith("https://projet.supabase.co", "sb_publishable_test", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "alice@exemple.fr", password: "secret" });
    expect(use).toHaveBeenCalledExactlyOnceWith({ client: mocks.client, userId: ALICE });
    // La session est encore ouverte pendant `use` (jeton tout neuf), fermée ensuite.
    expect(order).toEqual(["use", "signOut"]);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("mauvais mot de passe : renvoie l'erreur, sans appeler `use` ni fermer de session", async () => {
    const error = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error });
    const use = vi.fn();
    expect(await withPasswordSession("alice@exemple.fr", "faux", use)).toEqual({ ok: false, error });
    expect(use).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("un échec de la fermeture de la session temporaire n'invalide pas le résultat", async () => {
    signedIn();
    mocks.signOut.mockRejectedValue(new TypeError("fetch failed"));
    expect(await withPasswordSession("alice@exemple.fr", "secret", async () => 1)).toEqual({ ok: true, value: 1 });
  });

  it("une erreur de `use` est transmise, et la session temporaire est quand même fermée", async () => {
    signedIn();
    const failure = new Error("échec");
    await expect(
      withPasswordSession("alice@exemple.fr", "secret", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("Supabase non configuré : null", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await withPasswordSession("alice@exemple.fr", "secret", async () => 1)).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
