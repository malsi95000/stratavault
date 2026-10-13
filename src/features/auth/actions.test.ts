import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmEmailLink,
  endSession,
  enterDemo,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "./actions";
import { INITIAL_AUTH_STATE } from "./formState";
import { resetAuthRateLimits } from "./rateLimit";
import {
  EMAIL_NOT_CONFIRMED,
  INVALID_CREDENTIALS,
  NOT_CONFIGURED,
  PASSWORD_MISMATCH,
  RATE_LIMITED,
  RECOVERY_EXPIRED,
  RESET_SENT,
  SAME_PASSWORD,
  SIGN_UP_SENT,
  UNAVAILABLE,
  WEAK_PASSWORD,
} from "./messages";

// Client Supabase, cookies, en-têtes et redirection de Next simulés.
const mocks = vi.hoisted(() => {
  class RedirectSignal extends Error {
    constructor(readonly to: string) {
      super("NEXT_REDIRECT");
    }
  }
  return {
    RedirectSignal,
    configured: { value: true },
    ip: { value: "203.0.113.7" },
    /** Élément de gauche de x-forwarded-for, envoyé par le client lui-même. */
    spoofed: { value: "192.0.2.250" },
    /** Le proxy a atteint la limite de rafraîchissement de cette IP (en-tête posé sur la requête). */
    refreshLimited: { value: false },
    /** Options passées à chaque création du client Supabase. */
    clientOptions: [] as unknown[],
    jar: new Map<string, { value: string; options?: object }>(),
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      getClaims: vi.fn(),
      getUser: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
      verifyOtp: vi.fn(),
      exchangeCodeForSession: vi.fn(),
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async (options?: unknown) => {
    mocks.clientOptions.push(options);
    return mocks.configured.value ? { auth: mocks.auth } : null;
  },
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "x-forwarded-for": `${mocks.spoofed.value}, ${mocks.ip.value}`,
      ...(mocks.refreshLimited.value ? { "x-stratavault-refresh-limited": "1" } : {}),
    }),
  cookies: async () => ({
    getAll: () => [...mocks.jar].map(([name, { value }]) => ({ name, value })),
    set: (name: string, value: string, options?: object) => mocks.jar.set(name, { value, options }),
    delete: (name: string) => mocks.jar.delete(name),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new mocks.RedirectSignal(to);
  },
}));

const PASSWORD = "un mot de passe très sûr";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
};
const credentials = form({ email: "vous@exemple.fr", password: PASSWORD });
const signUpForm = form({ email: "vous@exemple.fr", password: PASSWORD, confirm: PASSWORD });
const newPasswordForm = form({ password: PASSWORD, confirm: PASSWORD });

const apiError = (message: string, status: number, code: string) => ({
  data: {},
  error: new AuthApiError(message, status, code),
});

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof mocks.RedirectSignal) return error.to;
    throw error;
  }
  throw new Error("aucune redirection");
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.configured.value = true;
  mocks.jar.clear();
  mocks.ip.value = "203.0.113.7";
  mocks.spoofed.value = "192.0.2.250";
  mocks.refreshLimited.value = false;
  mocks.clientOptions.length = 0;
  resetAuthRateLimits();
  for (const fn of Object.values(mocks.auth)) fn.mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // Jamais de mot de passe dans les journaux.
  for (const call of consoleError.mock.calls) expect(JSON.stringify(call)).not.toContain(PASSWORD);
  consoleError.mockRestore();
});

