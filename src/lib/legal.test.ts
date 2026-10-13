import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, routeExists } from "@/test/sourceFiles";
import {
  CONTACT_EMAIL,
  CONTACT_IS_PLACEHOLDER,
  CONTACT_MAILTO,
  CONTACT_PROVIDER,
  HOST,
  LEGAL_PAGE,
  LEGAL_PAGES,
  PUBLISHER,
  UNVERIFIED,
} from "./legal";

describe("informations légales", () => {
  it("chaque page légale existe", () => {
    for (const { href } of LEGAL_PAGES) expect(routeExists(href), href).toBe(true);
  });

  it("le contact provisoire et le téléphone manquant restent signalés", () => {
    expect(CONTACT_MAILTO).toBe(`mailto:${CONTACT_EMAIL}`);
    if (CONTACT_IS_PLACEHOLDER) expect(UNVERIFIED.some((point) => point.includes(CONTACT_EMAIL))).toBe(true);
    if (HOST.phone === null) expect(UNVERIFIED.some((point) => point.includes("Téléphone"))).toBe(true);
    if (CONTACT_PROVIDER === null) expect(UNVERIFIED.some((point) => point.includes("CONTACT_PROVIDER"))).toBe(true);
    if (HOST.functionRegion === null) expect(UNVERIFIED.some((point) => point.includes("HOST.functionRegion"))).toBe(true);
    expect(UNVERIFIED.some((point) => point.includes("HOST.proxyLocation"))).toBe(true);
    if (!HOST.dpaApplies) expect(UNVERIFIED.some((point) => point.includes("VERCEL_HOBBY_DPA_CONFIRMED_IN_WRITING"))).toBe(true);
    if (!PUBLISHER.identifiedToHost) expect(UNVERIFIED.some((point) => point.includes("PUBLISHER_IDENTIFIED_TO_HOST"))).toBe(true);
    if (!HOST.modelTrainingDisabled) expect(UNVERIFIED.some((point) => point.includes("VERCEL_MODEL_TRAINING_DISABLED"))).toBe(true);
  });

  it("le journal d'audit de Supabase Auth n'est plus présenté comme une inconnue (vérifié le 10 octobre 2026)", () => {
    expect(UNVERIFIED.some((point) => point.includes("audit_log_entries"))).toBe(false);
    const doc = readFileSync(join(ROOT, "docs", "legal.md"), "utf8");
    expect(doc).toContain("Vérifié le 10 octobre 2026");
    expect(doc).not.toContain("si l’option du point 6 est active");
  });

  it("les pages par rôle sont celles du pied de page", () => {
    expect(Object.values(LEGAL_PAGE)).toEqual([...LEGAL_PAGES]);
  });

  it("docs/legal.md reprend tous les points non vérifiés", () => {
    const doc = readFileSync(join(ROOT, "docs", "legal.md"), "utf8");
    for (const point of UNVERIFIED) expect(doc, point).toContain(point);
  });
});
