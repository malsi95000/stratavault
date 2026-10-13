import { describe, expect, it } from "vitest";
import { pageSession } from "./pageSession";

const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "a@example.com" };

describe("mode d'une page de cartes", () => {
  it("session vérifiée : mode compte, même avec le cookie démo", () => {
    for (const demo of [false, true]) {
      expect(pageSession({ status: "signed-in", user }, { accountsEnabled: true, demo })).toEqual({
        kind: "account",
        account: { userId: user.id, email: user.email },
      });
    }
  });

  it("session impossible à vérifier : jamais la démo (base partagée de ce navigateur)", () => {
    for (const demo of [false, true]) {
      expect(pageSession({ status: "unavailable" }, { accountsEnabled: true, demo })).toEqual({ kind: "unavailable" });
    }
  });

  it("sans session : la démo seulement si elle a été choisie, ou si les comptes ne sont pas configurés", () => {
    const out = { status: "signed-out" } as const;
    expect(pageSession(out, { accountsEnabled: true, demo: true })).toEqual({ kind: "demo" });
    expect(pageSession(out, { accountsEnabled: false, demo: false })).toEqual({ kind: "demo" });
    expect(pageSession(out, { accountsEnabled: true, demo: false })).toEqual({ kind: "signed-out" });
  });
});
