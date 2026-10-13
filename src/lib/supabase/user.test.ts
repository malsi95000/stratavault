import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkActiveUser, checkCurrentUser, getCurrentUser } from "./user";

// Client serveur simulé : seuls getClaims() et getUser() comptent ici.
const claims = vi.hoisted(() => ({ result: (): unknown => ({ data: null, error: null }) }));
const users = vi.hoisted(() => ({ result: (): unknown => ({ data: { user: null }, error: null }) }));
vi.mock("./server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => claims.result(), getUser: async () => users.result() },
  }),
}));

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("vérification de la session (getClaims)", () => {
  beforeEach(() => {
    claims.result = () => ({ data: null, error: null });
  });

  it("utilisateur vérifié", async () => {
    claims.result = () => ({ data: { claims: { sub: ALICE, email: "a@exemple.fr" } }, error: null });
    expect(await checkCurrentUser()).toEqual({ status: "signed-in", user: { id: ALICE, email: "a@exemple.fr" } });
    expect(await getCurrentUser()).toEqual({ id: ALICE, email: "a@exemple.fr" });
  });

  it("jeton refusé ou absent : pas de session", async () => {
    claims.result = () => ({ data: null, error: new AuthApiError("jwt expired", 401, "bad_jwt") });
    expect(await checkCurrentUser()).toEqual({ status: "signed-out" });
    claims.result = () => ({ data: null, error: null });
    expect(await checkCurrentUser()).toEqual({ status: "signed-out" });
  });

  it("Supabase injoignable : vérification impossible, distincte d'une session expirée", async () => {
    claims.result = () => ({ data: null, error: new AuthRetryableFetchError("fetch failed", 0) });
    expect(await checkCurrentUser()).toEqual({ status: "unavailable" });
    claims.result = () => {
      throw new TypeError("fetch failed");
    };
    expect(await checkCurrentUser()).toEqual({ status: "unavailable" });
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("vérification de la session auprès de l'API Auth (getUser)", () => {
  beforeEach(() => {
    users.result = () => ({ data: { user: null }, error: null });
  });

  it("session active", async () => {
    users.result = () => ({ data: { user: { id: ALICE, email: "a@exemple.fr" } }, error: null });
    expect(await checkActiveUser()).toEqual({ status: "signed-in", user: { id: ALICE, email: "a@exemple.fr" } });
  });

  it("session révoquée (déconnexion), jeton refusé ou absent : pas de session", async () => {
    // Après « Se déconnecter », le jeton reste signé mais l'API Auth ne connaît plus la session.
    users.result = () => ({
      data: { user: null },
      error: new AuthApiError("Session from session_id claim in JWT does not exist", 403, "session_not_found"),
    });
    expect(await checkActiveUser()).toEqual({ status: "signed-out" });
    users.result = () => ({ data: { user: null }, error: new AuthSessionMissingError() });
    expect(await checkActiveUser()).toEqual({ status: "signed-out" });
    users.result = () => ({ data: { user: null }, error: null });
    expect(await checkActiveUser()).toEqual({ status: "signed-out" });
  });

  it("API Auth injoignable, surchargée ou limitée : vérification impossible, pas « session terminée »", async () => {
    users.result = () => ({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    expect(await checkActiveUser()).toEqual({ status: "unavailable" });
    users.result = () => ({ data: { user: null }, error: new AuthApiError("Too many requests", 429, "over_request_rate_limit") });
    expect(await checkActiveUser()).toEqual({ status: "unavailable" });
    users.result = () => ({ data: { user: null }, error: new AuthApiError("Internal error", 500, "unexpected_failure") });
    expect(await checkActiveUser()).toEqual({ status: "unavailable" });
    users.result = () => {
      throw new TypeError("fetch failed");
    };
    expect(await checkActiveUser()).toEqual({ status: "unavailable" });
  });
});
