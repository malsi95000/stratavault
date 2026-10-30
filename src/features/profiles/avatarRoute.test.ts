// GET /avatars/<id> (src/app/avatars/[id]/route.ts) : réservé aux comptes connectés, même réponse 404
// pour toute absence, lecture ouverte par la base, seul un WebP 256 × 256 est servi, toujours
// ré-encodé (le vrai sharp), en-têtes sûrs. Client Supabase et en-têtes simulés.
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "@/app/avatars/[id]/route";
import { resetAuthRateLimits } from "@/features/auth/rateLimit";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AVATAR = "11111111-1111-4111-8111-111111111111";
/** Avatar tel que l'application l'enregistre : WebP 256 × 256. */
let WEBP: Uint8Array;
const webp = async (width: number, height: number) =>
  new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } }).webp().toBuffer(),
  );

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  /** Avatars que open_avatar_read déclare lisibles. */
  readable: new Set<string>(),
  files: new Map<string, Uint8Array>(),
  rpc: vi.fn(),
  downloads: [] as string[],
  storageDown: { value: false },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe("avatars");
        return {
          download: async (path: string) => {
            mocks.downloads.push(path);
            if (mocks.storageDown.value) return { data: null, error: { status: 503, statusCode: "503", message: "down" } };
            const bytes = mocks.files.get(path);
            return bytes
              ? { data: new Blob([bytes as BlobPart]), error: null }
              : { data: null, error: { status: 400, statusCode: "404", message: "Object not found" } };
          },
        };
      },
    },
  }),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.5" }) }));

const request = () => new Request(`http://localhost:3000/avatars/${AVATAR}`);
const get = (id: string) => GET(request(), { params: Promise.resolve({ id }) });

beforeAll(async () => {
  WEBP = await webp(256, 256);
});

beforeEach(() => {
  resetAuthRateLimits();
  mocks.getUser.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: ALICE } }, error: null });
  mocks.readable.clear();
  mocks.files.clear();
  mocks.downloads.length = 0;
  mocks.storageDown.value = false;
  mocks.rpc.mockReset();
  mocks.rpc.mockImplementation(async (fn: string, args: { p_avatar: string }) => {
    expect(fn).toBe("open_avatar_read");
    return { data: mocks.readable.has(args.p_avatar), error: null };
  });
  mocks.readable.add(AVATAR);
  mocks.files.set(AVATAR, WEBP);
});

const expect404 = async (response: Response) => {
  expect(response.status).toBe(404);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).toBe("");
};

describe("GET /avatars/<id>", () => {
  it("sert l'image ré-encodée d'un profil visible, avec des en-têtes sûrs", async () => {
    const response = await get(AVATAR);
    expect(response.status).toBe(200);
    const served = new Uint8Array(await response.arrayBuffer());
    expect(await sharp(served).metadata()).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "image/webp",
      "content-length": String(served.length),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
      "cache-control": "private, max-age=300",
    });
    // Lecture ouverte par la base, puis le fichier « <avatar_id> » (sans identifiant de compte).
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("open_avatar_read", { p_avatar: AVATAR });
    expect(mocks.downloads).toEqual([AVATAR]);
  });

  it("même 404 sans session, pour un avatar inconnu ou masqué, un identifiant mal formé, un fichier absent", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect404(await get(AVATAR));
    mocks.getUser.mockResolvedValue({ data: { user: { id: ALICE } }, error: null });
    await expect404(await get("22222222-2222-4222-8222-222222222222"));
    for (const id of ["x", `${AVATAR}.svg`, AVATAR.toUpperCase().replace(/1/g, "A"), `../${AVATAR}`]) await expect404(await get(id));
    mocks.files.clear();
    await expect404(await get(AVATAR));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("ne sert jamais tel quel un fichier envoyé directement à Storage", async () => {
    const text = (value: string) => new TextEncoder().encode(value);
    const refused = [
      text("<svg><script>alert(1)</script></svg>"),
      // En-tête RIFF/WEBP suivi d'autre chose (polyglotte), WebP d'une autre taille, fichier trop lourd.
      new Uint8Array([...text("RIFF"), 8, 0, 0, 0, ...text("WEBPVP8 "), ...text("<html><script>alert(1)</script>")]),
      await webp(512, 512),
      await webp(256, 255),
      new Uint8Array([...WEBP, ...new Uint8Array(200 * 1024)]),
    ];
    for (const bytes of refused) {
      mocks.files.set(AVATAR, bytes);
      await expect404(await get(AVATAR));
    }
    // Un WebP valide suivi de données cachées : seuls ses pixels passent.
    mocks.files.set(AVATAR, new Uint8Array([...WEBP, ...text("<script>alert(1)</script>")]));
    const response = await get(AVATAR);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).includes("script")).toBe(false);
  });

  it("Storage injoignable : 404, sans détail", async () => {
    mocks.storageDown.value = true;
    await expect404(await get(AVATAR));
  });

  it("erreur de la base : 404 ; HEAD refusé", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect404(await get(AVATAR));
    expect(HEAD().status).toBe(405);
  });

  it("limite par IP (un identifiant mal formé ne coûte rien et ne compte pas)", async () => {
    mocks.files.clear();
    for (let i = 0; i < 600; i += 1) await get(AVATAR);
    mocks.getUser.mockClear();
    expect((await get(AVATAR)).status).toBe(429);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
