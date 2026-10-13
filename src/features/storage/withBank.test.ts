import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { addPing } from "@/features/map-doc/ops";
import { blankDoc } from "@/features/map-doc/schema";
import { createIndexedDbRepository } from "./indexeddb";
import { withBank } from "./withBank";

let n = 0;
const fresh = () => createIndexedDbRepository({ dbName: `with-bank-${++n}` });

describe("withBank (dépôt distant pour les cartes)", () => {
  it("lit et écrit les cartes dans la banque, le brouillon et la carte active en local", async () => {
    const local = fresh();
    const remote = fresh();
    const repo = withBank(local, remote);
    const doc = addPing(blankDoc(), [1, 2], "crise", "p1")!.doc;

    const entry = await repo.create("Sahel", doc);
    await repo.rename(entry.id, "Sahel 2026");
    await repo.setDraft(doc);
    await repo.setActiveId(entry.id);

    expect((await remote.list()).map((e) => e.name)).toEqual(["Sahel 2026"]);
    expect(await local.list()).toEqual([]);
    expect(await local.getDraft()).toEqual(doc);
    expect(await local.getActiveId()).toBe(entry.id);
    expect(await remote.getActiveId()).toBeNull();

    expect(await repo.update(entry.id, blankDoc())).not.toBeNull();
    expect((await repo.get(entry.id))?.data).toEqual(blankDoc());
    await repo.remove(entry.id);
    expect(await remote.list()).toEqual([]);
  });
});
