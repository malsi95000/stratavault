import { describe, expect, it } from "vitest";
import { isRecentAuthentication, RECENT_AUTH_MS } from "./recentAuth";

const NOW = 1_800_000_000_000;
const at = (msAgo: number, method = "otp") => ({ method, timestamp: Math.floor((NOW - msAgo) / 1000) });

describe("isRecentAuthentication", () => {
  it("accepte une authentification de moins de 30 minutes, quelle que soit la méthode", () => {
    expect(isRecentAuthentication([at(60_000)], NOW)).toBe(true);
    expect(isRecentAuthentication([at(RECENT_AUTH_MS - 1000, "recovery")], NOW)).toBe(true);
    expect(isRecentAuthentication([at(3 * 3600_000, "password"), at(10_000, "password")], NOW)).toBe(true);
  });

  it("refuse une session ancienne, anonyme ou sans horodatage", () => {
    expect(isRecentAuthentication([at(RECENT_AUTH_MS + 1000)], NOW)).toBe(false);
    expect(isRecentAuthentication([at(1000, "anonymous")], NOW)).toBe(false);
    expect(isRecentAuthentication(["otp"], NOW)).toBe(false);
    expect(isRecentAuthentication([], NOW)).toBe(false);
    expect(isRecentAuthentication(undefined, NOW)).toBe(false);
    expect(isRecentAuthentication([at(-3600_000)], NOW)).toBe(false); // dans le futur
  });
});