describe("signIn", () => {
  it("valide les champs côté serveur sans appeler Supabase", async () => {
    const state = await signIn(INITIAL_AUTH_STATE, form({ email: "pas-une-adresse", password: "" }));
    expect(state.status).toBe("error");
    expect(Object.keys(state.fieldErrors).sort()).toEqual(["email", "password"]);
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("signale l'absence de configuration", async () => {
    mocks.configured.value = false;
    expect(await signIn(INITIAL_AUTH_STATE, credentials)).toMatchObject({ status: "error", message: NOT_CONFIGURED });
  });

  it("même message générique, sans fuite de l'erreur brute, quelle que soit la cause", async () => {
    for (const [message, code] of [
      ["Invalid login credentials", "invalid_credentials"],
      ["User banned", "user_banned"],
    ]) {
      mocks.auth.signInWithPassword.mockResolvedValueOnce(apiError(message, 400, code));
      const state = await signIn(INITIAL_AUTH_STATE, credentials);
      expect(state).toEqual({ status: "error", message: INVALID_CREDENTIALS, fieldErrors: {} });
      expect(JSON.stringify(state)).not.toContain(message);
    }
  });

  it("signale une adresse non confirmée (code renvoyé seulement si le mot de passe est juste)", async () => {
    mocks.auth.signInWithPassword.mockResolvedValueOnce(apiError("Email not confirmed", 400, "email_not_confirmed"));
    expect(await signIn(INITIAL_AUTH_STATE, credentials)).toEqual({
      status: "error",
      message: EMAIL_NOT_CONFIRMED,
      fieldErrors: {},
    });
  });

  it("limite les tentatives par couple (IP, adresse), puis par IP, sans appeler Supabase", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue(apiError("Invalid login credentials", 400, "invalid_credentials"));
    for (let i = 0; i < 10; i++) {
      // Changer l'élément de gauche de x-forwarded-for (falsifiable) ne donne pas de nouveau quota.
      mocks.spoofed.value = `192.0.2.${i}`;
      expect((await signIn(INITIAL_AUTH_STATE, credentials)).message).toBe(INVALID_CREDENTIALS);
    }
    const upper = form({ email: "VOUS@exemple.fr", password: PASSWORD });
    expect((await signIn(INITIAL_AUTH_STATE, upper)).message).toBe(RATE_LIMITED);
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledTimes(10);

    // La victime, depuis sa propre IP, n'est pas bloquée par les tentatives d'un tiers.
    mocks.ip.value = "198.51.100.2";
    mocks.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: null });
    expect(await redirectOf(() => signIn(INITIAL_AUTH_STATE, credentials))).toBe("/espace");

    // Adresses différentes depuis une seule IP : bloquée après 20 tentatives.
    mocks.ip.value = "192.0.2.9";
    for (let i = 0; i < 20; i++) await signIn(INITIAL_AUTH_STATE, form({ email: `u${i}@exemple.fr`, password: PASSWORD }));
    const blocked = await signIn(INITIAL_AUTH_STATE, form({ email: "nouveau@exemple.fr", password: PASSWORD }));
    expect(blocked.message).toBe(RATE_LIMITED);
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledTimes(31);
  });

  it("plafond par adresse, commun à toutes les IP, contre une attaque distribuée", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue(apiError("Invalid login credentials", 400, "invalid_credentials"));
    for (let i = 0; i < 100; i++) {
      mocks.ip.value = `10.0.${Math.floor(i / 10)}.${i % 10}`;
      expect((await signIn(INITIAL_AUTH_STATE, credentials)).message).toBe(INVALID_CREDENTIALS);
    }
    mocks.ip.value = "198.51.100.2";
    expect((await signIn(INITIAL_AUTH_STATE, credentials)).message).toBe(RATE_LIMITED);
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledTimes(100);
  });

  it("distingue seulement la limite de requêtes et l'indisponibilité du service", async () => {
    mocks.auth.signInWithPassword.mockResolvedValueOnce(apiError("Too many", 429, "over_request_rate_limit"));
    expect((await signIn(INITIAL_AUTH_STATE, credentials)).message).toBe(RATE_LIMITED);

    mocks.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: new AuthRetryableFetchError("fetch failed", 0) });
    expect((await signIn(INITIAL_AUTH_STATE, credentials)).message).toBe(UNAVAILABLE);

    mocks.auth.signInWithPassword.mockRejectedValueOnce(new Error("ECONNREFUSED 10.0.0.1"));
    const state = await signIn(INITIAL_AUTH_STATE, credentials);
    expect(state.message).toBe(UNAVAILABLE);
    expect(JSON.stringify(state)).not.toContain("ECONNREFUSED");
  });

  it("connecte, quitte le mode démo et redirige vers /espace", async () => {
    mocks.jar.set("sv-demo", { value: "1" });
    mocks.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: null });
    expect(await redirectOf(() => signIn(INITIAL_AUTH_STATE, credentials))).toBe("/espace");
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({ email: "vous@exemple.fr", password: PASSWORD });
    expect(mocks.jar.has("sv-demo")).toBe(false);
  });
});

