// Effacement des copies locales des comptes : tout autre compte quand un compte s'ouvre ; hors
// compte, seulement ce qui peut l'être sans rien perdre.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { addPing } from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import { createIndexedDbRepository, isDisposableCopy } from "./indexeddb";
import { DEMO_MODE, USER_DB_PREFIX } from "./mode";
import { purgeAccountCopies } from "./purge";

let n = 0;
const fresh = () => `${USER_DB_PREFIX}purge-${++n}`;
const withPing = () => addPing(blankDoc(), [1, 1], "crise", "p1")!.doc;
const names = async () => (await indexedDB.databases()).map((db) => db.name);

describe("copie locale effaçable sans perte", () => {
  it("copie de la banque déjà envoyée, ou brouillon vide : oui", async () => {
    const attached = fresh();
    const repo = createIndexedDbRepository({ dbName: attached });
    await repo.setDraft(withPing());
    await repo.setActiveId("m1");
    expect(await isDisposableCopy(attached)).toBe(true);

    const blank = fresh();
    await createIndexedDbRepository({ dbName: blank }).setDraft(blankDoc());
    expect(await isDisposableCopy(blank)).toBe(true);
  });

  it("modifications jamais envoyées, ou carte hors banque : non", async () => {
    const pending = fresh();
    const a = createIndexedDbRepository({ dbName: pending });
    await a.setDraft(withPing());
    await a.setActiveId("m1");
    await a.setPendingSync(true);
    expect(await isDisposableCopy(pending)).toBe(false);

    const unbanked = fresh();
    await createIndexedDbRepository({ dbName: unbanked }).setDraft(withPing());
    expect(await isDisposableCopy(unbanked)).toBe(false);

    const unreadable = fresh();
    await createIndexedDbRepository({ dbName: unreadable }).setDraft({ pas: "une carte" } as never);
    expect(await isDisposableCopy(unreadable)).toBe(false);
  });

  it("la vérification ne garde pas la base ouverte (elle reste effaçable)", async () => {
    const name = fresh();
    await createIndexedDbRepository({ dbName: name }).setActiveId("m1");
    expect(await isDisposableCopy(name)).toBe(true);
    expect(await purgeAccountCopies(DEMO_MODE)).toContain(name);
    expect(await names()).not.toContain(name);
  });
});

describe("effacement des copies des comptes", () => {
  const deps = (all: string[], keep: string[] = []) => {
    const deleted: string[] = [];
    return {
      deleted,
      deps: {
        listDatabases: async () => all,
        isDisposableCopy: async (name: string) => !keep.includes(name),
        deleteDatabase: async (name: string) => void deleted.push(name),
      },
    };
  };
  const A = `${USER_DB_PREFIX}a`;
  const B = `${USER_DB_PREFIX}b`;

  it("démo ou page de connexion : la base de démo et les copies à garder restent", async () => {
    const { deleted, deps: d } = deps(["stratavault", A, B], [B]);
    expect(await purgeAccountCopies(DEMO_MODE, { deps: d })).toEqual([A]);
    expect(deleted).toEqual([A]);
  });

  it("un compte s'ouvre : toutes les copies des autres comptes sont effacées, jamais la sienne", async () => {
    const { deleted, deps: d } = deps(["stratavault", A, B], [A, B]);
    expect(await purgeAccountCopies({ kind: "account", userId: "a" }, { deps: d })).toEqual([B]);
    expect(deleted).toEqual([B]);
  });

  it("base ouverte entre-temps par cet onglet : gardée", async () => {
    const { deleted, deps: d } = deps([A, B]);
    expect(await purgeAccountCopies(DEMO_MODE, { deps: d, inUse: (name) => name === A })).toEqual([B]);
    expect(deleted).toEqual([B]);
  });

  it("sans indexedDB.databases() : rien n'est fait", async () => {
    expect(await purgeAccountCopies(DEMO_MODE, { deps: null })).toEqual([]);
  });
});
