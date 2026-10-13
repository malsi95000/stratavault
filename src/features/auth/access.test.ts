import { describe, expect, it } from "vitest";
import { decideAccess, type AccessContext } from "./access";

const ctx = (overrides: Partial<AccessContext>): AccessContext => ({
  pathname: "/",
  accountsEnabled: true,
  signedIn: false,
  demo: false,
  ...overrides,
});

describe("decideAccess (règles du proxy)", () => {
  it("laisse tout passer quand les comptes ne sont pas configurés (mode démo)", () => {
    for (const pathname of ["/espace", "/carte", "/connexion", "/nouveau-mot-de-passe"]) {
      expect(decideAccess(ctx({ pathname, accountsEnabled: false }))).toEqual({ type: "next" });
    }
  });

  it("renvoie vers la connexion pour /espace et /carte sans session ni mode démo", () => {
    for (const pathname of ["/espace", "/carte", "/carte/", "/espace/x"]) {
      expect(decideAccess(ctx({ pathname }))).toEqual({ type: "redirect", to: "/connexion" });
    }
  });

  it("protège aussi la page « Mon compte » et le téléchargement des données", () => {
    for (const pathname of ["/compte", "/compte/export"]) {
      expect(decideAccess(ctx({ pathname }))).toEqual({ type: "redirect", to: "/connexion" });
      expect(decideAccess(ctx({ pathname, signedIn: true }))).toEqual({ type: "next" });
    }
    expect(decideAccess(ctx({ pathname: "/comptes" }))).toEqual({ type: "next" });
  });

  it("ne redirige pas les Server Actions (POST) : elles vérifient elles-mêmes l'utilisateur", () => {
    expect(decideAccess(ctx({ pathname: "/carte", method: "POST" }))).toEqual({ type: "next" });
    expect(decideAccess(ctx({ pathname: "/connexion", signedIn: true, method: "POST" }))).toEqual({ type: "next" });
    expect(decideAccess(ctx({ pathname: "/espace", method: "HEAD" }))).toEqual({ type: "redirect", to: "/connexion" });
  });

  it("autorise /espace et /carte en mode démo ou avec une session", () => {
    expect(decideAccess(ctx({ pathname: "/carte", demo: true }))).toEqual({ type: "next" });
    expect(decideAccess(ctx({ pathname: "/espace", signedIn: true }))).toEqual({ type: "next" });
  });

  it("renvoie l'utilisateur connecté de /connexion et /inscription vers /espace", () => {
    expect(decideAccess(ctx({ pathname: "/connexion", signedIn: true }))).toEqual({ type: "redirect", to: "/espace" });
    expect(decideAccess(ctx({ pathname: "/inscription", signedIn: true }))).toEqual({ type: "redirect", to: "/espace" });
    expect(decideAccess(ctx({ pathname: "/connexion" }))).toEqual({ type: "next" });
  });

  it("exige la session du lien de réinitialisation pour /nouveau-mot-de-passe", () => {
    expect(decideAccess(ctx({ pathname: "/nouveau-mot-de-passe" }))).toEqual({
      type: "redirect",
      to: "/mot-de-passe-oublie",
    });
    expect(decideAccess(ctx({ pathname: "/nouveau-mot-de-passe", signedIn: true }))).toEqual({ type: "next" });
  });

  it("ne confond pas les préfixes", () => {
    expect(decideAccess(ctx({ pathname: "/cartes-publiques" }))).toEqual({ type: "next" });
    expect(decideAccess(ctx({ pathname: "/historique" }))).toEqual({ type: "next" });
    expect(decideAccess(ctx({ pathname: "/auth/confirm" }))).toEqual({ type: "next" });
  });
});
