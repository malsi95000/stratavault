import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirects";

describe("safeNextPath (redirections internes uniquement)", () => {
  it("accepte les pages autorisées", () => {
    expect(safeNextPath("/espace")).toBe("/espace");
    expect(safeNextPath("/carte")).toBe("/carte");
    expect(safeNextPath("/nouveau-mot-de-passe")).toBe("/nouveau-mot-de-passe");
    expect(safeNextPath("/carte?x=1#y")).toBe("/carte");
  });

  it("refuse les URL externes et les chemins piégés", () => {
    for (const value of [
      "https://evil.example/espace",
      "//evil.example/espace",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "espace",
      "/%2F%2Fevil.example",
      "/espace/../connexion",
      "/inconnu",
      "",
      null,
      undefined,
    ]) {
      expect(safeNextPath(value)).toBe("/espace");
    }
  });

  it("utilise le repli fourni", () => {
    expect(safeNextPath("https://evil.example", "/nouveau-mot-de-passe")).toBe("/nouveau-mot-de-passe");
  });
});
