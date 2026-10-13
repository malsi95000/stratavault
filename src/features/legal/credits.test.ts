import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "@/test/sourceFiles";
import { CREDITS } from "./credits";

const packageJson = (name: string): { license?: string; dependencies?: Record<string, string> } =>
  JSON.parse(readFileSync(join(ROOT, ...(name ? ["node_modules", name] : []), "package.json"), "utf8"));

/** Dépendances couvertes par le crédit d'un autre paquet du même projet, ou sans code livré. */
const COVERED_BY: Record<string, string | null> = {
  "react-dom": "react",
  "@supabase/supabase-js": "@supabase/ssr",
  // Simple marqueur de compilation (aucun code dans le site publié).
  "server-only": null,
};

describe("crédits des mentions légales", () => {
  it("la licence annoncée est celle du paquet installé", () => {
    for (const credit of CREDITS) expect(packageJson(credit.pkg).license, credit.pkg).toBe(credit.license);
    for (const [pkg, by] of Object.entries(COVERED_BY)) {
      if (by) expect(packageJson(pkg).license, pkg).toBe(packageJson(by).license);
    }
  });

  it("reprend les licences supplémentaires du fichier LICENSE (icônes Feather de Lucide)", () => {
    const license = readFileSync(join(ROOT, "node_modules", "lucide-react", "LICENSE"), "utf8");
    const lucide = CREDITS.find((credit) => credit.pkg === "lucide-react");
    if (license.includes("Feather")) {
      expect(license).toContain("Cole Bemis");
      expect(lucide?.notice).toMatch(/Feather.*MIT.*Cole Bemis/);
    }
  });

  it("chaque dépendance du site est créditée", () => {
    const credited = new Set(CREDITS.map((credit) => credit.pkg));
    for (const dependency of Object.keys(packageJson("").dependencies ?? {})) {
      expect(credited.has(dependency) || dependency in COVERED_BY, dependency).toBe(true);
    }
  });
});
