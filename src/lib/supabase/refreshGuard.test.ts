import { createChunks, stringToBase64URL } from "@supabase/ssr";
import { describe, expect, it } from "vitest";
import { isSessionTokenCookie, REFRESH_MARGIN_MS, sessionNeedsRefresh } from "./refreshGuard";

const NOW = 1_800_000_000_000;
const KEY = "sb-projet-auth-token";
const session = (expiresAt: unknown) => JSON.stringify({ access_token: "x", refresh_token: "y", expires_at: expiresAt });
const cookie = (value: string, name = KEY) => [{ name, value }];

describe("sessionNeedsRefresh", () => {
  it("repère un cookie expiré (faux ou réel), en clair ou en base64", async () => {
    expect(await sessionNeedsRefresh(cookie(session(1)), NOW)).toBe(true);
    expect(await sessionNeedsRefresh(cookie(`base64-${stringToBase64URL(session(1))}`), NOW)).toBe(true);
    // expires_at en texte : auth-js le convertit aussi en nombre.
    expect(await sessionNeedsRefresh(cookie(session("1")), NOW)).toBe(true);
  });

  it("compte la marge d'auth-js avant l'expiration", async () => {
    const soon = (NOW + REFRESH_MARGIN_MS - 1000) / 1000;
    const later = (NOW + 3600_000) / 1000;
    expect(await sessionNeedsRefresh(cookie(session(soon)), NOW)).toBe(true);
    expect(await sessionNeedsRefresh(cookie(session(later)), NOW)).toBe(false);
  });

  it("recompose une session découpée en morceaux", async () => {
    const big = JSON.stringify({ access_token: "x".repeat(5000), refresh_token: "y", expires_at: 1 });
    const chunks = createChunks(KEY, `base64-${stringToBase64URL(big)}`);
    expect(chunks.length).toBeGreaterThan(1);
    expect(await sessionNeedsRefresh(chunks, NOW)).toBe(true);
  });

  it("ignore ce qu'auth-js jette sans appel réseau, et les autres cookies", async () => {
    expect(await sessionNeedsRefresh([], NOW)).toBe(false);
    expect(await sessionNeedsRefresh(cookie("pas du json"), NOW)).toBe(false);
    expect(await sessionNeedsRefresh(cookie("base64-%%%"), NOW)).toBe(false);
    expect(await sessionNeedsRefresh(cookie(JSON.stringify({ access_token: "x", expires_at: 1 })), NOW)).toBe(false);
    expect(await sessionNeedsRefresh(cookie(session(0)), NOW)).toBe(false);
    expect(await sessionNeedsRefresh(cookie(session(1), "sv-demo"), NOW)).toBe(false);
    expect(await sessionNeedsRefresh(cookie(session(1), `${KEY}-code-verifier`), NOW)).toBe(false);
  });
});

describe("isSessionTokenCookie", () => {
  it("désigne le cookie de session et ses morceaux, pas le vérificateur PKCE", () => {
    expect(isSessionTokenCookie(KEY)).toBe(true);
    expect(isSessionTokenCookie(`${KEY}.0`)).toBe(true);
    expect(isSessionTokenCookie(`${KEY}-code-verifier`)).toBe(false);
    expect(isSessionTokenCookie("sv-demo")).toBe(false);
  });
});