describe("signUp", () => {
  it("vérifie la confirmation du mot de passe", async () => {
    const state = await signUp(INITIAL_AUTH_STATE, form({ email: "vous@exemple.fr", password: PASSWORD, confirm: "x" }));
    expect(state.fieldErrors).toEqual({ confirm: PASSWORD_MISMATCH });
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
  });

  it("envoie un lien de confirmation vers la route interne /auth/confirm", async () => {
    mocks.auth.signUp.mockResolvedValueOnce({ data: {}, error: null });
    expect(await signUp(INITIAL_AUTH_STATE, signUpForm)).toEqual({
      status: "success",
      message: SIGN_UP_SENT,
      fieldErrors: {},
    });
    expect(mocks.auth.signUp).toHaveBeenCalledWith({
      email: "vous@exemple.fr",
      password: PASSWORD,
      options: { emailRedirectTo: "http://localhost:3000/auth/confirm?next=%2Fespace" },
    });
  });

  it("répond comme un succès si l'adresse existe déjà (anti-énumération)", async () => {
    for (const [status, code] of [
      [422, "user_already_exists"],
      [422, "email_exists"],
      [429, "over_email_send_rate_limit"],
    ] as const) {
      mocks.auth.signUp.mockResolvedValueOnce(apiError("détail", status, code));
      expect(await signUp(INITIAL_AUTH_STATE, signUpForm)).toMatchObject({ status: "success", message: SIGN_UP_SENT });
    }
  });

  it("signale un mot de passe refusé par Supabase sur le champ concerné", async () => {
    mocks.auth.signUp.mockResolvedValueOnce({ data: {}, error: new AuthWeakPasswordError("weak", 422, ["pwned"]) });
    expect((await signUp(INITIAL_AUTH_STATE, signUpForm)).fieldErrors).toEqual({ password: WEAK_PASSWORD });
  });
});

describe("requestPasswordReset", () => {
  it("même réponse que le compte existe ou non, lien vers /nouveau-mot-de-passe", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    mocks.auth.resetPasswordForEmail.mockResolvedValueOnce(apiError("User not found", 404, "user_not_found"));
    const ok = await requestPasswordReset(INITIAL_AUTH_STATE, form({ email: "vous@exemple.fr" }));
    const unknown = await requestPasswordReset(INITIAL_AUTH_STATE, form({ email: "inconnu@exemple.fr" }));
    expect(ok).toEqual(unknown);
    expect(ok.message).toBe(RESET_SENT);
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith("vous@exemple.fr", {
      redirectTo: "http://localhost:3000/auth/confirm?next=%2Fnouveau-mot-de-passe",
    });
  });
});

describe("requestPasswordReset (limite)", () => {
  const request = () => requestPasswordReset(INITIAL_AUTH_STATE, form({ email: "vous@exemple.fr" }));

  it("3 demandes par heure pour une même adresse depuis une même IP", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    for (let i = 0; i < 3; i++) expect((await request()).message).toBe(RESET_SENT);
    expect((await request()).message).toBe(RATE_LIMITED);
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledTimes(3);

    // La victime, depuis sa propre IP, peut encore demander un lien.
    mocks.ip.value = "198.51.100.2";
    expect((await request()).message).toBe(RESET_SENT);
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledTimes(4);
  });

  it("au-delà de 10 demandes par heure pour une adresse : réponse identique, aucun e-mail envoyé", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    for (let i = 0; i < 12; i++) {
      mocks.ip.value = `10.0.0.${i}`;
      const state = await request();
      expect(state.status).toBe("success");
      expect(state.message).toBe(RESET_SENT);
    }
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledTimes(10);
  });
});

const nowSeconds = () => Math.floor(Date.now() / 1000);
const claims = (amr: unknown) => ({ data: { claims: { sub: "u1", amr } }, error: null });

