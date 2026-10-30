// Adresses du partage et libération du verrou par sendBeacon : jeton lu dans le fragment, même origine.
import { describe, expect, it } from "vitest";
import { isSameOrigin, lockBeaconPath } from "./coop/lockBeacon";
import { INVITATION_PAGE, coopRedirectFor, invitationUrl, shareSettingsPath, sharedMapPath, tokenFromHash } from "./paths";

const TOKEN = "0123456789abcdef".repeat(4);

describe("adresses", () => {
  it("le jeton d'un lien est dans le fragment, jamais dans le chemin ni la requête", () => {
    const url = new URL(invitationUrl("https://stratavault.vercel.app", TOKEN));
    expect(url.pathname).toBe(INVITATION_PAGE);
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#${TOKEN}`);
    expect(tokenFromHash(url.hash)).toBe(TOKEN);
  });

  it("un fragment qui n'a pas la forme d'un jeton est ignoré", () => {
    for (const hash of ["", "#", `#${TOKEN.toUpperCase()}`, `#${TOKEN}a`, `#${TOKEN.slice(1)}`, "#<script>"]) {
      expect(tokenFromHash(hash), hash).toBe(null);
    }
  });

  it("pages de la carte", () => {
    const id = "12345678-1234-4234-8234-123456789abc";
    expect(sharedMapPath(id)).toBe(`/carte/partagee/${id}`);
    expect(shareSettingsPath(id)).toBe(`/espace/partage/${id}`);
    expect(lockBeaconPath(id)).toBe(`/carte/partagee/${id}/verrou`);
  });

  it("une carte active qui a des membres mène de l'éditeur habituel à l'éditeur coopératif", () => {
    const id = "12345678-1234-4234-8234-123456789abc";
    const other = "87654321-4321-4321-8321-cba987654321";
    expect(coopRedirectFor(id, [other, id])).toBe(sharedMapPath(id));
    expect(coopRedirectFor(id, [other])).toBe(null);
    expect(coopRedirectFor(null, [id])).toBe(null);
    expect(coopRedirectFor(id, [])).toBe(null);
  });
});

describe("isSameOrigin", () => {
  it("exige l'en-tête Origin du site lui-même", () => {
    expect(isSameOrigin(new Headers({ origin: "https://stratavault.vercel.app", host: "stratavault.vercel.app" }))).toBe(true);
    expect(
      isSameOrigin(new Headers({ origin: "https://stratavault.vercel.app", host: "interne", "x-forwarded-host": "stratavault.vercel.app" })),
    ).toBe(true);
    expect(isSameOrigin(new Headers({ origin: "https://exemple.fr", host: "stratavault.vercel.app" }))).toBe(false);
    expect(isSameOrigin(new Headers({ host: "stratavault.vercel.app" }))).toBe(false);
    expect(isSameOrigin(new Headers({ origin: "null", host: "stratavault.vercel.app" }))).toBe(false);
  });
});
