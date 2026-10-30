// Nom affiché et présentation d'un profil : mêmes règles que la base
// (supabase/migrations/20261017120100_profiles.sql, profiles_display_name_ok,
// profiles_display_name_reserved et profiles_bio_ok).
// Les longueurs comptent les caractères (points de code), comme char_length de PostgreSQL.
import { foldHandle } from "./handle";

export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 280;
/** Retours à la ligne au plus dans une présentation (6 lignes). */
export const BIO_MAX_NEWLINES = 5;

/**
 * Caractères invisibles, de mise en forme ou de remplissage, refusés partout : trait d'union
 * conditionnel, joignant de graphèmes, marques de sens de lecture, remplissages hangûl, voyelles
 * inhérentes khmères, sélecteurs mongols, espaces sans chasse, séparateurs de ligne, inversions du
 * sens de lecture, opérateurs invisibles, braille vide, sélecteurs de variante, indicateur d'ordre
 * des octets, annotations interlinéaires et leurs réserves, remplissage khitan, contrôles de format
 * sténographiques, mise en forme musicale, caractères « étiquette » et toute la plage E0000-E0FFF :
 * toute la propriété Unicode Default_Ignorable_Code_Point. Ils permettraient d'afficher un nom vide ou
 * trompeur (celui d'un autre membre). Même liste que la base (profiles_has_format_chars).
 */
const FORMAT_CHARS =
  /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u2028-\u202e\u2060-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufffb\u{16fe4}\u{1bca0}-\u{1bca3}\u{1d173}-\u{1d17a}\u{e0000}-\u{e0fff}]/u;
/**
 * Marques combinantes (blocs principaux) refusées au début d'un nom affiché : seules, elles
 * s'affichent sur le vide. Même liste que la base (profiles_display_name_ok).
 */
const LEADING_COMBINING = /^[\u0300-\u036f\u0483-\u0489\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/u;
/** Caractères de contrôle (dont la tabulation et le retour à la ligne). */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
/** Caractères de contrôle sauf le retour à la ligne. */
const CONTROL_CHARS_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;

export const charCount = (value: string) => [...value].length;

/**
 * Mots réservés d'un nom affiché : un nom dont un mot en CONTIENT un laisse croire à un compte de
 * l'équipe (« Équipe Stratavault — Modération »). « support », réservé dans les identifiants, est trop
 * courant dans un nom (« Supporter du PSG »). Mêmes mots que la base (profiles_display_name_reserved).
 */
export const RESERVED_DISPLAY_NAME_WORDS: readonly string[] = ["admin", "moderat", "stratavault", "officiel", "official"];
const FOLDED_DISPLAY_NAME_WORDS = RESERVED_DISPLAY_NAME_WORDS.map(foldHandle);
/**
 * Mot réservé cherché aussi dans le nom entier, sans ses espaces (« Strata Vault »). Les autres ne
 * le sont que mot par mot : sinon « Conrad Mint » contiendrait « admin ».
 */
export const RESERVED_DISPLAY_NAME_JOINED = "stratavault";
const FOLDED_DISPLAY_NAME_JOINED = foldHandle(RESERVED_DISPLAY_NAME_JOINED);

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
/**
 * Lettres d'autres alphabets qui ressemblent à une lettre latine (confusables courants), ramenées à
 * cette lettre avant la recherche des mots réservés : « Аdmin » écrit avec un А cyrillique est lu
 * « admin ». Toutes sont inchangées par NFKD. Chaque groupe : lettres, puis lettres latines
 * correspondantes, dans le même ordre. Même table que la base (profiles_display_name_comparable),
 * vérifiée par les tests.
 */
export const DISPLAY_NAME_CONFUSABLES: readonly (readonly [string, string])[] = [
  // Cyrillique, majuscules : А В Е К М Н О Р С Т У Х Ѕ І Ј Ӏ Ү Һ Ԁ Ԛ Ԝ
  [
    cp(0x410, 0x412, 0x415, 0x41a, 0x41c, 0x41d, 0x41e, 0x420, 0x421, 0x422, 0x423, 0x425, 0x405, 0x406, 0x408, 0x4c0, 0x4ae, 0x4ba, 0x500, 0x51a, 0x51c),
    "abekmhopctyxsijlyhdqw",
  ],
  // Cyrillique, minuscules : а в г е к м н о п р с т у х ѕ і ј ӏ ү һ ԁ ԛ ԝ
  [
    cp(0x430, 0x432, 0x433, 0x435, 0x43a, 0x43c, 0x43d, 0x43e, 0x43f, 0x440, 0x441, 0x442, 0x443, 0x445, 0x455, 0x456, 0x458, 0x4cf, 0x4af, 0x4bb, 0x501, 0x51b, 0x51d),
    "abrekmhonpctyxsijlyhdqw",
  ],
  // Grec, majuscules : Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ
  [cp(0x391, 0x392, 0x395, 0x396, 0x397, 0x399, 0x39a, 0x39c, 0x39d, 0x39f, 0x3a1, 0x3a4, 0x3a5, 0x3a7), "abezhikmnoptyx"],
  // Grec, minuscules : α ε η ι κ ν ο ρ τ υ χ ω ϳ
  [cp(0x3b1, 0x3b5, 0x3b7, 0x3b9, 0x3ba, 0x3bd, 0x3bf, 0x3c1, 0x3c4, 0x3c5, 0x3c7, 0x3c9, 0x3f3), "aenikvoptuxwj"],
  // Latin : ı ȷ ɑ ɡ ɩ, petites capitales ᴀ ʙ ᴄ ᴅ ᴇ ɢ ʜ ɪ ᴊ ᴋ ʟ ᴍ ɴ ᴏ ᴘ ʀ ꜱ ᴛ ᴜ ᴠ ᴡ ʏ ᴢ
  [
    cp(
      0x131, 0x237, 0x251, 0x261, 0x269, 0x1d00, 0x299, 0x1d04, 0x1d05, 0x1d07, 0x262, 0x29c, 0x26a, 0x1d0a, 0x1d0b, 0x29f,
      0x1d0d, 0x274, 0x1d0f, 0x1d18, 0x280, 0xa731, 0x1d1b, 0x1d1c, 0x1d20, 0x1d21, 0x28f, 0x1d22,
    ),
    "ijagiabcdeghijklmnoprstuvwyz",
  ],
];

/** Majuscules ASCII et confusables vers leur lettre latine minuscule (comme translate() dans la base). */
const COMPARABLE_LETTERS = comparableLetters();

function comparableLetters(): Map<string, string> {
  const from = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ...DISPLAY_NAME_CONFUSABLES.flatMap(([letters]) => [...letters])];
  const to = [..."abcdefghijklmnopqrstuvwxyz", ...DISPLAY_NAME_CONFUSABLES.flatMap(([, latin]) => [...latin])];
  const map = new Map<string, string>();
  // translate() garde la première occurrence d'un caractère répété.
  from.forEach((char, index) => {
    if (!map.has(char)) map.set(char, to[index]);
  });
  return map;
}

