import { describe, expect, it } from "vitest";
import { APP_VERSION } from "@/lib/version";
import { CHANGELOG } from "./changelog";

describe("historique des mises à jour", () => {
  it("reprend les versions de la bêta, sans 1.5 inventée, puis la version courante", () => {
    expect(CHANGELOG.map((r) => r.version)).toEqual([
      "Bêta 1.0",
      "Bêta 1.1",
      "Bêta 1.2",
      "Bêta 1.3",
      "Bêta 1.4",
      "Bêta 1.6",
      "Bêta 1.7",
      "Bêta 2.0",
      APP_VERSION,
    ]);
  });

  it("la dernière entrée est la version de l'application (Bêta 2.1), datée, après la 2.0", () => {
    const last = CHANGELOG.at(-1);
    expect(last?.version).toBe("Bêta 2.1");
    expect(last?.date).toBe("17 octobre 2026");
    expect(CHANGELOG.find((r) => r.version === "Bêta 2.0")?.date).toBe("3 octobre 2026");
  });

  it("garde les deux paragraphes de la 1.7 dans la même entrée", () => {
    const v17 = CHANGELOG.find((r) => r.version === "Bêta 1.7");
    expect(v17?.paragraphs).toHaveLength(2);
    expect(v17?.contribution).toMatch(/^Contribution de Claude/);
  });

  it("chaque entrée a une date et au moins un paragraphe non vide", () => {
    for (const release of CHANGELOG) {
      expect(release.date).toMatch(/^\d{1,2} \p{L}+ \d{4}$/u);
      expect(release.paragraphs.length).toBeGreaterThan(0);
      for (const p of release.paragraphs) expect(p.trim()).not.toBe("");
    }
  });
});
