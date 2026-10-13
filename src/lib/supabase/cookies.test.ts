import { describe, expect, it } from "vitest";
import { DEFAULT_COOKIE_OPTIONS } from "@supabase/ssr";
import { SESSION_COOKIE_MAX_AGE, demoCookieOptions, isSessionCookie, secureCookieOptions } from "./cookies";

describe("options des cookies", () => {
  it("impose httpOnly, sameSite lax et path / à la place des options de la bibliothèque", () => {
    const options = secureCookieOptions({ httpOnly: false, sameSite: "none", path: "/autre", maxAge: 400 }, false);
    expect(options).toEqual({ httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 400 });
  });

  it("impose secure en production et garde maxAge 0 pour une suppression", () => {
    expect(secureCookieOptions({ maxAge: 0, secure: false }, true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });

  it("plafonne à 30 jours la durée de 400 jours de @supabase/ssr, sans en ajouter une absente", () => {
    expect(SESSION_COOKIE_MAX_AGE).toBe(30 * 24 * 60 * 60);
    expect(DEFAULT_COOKIE_OPTIONS.maxAge).toBeGreaterThan(SESSION_COOKIE_MAX_AGE);
    expect(secureCookieOptions({ maxAge: DEFAULT_COOKIE_OPTIONS.maxAge }, true).maxAge).toBe(SESSION_COOKIE_MAX_AGE);
    expect(secureCookieOptions({}, true)).not.toHaveProperty("maxAge");
  });

  it("cookie de démo : mêmes protections, durée limitée", () => {
    expect(demoCookieOptions(true)).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(demoCookieOptions(true).maxAge).toBeGreaterThan(0);
  });

  it("reconnaît les cookies de session Supabase", () => {
    expect(isSessionCookie("sb-abcd-auth-token")).toBe(true);
    expect(isSessionCookie("sb-abcd-auth-token.1")).toBe(true);
    expect(isSessionCookie("sb-abcd-auth-token-code-verifier")).toBe(true);
    expect(isSessionCookie("sv-demo")).toBe(false);
  });
});
