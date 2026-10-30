// Vérification et ré-encodage des avatars (avatarImage.ts), à l'envoi et à la lecture, avec le vrai sharp.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  AVATAR_INPUT_MAX_BYTES,
  AVATAR_OUTPUT_MAX_BYTES,
  AVATAR_SIZE,
  detectImageKind,
  isWebp,
  reencodeAvatar,
  sanitizeStoredAvatar,
} from "./avatarImage";

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } } });

const bytes = async (image: ReturnType<typeof sharp>) => new Uint8Array(await image.toBuffer());

describe("signature des images", () => {
  it("reconnaît PNG, JPEG et WebP à leurs premiers octets, rien d'autre", async () => {
    expect(detectImageKind(await bytes(solid(4, 4).png()))).toBe("png");
    expect(detectImageKind(await bytes(solid(4, 4).jpeg()))).toBe("jpeg");
    expect(detectImageKind(await bytes(solid(4, 4).webp()))).toBe("webp");
    expect(detectImageKind(await bytes(solid(4, 4).gif()))).toBeNull();
    const text = (value: string) => new TextEncoder().encode(value);
    expect(detectImageKind(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(detectImageKind(text("<html><body>x</body></html>"))).toBeNull();
    expect(detectImageKind(text("RIFF....AVI LIST"))).toBeNull();
    expect(detectImageKind(new Uint8Array())).toBeNull();
  });
});

describe("reencodeAvatar", () => {
  it("produit un WebP carré de 256 pixels, sans métadonnées", async () => {
    const withExif = await bytes(
      solid(800, 400)
        .jpeg()
        .withMetadata({ exif: { IFD0: { Copyright: "Secret", ImageDescription: "Maison" } } }),
    );
    expect(Buffer.from(withExif).includes("Secret")).toBe(true);
    const result = await reencodeAvatar(withExif);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isWebp(result.bytes)).toBe(true);
    const meta = await sharp(result.bytes).metadata();
    expect(meta).toMatchObject({ format: "webp", width: AVATAR_SIZE, height: AVATAR_SIZE });
    expect(meta.exif).toBeUndefined();
    expect(Buffer.from(result.bytes).includes("Secret")).toBe(false);
  });

  it("ne garde rien de ce qui suit l'image (fichier polyglotte)", async () => {
    const png = await bytes(solid(64, 64).png());
    const polyglot = new Uint8Array([...png, ...new TextEncoder().encode("<script>alert(1)</script>")]);
    const result = await reencodeAvatar(polyglot);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Buffer.from(result.bytes).includes("script")).toBe(false);
  });

  it("refuse SVG, GIF, fichier vide ou trop lourd, image trop grande, contenu corrompu", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    expect(await reencodeAvatar(svg)).toEqual({ ok: false, error: "bad-type" });
    expect(await reencodeAvatar(await bytes(solid(8, 8).gif()))).toEqual({ ok: false, error: "bad-type" });
    expect(await reencodeAvatar(new Uint8Array())).toEqual({ ok: false, error: "too-large" });
    expect(await reencodeAvatar(new Uint8Array(AVATAR_INPUT_MAX_BYTES + 1))).toEqual({ ok: false, error: "too-large" });
    expect(await reencodeAvatar(await bytes(solid(4100, 10).png()))).toEqual({ ok: false, error: "unreadable" });
    const png = await bytes(solid(64, 64).png());
    expect(await reencodeAvatar(png.slice(0, 40))).toEqual({ ok: false, error: "unreadable" });
  });

  it("refuse un fichier dont le contenu n'est pas du format annoncé par sa signature", async () => {
    // Signature PNG suivie d'un JPEG : le décodeur ne reconnaît pas un PNG.
    const jpeg = await bytes(solid(16, 16).jpeg());
    const forged = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...jpeg]);
    expect((await reencodeAvatar(forged)).ok).toBe(false);
  });

  it("sharp indisponible : refus, jamais d'image enregistrée telle quelle", async () => {
    const png = await bytes(solid(16, 16).png());
    expect(await reencodeAvatar(png, async () => null)).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("sanitizeStoredAvatar (fichier lu dans Storage avant de le servir)", () => {
  it("ré-encode un WebP 256 × 256 : seuls ses pixels passent, sans métadonnées ni données cachées", async () => {
    const withExif = await bytes(
      solid(AVATAR_SIZE, AVATAR_SIZE)
        .webp()
        .withMetadata({ exif: { IFD0: { Copyright: "Secret" } } }),
    );
    expect(Buffer.from(withExif).includes("Secret")).toBe(true);
    const stored = new Uint8Array([...withExif, ...new TextEncoder().encode("<script>alert(1)</script>")]);
    const served = await sanitizeStoredAvatar(stored);
    expect(served).not.toBeNull();
    if (!served) return;
    expect(await sharp(served).metadata()).toMatchObject({ format: "webp", width: AVATAR_SIZE, height: AVATAR_SIZE });
    expect((await sharp(served).metadata()).exif).toBeUndefined();
    expect(Buffer.from(served).includes("Secret")).toBe(false);
    expect(Buffer.from(served).includes("script")).toBe(false);
  });

  it("refuse tout autre contenu : autre format, autre taille, en-tête WebP sans image, trop lourd", async () => {
    const text = (value: string) => new TextEncoder().encode(value);
    expect(await sanitizeStoredAvatar(await bytes(solid(AVATAR_SIZE, AVATAR_SIZE).png()))).toBeNull();
    expect(await sanitizeStoredAvatar(await bytes(solid(512, 512).webp()))).toBeNull();
    expect(await sanitizeStoredAvatar(await bytes(solid(AVATAR_SIZE, 10).webp()))).toBeNull();
    expect(await sanitizeStoredAvatar(new Uint8Array([...text("RIFF"), 8, 0, 0, 0, ...text("WEBPVP8 "), ...text("<html>")]))).toBeNull();
    expect(await sanitizeStoredAvatar(new Uint8Array(AVATAR_OUTPUT_MAX_BYTES + 1))).toBeNull();
    expect(await sanitizeStoredAvatar(new Uint8Array())).toBeNull();
  });

  it("sharp indisponible : rien n'est servi", async () => {
    const stored = await bytes(solid(AVATAR_SIZE, AVATAR_SIZE).webp());
    expect(await sanitizeStoredAvatar(stored, async () => null)).toBeNull();
  });
});
