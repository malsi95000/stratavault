import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAuthRateLimits } from "@/features/auth/rateLimit";
import { proxy } from "./proxy";

const session = vi.hoisted(() => ({ signedIn: false, refreshed: [] as string[], calls: 0, cookies: [] as string[] }));

// Rafraîchissement de session simulé : il « renouvelle » un cookie pour vérifier sa recopie.
vi.mock("@/lib/supabase/session", () => ({
  refreshSession: async (req: { headers: Headers }) => {
    session.calls += 1;
    session.cookies.push(req.headers.get("cookie") ?? "");
    return {
    signedIn: session.signedIn,
    applyTo: (response: { cookies: { set: (name: string, value: string) => void } }) => {
      response.cookies.set("sb-test-auth-token", "renouvelé");
      session.refreshed.push("sb-test-auth-token");
    },
    };
  },
}));

/** Marque posée par le proxy sur la requête transmise (voir REFRESH_LIMITED_HEADER). */
const LIMITED = "x-middleware-request-x-stratavault-refresh-limited";

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie } } : undefined);

const enableAccounts = () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://factice.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_factice");
};

afterEach(() => {
  vi.unstubAllEnvs();
  session.signedIn = false;
  session.refreshed = [];
  session.calls = 0;
  session.cookies = [];
  resetAuthRateLimits();
});

describe("proxy", () => {
  it("sans Supabase : aucune redirection, CSP à nonce sur la requête et la réponse", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const response = await proxy(request("/carte"));
    expect(response.headers.get("location")).toBeNull();
    const csp = response.headers.get("content-security-policy");
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    expect(session.refreshed).toEqual([]);
  });

  it("avec Supabase : /carte sans session ni démo renvoie vers /connexion, en gardant les cookies renouvelés", async () => {
    enableAccounts();
    const response = await proxy(request("/carte"));
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/connexion");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("renouvelé");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("une Server Action (POST) sur /carte sans session n'est pas redirigée : elle répond elle-même", async () => {
    enableAccounts();
    const post = new NextRequest("http://localhost:3000/carte", { method: "POST", headers: { "next-action": "abc" } });
    const response = await proxy(post);
    expect(response.headers.get("location")).toBeNull();
  });

  it("le cookie de démo ouvre /espace et /carte", async () => {
    enableAccounts();
    const response = await proxy(request("/espace", "sv-demo=1"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("l'utilisateur connecté qui va sur /connexion est renvoyé vers /espace", async () => {
    enableAccounts();
    session.signedIn = true;
    const response = await proxy(request("/connexion"));
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/espace");
  });

  it("cookie de session expiré envoyé en boucle : au-delà de la limite par IP, plus aucun appel à Supabase", async () => {
    enableAccounts();
    const expired = JSON.stringify({ access_token: "x", refresh_token: "y", expires_at: 1 });
    const forged = (ip: string) =>
      new NextRequest("http://localhost:3000/", {
        headers: { cookie: `sb-test-auth-token=${encodeURIComponent(expired)}; sv-demo=1`, "x-forwarded-for": ip },
      });
    for (let i = 0; i < 30; i++) await proxy(forged("203.0.113.9"));
    expect(session.calls).toBe(30);
    const response = await proxy(forged("203.0.113.9"));
    expect(session.calls).toBe(30);
    expect(response.headers.get("location")).toBeNull();
    // Le rendu qui suit est marqué : son client Supabase ignore le cookie de session (il ne
    // rafraîchirait pas à son tour). Le cookie reste dans la requête, pour que « Se déconnecter »
    // puisse l'effacer et révoquer la session.
    expect(response.headers.get(LIMITED)).toBe("1");
    expect(response.headers.get("x-middleware-request-cookie") ?? "").toContain("sb-test-auth-token");
    // Une autre IP garde son quota.
    await proxy(forged("198.51.100.4"));
    expect(session.calls).toBe(31);
  });

  it("la marque « limite atteinte » ne vient que du proxy : celle du navigateur est retirée", async () => {
    enableAccounts();
    const response = await proxy(
      new NextRequest("http://localhost:3000/", { headers: { "x-stratavault-refresh-limited": "1" } }),
    );
    expect(response.headers.get(LIMITED)).toBeNull();
    expect(response.headers.get("x-middleware-override-headers")).not.toContain("x-stratavault-refresh-limited");
  });

  it("session encore valide : jamais comptée ni bloquée", async () => {
    enableAccounts();
    const valid = JSON.stringify({ access_token: "x", refresh_token: "y", expires_at: Date.now() / 1000 + 3600 });
    for (let i = 0; i < 40; i++) {
      await proxy(new NextRequest("http://localhost:3000/", { headers: { cookie: `sb-test-auth-token=${encodeURIComponent(valid)}` } }));
    }
    expect(session.calls).toBe(40);
  });
});
