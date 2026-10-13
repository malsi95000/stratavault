import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MINIMUM_AGE } from "@/lib/legal";
import { ROOT, routeExists } from "@/test/sourceFiles";

vi.mock("@/features/auth/actions", () => ({ signUp: vi.fn(), enterDemo: vi.fn() }));

const { default: SignupForm } = await import("./SignupForm");
const { default: PrivacyLink } = await import("./PrivacyLink");

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe("liens légaux des formulaires de compte", () => {
  it("l'inscription mentionne les conditions et la confidentialité sous le bouton", () => {
    const html = renderToStaticMarkup(createElement(SignupForm, { accountsEnabled: true }));
    expect(html).toContain("En créant un compte, vous acceptez les");
    expect(hrefs(html)).toEqual(["/conditions", "/confidentialite"]);
    expect(html.indexOf("Créer mon compte")).toBeLessThan(html.indexOf("En créant un compte"));
    // Âge minimum lu dans legal.ts (une seule source), visible au moment de l'inscription.
    expect(html).toContain(`Service destiné aux personnes de ${MINIMUM_AGE} ans et plus`);
  });

  it("sans comptes configurés (démo), aucune acceptation n'est demandée", () => {
    const html = renderToStaticMarkup(createElement(SignupForm, { accountsEnabled: false }));
    expect(html).not.toContain("En créant un compte");
  });

  it("la connexion mène à la politique de confidentialité", () => {
    const links = hrefs(renderToStaticMarkup(createElement(PrivacyLink)));
    expect(links).toEqual(["/confidentialite"]);
    for (const link of links) expect(routeExists(link)).toBe(true);
    expect(readFileSync(join(ROOT, "src/app/connexion/page.tsx"), "utf8")).toContain("<PrivacyLink />");
  });
});
