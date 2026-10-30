// POST /carte/partagee/<id>/verrou (sendBeacon à la fermeture de l'éditeur coopératif) : même origine
// exigée, compte attendu, la base ne libère que le verrou du compte. Client et en-têtes simulés.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/carte/partagee/[id]/verrou/route";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MAP = "12345678-1234-4234-8234-123456789abc";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  headers: { value: new Headers() },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers.value }));

const SAME_ORIGIN = { origin: "https://stratavault.vercel.app", host: "stratavault.vercel.app" };

function post(id: string, body: string, headers: Record<string, string> = SAME_ORIGIN) {
  mocks.headers.value = new Headers(headers);
  const request = new Request(`https://stratavault.vercel.app/carte/partagee/${id}/verrou`, { method: "POST", body });
  return POST(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.getUser.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: ALICE, email: "a@exemple.fr" } }, error: null });
});

describe("libération du verrou par sendBeacon", () => {
  it("même origine, compte attendu : verrou libéré, réponse vide et jamais mise en cache", async () => {
    const response = await post(MAP, ALICE);
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("release_map_lock", { p_map: MAP });
  });

  it("autre origine, identifiant mal formé, corps trop long : rien n'est fait", async () => {
    expect((await post(MAP, ALICE, { origin: "https://exemple.fr", host: "stratavault.vercel.app" })).status).toBe(403);
    expect((await post(MAP, ALICE, { host: "stratavault.vercel.app" })).status).toBe(403);
    expect((await post("pas-un-uuid", ALICE)).status).toBe(404);
    expect((await post(MAP, "x".repeat(1000))).status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("session d'un autre compte ou terminée : rien n'est libéré", async () => {
    expect((await post(MAP, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).status).toBe(204);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", message: "x", status: 400 } });
    expect((await post(MAP, ALICE)).status).toBe(204);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
