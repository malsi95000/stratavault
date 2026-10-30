// Cartes du compte qui ont des membres (page « Mon espace stratégique ») : seulement les membres
// comptent ; une lecture impossible donne une liste vide, jamais une erreur de page.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { ok: true } as object | null,
  rows: [] as { mapId: string; kind: string }[],
  fail: false,
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.db }));
vi.mock("@/lib/supabase/sharing", () => ({
  listMapShareRows: async (_db: unknown, mapId: unknown) => {
    expect(mapId).toBeNull();
    if (mocks.fail) throw new Error("base injoignable");
    return mocks.rows;
  },
}));

const { readOwnSharedMapIds } = await import("./ownSharedMaps");

beforeEach(() => {
  mocks.db = { ok: true };
  mocks.rows = [];
  mocks.fail = false;
});

describe("readOwnSharedMapIds", () => {
  it("cartes qui ont au moins un membre, sans doublon (invitations et liens seuls ne comptent pas)", async () => {
    mocks.rows = [
      { mapId: "a", kind: "member" },
      { mapId: "a", kind: "member" },
      { mapId: "b", kind: "invitation" },
      { mapId: "c", kind: "link" },
      { mapId: "d", kind: "member" },
    ];
    expect(await readOwnSharedMapIds()).toEqual(["a", "d"]);
  });

  it("sans session ou base injoignable : liste vide", async () => {
    mocks.rows = [{ mapId: "a", kind: "member" }];
    mocks.fail = true;
    expect(await readOwnSharedMapIds()).toEqual([]);
    mocks.db = null;
    mocks.fail = false;
    expect(await readOwnSharedMapIds()).toEqual([]);
  });
});
