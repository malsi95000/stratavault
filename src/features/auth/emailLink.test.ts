import { describe, expect, it } from "vitest";
import { isRecoveryLink, parseEmailLink } from "./emailLink";

const read = (params: Record<string, unknown>) => parseEmailLink((name) => params[name]);

describe("parseEmailLink", () => {
  it("lit un lien token_hash et choisit la page suivante selon le type", () => {
    expect(read({ token_hash: "a1b2", type: "email" })).toEqual({
      kind: "otp",
      tokenHash: "a1b2",
      type: "email",
      next: "/espace",
    });
    const recovery = read({ token_hash: "a1b2", type: "recovery" });
    expect(recovery).toMatchObject({ next: "/nouveau-mot-de-passe" });
    expect(recovery && isRecoveryLink(recovery)).toBe(true);
  });

  it("lit un lien PKCE", () => {
    const link = read({ code: "0b7c-4d2e", next: "/nouveau-mot-de-passe" });
    expect(link).toEqual({ kind: "code", code: "0b7c-4d2e", next: "/nouveau-mot-de-passe" });
    expect(link && isRecoveryLink(link)).toBe(true);
  });

  it("refuse les liens incomplets ou suspects et les redirections externes", () => {
    for (const params of [
      {},
      { token_hash: "a1b2" },
      { token_hash: "a1b2", type: "magic" },
      { token_hash: "a b", type: "email" },
      { code: "x".repeat(600) },
      { code: ["a", "b"] },
    ]) {
      expect(read(params)).toBeNull();
    }
    expect(read({ code: "abc", next: "//evil.example" })).toMatchObject({ next: "/espace" });
  });
});
