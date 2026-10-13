import { describe, expect, it } from "vitest";
import { config as proxyConfig } from "@/proxy";
import { STATIC_CSP, STATIC_PATHS_SOURCE, buildCsp, createNonce, securityHeaders } from "./headers";

const directives = (csp: string) => new Map(csp.split("; ").map((d) => [d.split(" ")[0], d] as const));

describe("en-têtes de sécurité", () => {
  it("CSP de production : scripts à nonce, aucun eval, pas d'intégration dans un cadre", () => {
    const csp = directives(buildCsp("abc", false));
    expect(csp.get("script-src")).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp.get("style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(csp.get("object-src")).toBe("object-src 'none'");
    expect(csp.get("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(csp.get("form-action")).toBe("form-action 'self'");
    expect(csp.get("connect-src")).toBe("connect-src 'self'");
    expect(csp.has("upgrade-insecure-requests")).toBe(true);
  });

  it("CSP de développement : eval (débogage React) et WebSocket du rechargement à chaud", () => {
    const csp = directives(buildCsp("abc", true));
    expect(csp.get("script-src")).toContain("'unsafe-eval'");
    expect(csp.get("connect-src")).toContain("ws:");
    expect(csp.has("upgrade-insecure-requests")).toBe(false);
  });

  it("pas de nonce dans style-src, qui y désactiverait 'unsafe-inline'", () => {
    expect(directives(buildCsp("abc", false)).get("style-src")).not.toContain("nonce");
  });

  it("nonce aléatoire de 128 bits", () => {
    const a = createNonce();
    expect(Buffer.from(a, "base64")).toHaveLength(16);
    expect(createNonce()).not.toBe(a);
  });

  it("HSTS seulement en production", () => {
    const keys = (production: boolean) => securityHeaders(production).map((h) => h.key);
    expect(keys(true)).toContain("Strict-Transport-Security");
    expect(keys(false)).not.toContain("Strict-Transport-Security");
    expect(keys(false)).toEqual(
      expect.arrayContaining(["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy"]),
    );
  });

  it("CSP fixe exactement sur les chemins que le proxy ne traite pas (jamais deux CSP sur une page)", async () => {
    // Même moteur que Next pour `source` (next.config.ts) et `matcher` (proxy).
    const modulePath: string = "next/dist/compiled/path-to-regexp";
    const { pathToRegexp } = (await import(modulePath)) as { pathToRegexp: (path: string) => RegExp };
    const staticPaths = pathToRegexp(STATIC_PATHS_SOURCE);
    const proxied = pathToRegexp(proxyConfig.matcher[0]);
    const pages = ["/", "/carte", "/espace", "/connexion", "/auth/confirm", "/historique", "/inconnue", "/data", "/faviconXico"];
    const files = [
      "/absent.svg",
      "/data/countries-50m.json",
      "/_next/static/chunks/a.js",
      "/a/b/c.png",
      "/favicon.ico",
      // Cas limites : préfixes exclus par le proxy sans « / » ni fin de chaîne (404 HTML de Next).
      "/_next/static",
      "/_next/staticx",
      "/_next/image",
      "/_next/imagex/y",
      "/favicon.ico/x",
    ];
    for (const path of pages) expect([path, staticPaths.test(path), proxied.test(path)]).toEqual([path, false, true]);
    for (const path of files) expect([path, staticPaths.test(path), proxied.test(path)]).toEqual([path, true, false]);
    const csp = directives(STATIC_CSP);
    expect(csp.get("script-src")).toBe("script-src 'self'");
    expect(csp.get("frame-ancestors")).toBe("frame-ancestors 'none'");
  });
});