describe("updatePassword", () => {
  beforeEach(() => {
    // Session connue de l'API Auth (getUser), sauf mention contraire.
    mocks.auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "vous@exemple.fr" } }, error: null });
  });

  it("refuse une session révoquée (déconnexion), même avec un jeton encore signé", async () => {
    mocks.auth.getUser.mockResolvedValueOnce(apiError("Session not found", 403, "session_not_found"));
    mocks.auth.getClaims.mockResolvedValue(claims([{ method: "otp", timestamp: nowSeconds() - 60 }]));
    expect((await updatePassword(INITIAL_AUTH_STATE, newPasswordForm)).message).toBe(RECOVERY_EXPIRED);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });

  it("API Auth injoignable : « indisponible », pas « lien expiré »", async () => {
    mocks.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    expect((await updatePassword(INITIAL_AUTH_STATE, newPasswordForm)).message).toBe(UNAVAILABLE);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });

  it("refuse un jeton qui n'est pas celui de l'utilisateur vérifié", async () => {
    mocks.auth.getClaims.mockResolvedValueOnce({
      data: { claims: { sub: "autre", amr: [{ method: "otp", timestamp: nowSeconds() - 60 }] } },
      error: null,
    });
    expect((await updatePassword(INITIAL_AUTH_STATE, newPasswordForm)).message).toBe(RECOVERY_EXPIRED);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });

  it("exige la session ouverte par le lien de réinitialisation", async () => {
    mocks.auth.getClaims.mockResolvedValueOnce({ data: null, error: null });
    expect((await updatePassword(INITIAL_AUTH_STATE, newPasswordForm)).message).toBe(RECOVERY_EXPIRED);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });

  it("refuse une session ancienne : seule une authentification récente (lien reçu) permet le changement", async () => {
    for (const amr of [undefined, [], [{ method: "password", timestamp: nowSeconds() - 3 * 3600 }], ["otp"]]) {
      mocks.auth.getClaims.mockResolvedValueOnce(claims(amr));
      expect((await updatePassword(INITIAL_AUTH_STATE, newPasswordForm)).message).toBe(RECOVERY_EXPIRED);
    }
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });

  it("refuse l'ancien mot de passe, puis redirige vers /espace après succès", async () => {
    mocks.auth.getClaims.mockResolvedValue(claims([{ method: "otp", timestamp: nowSeconds() - 60 }]));
    mocks.auth.updateUser.mockResolvedValueOnce(apiError("same", 422, "same_password"));
    expect((await updatePassword(INITIAL_AUTH_STATE, newPasswordForm)).fieldErrors).toEqual({ password: SAME_PASSWORD });

    mocks.auth.updateUser.mockResolvedValueOnce({ data: {}, error: null });
    expect(await redirectOf(() => updatePassword(INITIAL_AUTH_STATE, newPasswordForm))).toBe("/espace");
    expect(mocks.auth.updateUser).toHaveBeenLastCalledWith({ password: PASSWORD });
  });
});

describe("confirmEmailLink", () => {
  it("valide un lien token_hash, quitte le mode démo et suit `next` interne", async () => {
    mocks.jar.set("sv-demo", { value: "1" });
    mocks.auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: null });
    const link = form({ token_hash: "abc123", type: "recovery", next: "/nouveau-mot-de-passe" });
    // Le compte ouvert est d'abord affiché (connexion forcée par un lien transmis par un tiers).
    expect(await redirectOf(() => confirmEmailLink(link))).toBe("/auth/compte?next=%2Fnouveau-mot-de-passe");
    expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc123" });
    expect(mocks.jar.has("sv-demo")).toBe(false);
  });

  it("valide un lien PKCE et refuse une redirection externe", async () => {
    mocks.auth.exchangeCodeForSession.mockResolvedValueOnce({ data: {}, error: null });
    const link = form({ code: "0b7c-4d2e", next: "https://evil.example/espace" });
    expect(await redirectOf(() => confirmEmailLink(link))).toBe("/auth/compte?next=%2Fespace");
    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith("0b7c-4d2e");
  });

  it("lien expiré ou invalide : page d'erreur ouverte même connecté, mode démo conservé", async () => {
    mocks.jar.set("sv-demo", { value: "1" });
    mocks.auth.verifyOtp.mockResolvedValueOnce(apiError("Token has expired", 403, "otp_expired"));
    expect(await redirectOf(() => confirmEmailLink(form({ token_hash: "abc", type: "email" })))).toBe(
      "/auth/confirm?erreur=lien",
    );
    expect(await redirectOf(() => confirmEmailLink(form({ type: "email" })))).toBe("/auth/confirm?erreur=lien");
    expect(mocks.jar.has("sv-demo")).toBe(true);
  });

  it("limite les essais par IP avant d'appeler Supabase (quotas communs à tous les visiteurs)", async () => {
    mocks.auth.verifyOtp.mockResolvedValue(apiError("Token has expired", 403, "otp_expired"));
    for (let i = 0; i < 10; i++) {
      expect(await redirectOf(() => confirmEmailLink(form({ token_hash: `jeton${i}`, type: "email" })))).toBe(
        "/auth/confirm?erreur=lien",
      );
    }
    mocks.auth.verifyOtp.mockClear();
    const blocked = () => confirmEmailLink(form({ code: "0b7c-4d2e" }));
    expect(await redirectOf(blocked)).toBe("/auth/confirm?erreur=trop");
    // L'élément de gauche de x-forwarded-for (falsifiable) ne donne pas de nouveau quota.
    mocks.spoofed.value = "198.51.100.77";
    expect(await redirectOf(() => confirmEmailLink(form({ token_hash: "autre", type: "email" })))).toBe(
      "/auth/confirm?erreur=trop",
    );
    expect(mocks.auth.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    // Un autre visiteur n'est pas bloqué.
    mocks.ip.value = "198.51.100.2";
    mocks.auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: null });
    expect(await redirectOf(() => confirmEmailLink(form({ token_hash: "bon", type: "email" })))).toBe(
      "/auth/compte?next=%2Fespace",
    );
  });
});

