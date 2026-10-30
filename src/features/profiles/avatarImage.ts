import "server-only";

// Avatar envoyé par un membre : vérifié puis RÉ-ENCODÉ par le serveur avant tout enregistrement.
//
// 1. taille du fichier bornée (2 Mo) avant toute lecture du contenu ;
// 2. type reconnu à sa SIGNATURE (premiers octets), jamais au nom ni au type déclarés par le
//    navigateur : PNG, JPEG ou WebP seulement — SVG (qui peut contenir du script), GIF, HTML, etc.
//    sont refusés ;
// 3. décodage par sharp (libvips) limité à 4 096 × 4 096 pixels, en vérifiant que le décodeur reconnaît
//    le même format que la signature ;
// 4. nouvelle image WebP de 256 × 256 pixels (recadrée au centre, orientation EXIF appliquée), qui ne
//    garde AUCUNE métadonnée (position GPS, appareil, commentaires) ni rien de caché dans le fichier
//    d'origine (polyglotte, données après la fin de l'image) ; 100 Ko au plus.
// Seul ce fichier produit par le serveur est envoyé à Supabase Storage par l'application. Un fichier
// envoyé directement à l'API Storage ne passe pas par ici : il est revérifié et ré-encodé à la lecture
// (sanitizeStoredAvatar).

export const AVATAR_INPUT_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MAX_SIDE = 4096;
export const AVATAR_SIZE = 256;
export const AVATAR_OUTPUT_MAX_BYTES = 100 * 1024;
export const AVATAR_CONTENT_TYPE = "image/webp";

export type ImageKind = "png" | "jpeg" | "webp";

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, i) => bytes[offset + i] === byte);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** Format reconnu à la signature du fichier, ou null (SVG, GIF, texte… refusés). */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, PNG)) return "png";
  if (startsWith(bytes, JPEG)) return "jpeg";
  if (isWebp(bytes)) return "webp";
  return null;
}

/** Vrai pour un fichier WebP (conteneur RIFF « WEBP ») : seul format servi par /avatars/<id>. */
export function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 16 && startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8);
}

export type AvatarEncoding =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: "too-large" | "bad-type" | "unreadable" | "unavailable" };

type Sharp = typeof import("sharp").default;

/** sharp est chargé à la demande : s'il manque sur le serveur, l'envoi est refusé (jamais d'image non ré-encodée). */
async function loadSharp(): Promise<Sharp | null> {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

/** Vérifie et ré-encode l'image envoyée (voir l'en-tête du fichier). */
export async function reencodeAvatar(input: Uint8Array, load: () => Promise<Sharp | null> = loadSharp): Promise<AvatarEncoding> {
  if (input.length === 0 || input.length > AVATAR_INPUT_MAX_BYTES) return { ok: false, error: "too-large" };
  const kind = detectImageKind(input);
  if (!kind) return { ok: false, error: "bad-type" };
  const sharp = await load();
  if (!sharp) return { ok: false, error: "unavailable" };
  try {
    const options = { limitInputPixels: AVATAR_MAX_SIDE * AVATAR_MAX_SIDE, failOn: "error", animated: false } as const;
    const metadata = await sharp(input, options).metadata();
    if (metadata.format !== kind) return { ok: false, error: "bad-type" };
    if (!metadata.width || !metadata.height || metadata.width > AVATAR_MAX_SIDE || metadata.height > AVATAR_MAX_SIDE) {
      return { ok: false, error: "unreadable" };
    }
    const output = await sharp(input, options)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
    if (output.length > AVATAR_OUTPUT_MAX_BYTES || !isWebp(output)) return { ok: false, error: "unreadable" };
    return { ok: true, bytes: new Uint8Array(output) };
  } catch {
    // Fichier tronqué, corrompu ou trop grand en pixels : refusé, sans détail.
    return { ok: false, error: "unreadable" };
  }
}

/**
 * Fichier lu dans Storage, avant de le servir à un autre membre (/avatars/<id>) : la base ne voit pas
 * le contenu des fichiers, et un compte peut envoyer n'importe quels octets directement par l'API
 * Storage avec son jeton. Le fichier n'est donc jamais transmis tel quel : il doit être un WebP
 * d'une seule image de 256 × 256 pixels (sinon null), et il est RÉ-ENCODÉ — seuls ses pixels
 * passent ; métadonnées, données cachées ou malformations destinées au décodeur du navigateur sont
 * écartées. sharp indisponible : null (jamais de fichier servi tel quel).
 */
export async function sanitizeStoredAvatar(
  stored: Uint8Array,
  load: () => Promise<Sharp | null> = loadSharp,
): Promise<Uint8Array | null> {
  if (stored.length === 0 || stored.length > AVATAR_OUTPUT_MAX_BYTES || !isWebp(stored)) return null;
  const sharp = await load();
  if (!sharp) return null;
  try {
    const options = { limitInputPixels: AVATAR_SIZE * AVATAR_SIZE, failOn: "error", animated: false } as const;
    const metadata = await sharp(stored, options).metadata();
    if (metadata.format !== "webp" || metadata.width !== AVATAR_SIZE || metadata.height !== AVATAR_SIZE) return null;
    if ((metadata.pages ?? 1) !== 1) return null;
    const output = await sharp(stored, options).webp({ quality: 90 }).toBuffer();
    if (output.length > AVATAR_OUTPUT_MAX_BYTES || !isWebp(output)) return null;
    return new Uint8Array(output);
  } catch {
    return null;
  }
}
