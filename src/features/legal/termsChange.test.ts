// Avis de changement des textes dans l'espace du compte : période d'affichage, comptes concernés,
// entrée en vigueur, contenu et liens.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TermsChangeNotice from "@/components/legal/TermsChangeNotice";
import { ROOT, routeExists } from "@/test/sourceFiles";
import { TERMS_CHANGE, frenchDay, isValidDay, termsChangeText, termsChangeVisible, termsInForceNotice } from "./termsChange";

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const OLD_ACCOUNT = "2026-10-01T10:00:00Z";
const fixed = { ...TERMS_CHANGE, inForceOn: "2026-11-20" };

describe("avis de changement des textes", () => {
  it("s'affiche jusqu'au dernier jour prévu inclus, puis plus du tout", () => {
    expect(termsChangeVisible(new Date("2026-10-29T08:00:00Z"), OLD_ACCOUNT)).toBe(true);
    expect(termsChangeVisible(new Date(`${TERMS_CHANGE.showUntil}T23:59:59Z`), OLD_ACCOUNT)).toBe(true);
    const next = new Date(`${TERMS_CHANGE.showUntil}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    expect(termsChangeVisible(next, OLD_ACCOUNT)).toBe(false);
    // Date de fin illisible : jamais affiché.
    expect(termsChangeVisible(new Date("2026-10-29T08:00:00Z"), OLD_ACCOUNT, { ...fixed, showUntil: "bientôt" })).toBe(false);
  });

  it("n'est montré qu'aux comptes créés avant la fin du jour d'entrée en vigueur", () => {
    const now = new Date("2026-12-01T08:00:00Z");
    expect(termsChangeVisible(now, OLD_ACCOUNT, fixed)).toBe(true);
    expect(termsChangeVisible(now, "2026-11-20T23:59:59Z", fixed)).toBe(true);
    // Compte créé après l'entrée en vigueur : il a accepté les nouveaux textes à l'inscription.
    expect(termsChangeVisible(now, "2026-11-21T00:00:00Z", fixed)).toBe(false);
    expect(termsChangeVisible(now, "2026-11-25T09:30:00.123456+00:00", fixed)).toBe(false);
    // Date de création inconnue ou illisible, date d'entrée en vigueur pas encore fixée : on informe.
    expect(termsChangeVisible(now, null, fixed)).toBe(true);
    expect(termsChangeVisible(now, "hier", fixed)).toBe(true);
    expect(termsChangeVisible(now, "2026-11-25T09:30:00Z", { ...fixed, inForceOn: null })).toBe(true);
  });

  it("donne la date d'entrée en vigueur, une fois fixée, dans l'avis et sur les textes", () => {
    expect(termsChangeText({ ...TERMS_CHANGE, inForceOn: null })).toContain(`(version du ${TERMS_CHANGE.version}).`);
    expect(termsChangeText(fixed)).toContain(`(version du ${TERMS_CHANGE.version}, en vigueur depuis le 20 novembre 2026).`);
    expect(termsInForceNotice({ ...TERMS_CHANGE, inForceOn: null })).toBeNull();
    expect(termsInForceNotice({ ...TERMS_CHANGE, inForceOn: "2026-02-30" })).toBeNull();
    expect(termsInForceNotice(fixed)).toBe(`Version du ${TERMS_CHANGE.version} en vigueur depuis le 20 novembre 2026.`);
    expect(frenchDay("2026-12-01")).toBe("1er décembre 2026");
    expect(isValidDay("2026-11-20")).toBe(true);
    for (const day of ["2026-02-30", "20/11/2026", "2026-11-20T00:00:00Z"]) expect(isValidDay(day), day).toBe(false);
    // Valeur actuelle : absente, ou une date lisible au plus tôt le jour des textes.
    if (TERMS_CHANGE.inForceOn !== null) {
      expect(isValidDay(TERMS_CHANGE.inForceOn)).toBe(true);
      expect(TERMS_CHANGE.inForceOn >= "2026-10-29").toBe(true);
      expect(TERMS_CHANGE.inForceOn <= TERMS_CHANGE.showUntil).toBe(true);
    }
  });

  it("résume les changements et mène aux textes et à « Mon compte »", () => {
    const html = renderToStaticMarkup(createElement(TermsChangeNotice));
    const text = termsChangeText();
    expect(text).toContain(`version du ${TERMS_CHANGE.version}`);
    for (const part of ["profil", "contacts", "partage de cartes", "carte collective", "supprimer votre compte"]) {
      expect(text, part).toContain(part);
    }
    const links = hrefs(html);
    expect(links).toEqual(["/conditions", "/confidentialite", "/compte"]);
    for (const href of links) expect(routeExists(href), href).toBe(true);
  });

  it("n'est montré que dans l'espace d'un compte (pas en mode démo), selon la date de création du compte", () => {
    const page = readFileSync(join(ROOT, "src/app/espace/page.tsx"), "utf8");
    expect(page).toContain("const showTermsChange = account ? await termsChangeShownToAccount() : false;");
    expect(page).toContain("{showTermsChange && <TermsChangeNotice />}");
    const helper = readFileSync(join(ROOT, "src/features/legal/termsChangeForAccount.ts"), "utf8");
    expect(helper).toContain("termsChangeVisible(now, check.account.createdAt)");
  });
});