describe("signOut et enterDemo", () => {
  it("ferme la session de cet appareil et revient à la connexion", async () => {
    mocks.jar.set("sv-demo", { value: "1" });
    mocks.auth.signOut.mockResolvedValueOnce({ error: null });
    expect(await redirectOf(() => signOut())).toBe("/connexion");
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.jar.has("sv-demo")).toBe(false);
  });

  it("Supabase injoignable : cookies de session effacés, et la page de connexion le signale", async () => {
    mocks.jar.set("sb-projet-auth-token", { value: "jeton" });
    mocks.jar.set("autre", { value: "x" });
    mocks.auth.signOut.mockRejectedValueOnce(new Error("réseau"));
    expect(await redirectOf(() => signOut())).toBe("/connexion?erreur=session");
    expect([...mocks.jar.keys()]).toEqual(["autre"]);
  });

  it("efface toujours les cookies de session, même quand la révocation a réussi", async () => {
    mocks.jar.set("sb-projet-auth-token.0", { value: "morceau" });
    mocks.auth.signOut.mockResolvedValueOnce({ error: null });
    expect(await redirectOf(() => signOut())).toBe("/connexion");
    expect(mocks.jar.has("sb-projet-auth-token.0")).toBe(false);
  });

  it("endSession ferme la session sans rediriger (le navigateur efface ensuite sa copie locale)", async () => {
    mocks.jar.set("sv-demo", { value: "1" });
    mocks.auth.signOut.mockResolvedValueOnce({ error: null });
    await expect(endSession()).resolves.toEqual({ next: "/connexion" });
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.jar.has("sv-demo")).toBe(false);
  });

  it("limite de rafraîchissement atteinte (proxy) : la session est quand même révoquée, dans un quota séparé", async () => {
    mocks.refreshLimited.value = true;
    mocks.auth.signOut.mockResolvedValue({ error: null });
    for (let i = 0; i < 10; i++) {
      mocks.jar.set("sb-projet-auth-token", { value: "jeton" });
      await expect(endSession()).resolves.toEqual({ next: "/connexion" });
      // Le client voit la session masquée au reste de l'application, pour la révoquer.
      expect(mocks.clientOptions.at(-1)).toEqual({ evenIfRefreshLimited: true });
      expect(mocks.jar.has("sb-projet-auth-token")).toBe(false);
    }
    expect(mocks.auth.signOut).toHaveBeenCalledTimes(10);
    // Quota épuisé : plus d'appel à Supabase, mais les cookies partent quand même, et c'est signalé.
    mocks.jar.set("sb-projet-auth-token", { value: "jeton" });
    await expect(endSession()).resolves.toEqual({ next: "/connexion?erreur=session" });
    expect(mocks.auth.signOut).toHaveBeenCalledTimes(10);
    expect(mocks.clientOptions.at(-1)).toEqual({ evenIfRefreshLimited: false });
    expect(mocks.jar.has("sb-projet-auth-token")).toBe(false);
  });

  it("le mode démo pose un cookie protégé et mène à /espace", async () => {
    mocks.configured.value = false;
    expect(await redirectOf(() => enterDemo())).toBe("/espace");
    expect(mocks.jar.get("sv-demo")).toMatchObject({
      value: "1",
      options: { httpOnly: true, sameSite: "lax", path: "/" },
    });
  });
});
