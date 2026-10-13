import { describe, expect, it } from "vitest";
import { resolveOrigin } from "./origin";

describe("resolveOrigin", () => {
  it("préfère SITE_URL, puis l'en-tête Origin, puis Host", () => {
    expect(resolveOrigin({ siteUrl: "https://stratavault.fr/", origin: "http://localhost:3000" })).toBe(
      "https://stratavault.fr",
    );
    expect(resolveOrigin({ origin: "http://localhost:3000", host: "autre" })).toBe("http://localhost:3000");
    expect(resolveOrigin({ host: "stratavault.fr", proto: "https" })).toBe("https://stratavault.fr");
    expect(resolveOrigin({ host: "localhost:3000" })).toBe("http://localhost:3000");
  });

  it("ignore les valeurs invalides ou non HTTP", () => {
    expect(resolveOrigin({ siteUrl: "pas une url", origin: "javascript:alert(1)", host: null })).toBeNull();
    expect(resolveOrigin({ origin: "null", host: "localhost:3000" })).toBe("http://localhost:3000");
  });
});
