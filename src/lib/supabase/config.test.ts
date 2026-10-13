import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivilegedKey, isSupabaseConfigured, readSupabaseConfig } from "./config";

const jwt = (payload: object) =>
  ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(".");

describe("configuration Supabase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("mode démo sans variables, ou avec une URL invalide", () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(readSupabaseConfig({ url: "https://x.supabase.co" })).toBeNull();
    expect(readSupabaseConfig({ url: "pas une url", key: "sb_publishable_x" })).toBeNull();
    expect(readSupabaseConfig({ url: "ftp://x.supabase.co", key: "sb_publishable_x" })).toBeNull();
  });

  it("accepte une URL et une clé publishable", () => {
    expect(readSupabaseConfig({ url: " https://x.supabase.co ", key: "sb_publishable_abc" })).toEqual({
      url: "https://x.supabase.co",
      publishableKey: "sb_publishable_abc",
    });
    expect(readSupabaseConfig({ url: "https://x.supabase.co", key: jwt({ role: "anon" }) })).not.toBeNull();
  });

  it("refuse une clé secrète ou service_role, et ne le signale qu'une fois", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 3; i++) readSupabaseConfig({ url: "https://x.supabase.co", key: "sb_secret_abc" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(isPrivilegedKey("sb_secret_abc")).toBe(true);
    expect(isPrivilegedKey(jwt({ role: "service_role" }))).toBe(true);
    expect(isPrivilegedKey(jwt({ role: "anon" }))).toBe(false);
    expect(isPrivilegedKey("a.%%%.c")).toBe(false);
    expect(readSupabaseConfig({ url: "https://x.supabase.co", key: "sb_secret_abc" })).toBeNull();
  });

  it("lit les variables d'environnement", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(isSupabaseConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://factice.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_factice");
    expect(isSupabaseConfigured()).toBe(true);
  });
});
