import { describe, expect, it } from "vitest";
import { loginPageFor, safeNextPath, signInReturnPath } from "./redirects";

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

  it("la carte collective n'est pas une destination des liens reçus par e-mail", () => {
    expect(safeNextPath("/carte-collective")).toBe("/espace");
  });
});

describe("signInReturnPath (retour après la connexion)", () => {
  it("ramène à la carte collective, et seulement à elle", () => {
    expect(signInReturnPath("/carte-collective")).toBe("/carte-collective");
    expect(signInReturnPath("/carte-collective?x=1#y")).toBe("/carte-collective");
    for (const value of [
      null,
      undefined,
      "",
      "/espace",
      "/carte",
      "/nouveau-mot-de-passe",
      "/carte-collective/moderation",
      "https://evil.example/carte-collective",
      "//evil.example/carte-collective",
      "/\evil.example",
      "/carte-collective/../compte",
    ]) {
      expect(signInReturnPath(value), String(value)).toBe("/espace");
    }
  });

  it("page de connexion avec retour, pour les pages prévues seulement", () => {
    expect(loginPageFor("/carte-collective")).toBe("/connexion?next=%2Fcarte-collective");
    expect(loginPageFor("/compte")).toBe("/connexion");
  });
});
