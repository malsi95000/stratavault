import { describe, expect, it } from "vitest";
import { BETA_EXPORT } from "@/features/map-doc/fixtures";
import { blankDoc } from "@/features/map-doc/schema";
import type { StoredMapEntry } from "@/features/storage";
import { UNREADABLE_STATS, formatBankDate, sortByUpdated, toBankItems } from "./bankItems";

// Dates à midi UTC : le jour affiché est le même quel que soit le fuseau de la machine de test.
const entry = (id: string, updated: string, data: unknown = blankDoc(), name = `Carte ${id}`): StoredMapEntry => ({
  id,
  name,
  updated,
  data,
});

describe("formatBankDate", () => {
  it("affiche le jour sur deux chiffres, le mois court et l'année, en français", () => {
    expect(formatBankDate("2026-10-03T12:00:00.000Z")).toBe("03 oct. 2026");
    expect(formatBankDate("2025-05-09T12:00:00.000Z")).toBe("09 mai 2025");
  });

  it("renvoie une chaîne vide pour une date invalide", () => {
    expect(formatBankDate("")).toBe("");
    expect(formatBankDate("pas une date")).toBe("");
  });
});

describe("sortByUpdated", () => {
  it("trie de la plus récemment modifiée à la plus ancienne sans modifier la liste reçue", () => {
    const list = [
      entry("a", "2026-01-02T12:00:00.000Z"),
      entry("b", "2026-03-01T12:00:00.000Z"),
      entry("c", "2025-12-31T12:00:00.000Z"),
    ];
    expect(sortByUpdated(list).map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(list.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("place une entrée sans date en dernier", () => {
    const broken = { ...entry("x", ""), updated: undefined as unknown as string };
    expect(sortByUpdated([broken, entry("a", "2026-01-02T12:00:00.000Z")]).map((e) => e.id)).toEqual(["a", "x"]);
  });
});

describe("toBankItems", () => {
  it("prépare le nom, la carte en cours, la date et les statistiques (texte de la bêta)", () => {
    const items = toBankItems(
      [
        entry("old", "2026-01-02T12:00:00.000Z", blankDoc(), "Ancienne"),
        entry("beta", "2026-10-03T12:00:00.000Z", BETA_EXPORT, "<b>Sahel</b>"),
      ],
      "old",
    );
    expect(items).toEqual([
      {
        id: "beta",
        name: "<b>Sahel</b>",
        active: false,
        meta: "03 oct. 2026 — 2 pays annotés · 4 liens · 3 balises · 1 zones · 1 textes",
      },
      {
        id: "old",
        name: "Ancienne",
        active: true,
        meta: "02 janv. 2026 — 0 pays annotés · 0 liens · 0 balises · 0 zones · 0 textes",
      },
    ]);
  });

  it("signale une carte illisible au lieu d'échouer", () => {
    const [item] = toBankItems([entry("bad", "2026-10-03T12:00:00.000Z", { links: "?" })], null);
    expect(item).toMatchObject({ id: "bad", active: false, meta: `03 oct. 2026 — ${UNREADABLE_STATS}` });
  });

  it("n'affiche que les statistiques si la date est invalide", () => {
    const [item] = toBankItems([entry("a", "")], null);
    expect(item.meta).toBe("0 pays annotés · 0 liens · 0 balises · 0 zones · 0 textes");
  });
});
