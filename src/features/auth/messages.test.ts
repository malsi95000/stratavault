import { describe, expect, it } from "vitest";
import { loginPageError } from "./messages";

describe("loginPageError", () => {
  it("reconnaît seulement les codes prévus", () => {
    expect(loginPageError("lien")).toMatch(/lien est invalide/);
    expect(loginPageError("session")).toMatch(/n’a pas pu être fermée sur le serveur/);
    for (const code of [undefined, "", "autre", ["lien"], "__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(loginPageError(code)).toBeUndefined();
    }
  });
});