/** Espaces qui séparent les mots après la décomposition NFKD (les autres espaces Unicode y deviennent « »). */
const WORD_SEPARATORS = /[ \u1680]+/u;
/** Tout ce qui n'est ni une lettre a-z, ni un chiffre, ni un séparateur (accents séparés, ponctuation…). */
const NOT_WORD_CHAR = /[^a-z0-9 \u1680]/gu;

const ALL_WORD_SEPARATORS = new RegExp(WORD_SEPARATORS.source, "gu");

/**
 * Nom affiché sous une forme comparable : décomposition de compatibilité (NFKD : lettres stylisées
 * ou pleine chasse ramenées aux lettres simples, accents séparés), majuscules ASCII en minuscules,
 * confusables ramenés à leur lettre latine (DISPLAY_NAME_CONFUSABLES), puis tout sauf a-z, 0-9 et
 * les espaces retiré. Même règle que la base (profiles_display_name_comparable).
 */
export function displayNameComparable(name: string): string {
  return [...name.normalize("NFKD")]
    .map((char) => COMPARABLE_LETTERS.get(char) ?? char)
    .join("")
    .replace(NOT_WORD_CHAR, "");
}

/** Mots d'un nom affiché sous sa forme comparable, découpée aux espaces, puis repliée comme les identifiants. */
export function displayNameWords(name: string): string[] {
  return displayNameComparable(name).split(WORD_SEPARATORS).filter(Boolean).map(foldHandle);
}

/**
 * Nom affiché qui laisse croire à un compte de l'équipe : un de ses mots contient un mot réservé, ou
 * le nom entier, sans ses espaces, contient « stratavault ». Même règle que la base.
 */
export function isReservedDisplayName(name: string): boolean {
  if (displayNameWords(name).some((word) => FOLDED_DISPLAY_NAME_WORDS.some((reserved) => word.includes(reserved)))) {
    return true;
  }
  return foldHandle(displayNameComparable(name).replace(ALL_WORD_SEPARATORS, "")).includes(FOLDED_DISPLAY_NAME_JOINED);
}

/** Nom affiché tel qu'il est enregistré : sans espaces autour (tous les espaces Unicode, comme le fait trim()). */
export const normalizeDisplayName = (raw: string) => raw.trim();

/** Présentation telle qu'elle est enregistrée : fins de ligne « \n », sans espaces ni lignes vides autour. */
export const normalizeBio = (raw: string) => raw.replace(/\r\n?/g, "\n").replace(/^[ \n]+|[ \n]+$/g, "");

export type TextProblem = "empty" | "too-long" | "too-many-lines" | "forbidden-chars" | "reserved";

/** Problème d'un nom affiché déjà normalisé, ou null s'il est accepté. */
export function displayNameProblem(name: string): TextProblem | null {
  if (name.length === 0) return "empty";
  if (charCount(name) > DISPLAY_NAME_MAX) return "too-long";
  // Espaces Unicode au bord (normalizeDisplayName les retire ; la base les refuse) et marque
  // combinante au début.
  if (name !== name.trim() || LEADING_COMBINING.test(name)) return "forbidden-chars";
  if (CONTROL_CHARS.test(name) || FORMAT_CHARS.test(name)) return "forbidden-chars";
  if (isReservedDisplayName(name)) return "reserved";
  return null;
}

/** Problème d'une présentation déjà normalisée, ou null si elle est acceptée (vide comprise). */
export function bioProblem(bio: string): TextProblem | null {
  if (charCount(bio) > BIO_MAX) return "too-long";
  if (bio.split("\n").length - 1 > BIO_MAX_NEWLINES) return "too-many-lines";
  if (CONTROL_CHARS_EXCEPT_NEWLINE.test(bio) || FORMAT_CHARS.test(bio)) return "forbidden-chars";
  return null;
}

/** Initiales du nom affiché, pour l'avatar par défaut (deux lettres au plus). */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => [...word][0] ?? "");
  return letters.join("").toLocaleUpperCase("fr-FR") || "?";
}
