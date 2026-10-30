// Identifiant public d'un profil (« handle ») : mêmes règles que la base
// (supabase/migrations/20261017120100_profiles.sql, profiles_handle_format_ok, profiles_handle_fold
// et profiles_handle_reserved), vérifiées par profiles.sql.test.ts.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

/** 3 à 30 caractères : minuscules, chiffres, « _ » ; commence et finit par une lettre ou un chiffre. */
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$/;

/**
 * Identifiants réservés : noms du service, de ses pages et de ses rôles, pour qu'aucun compte ne se
 * fasse passer pour l'équipe, comparés sous forme repliée (« r00t », « he1p »). Même liste que la base.
 */
export const RESERVED_HANDLES: readonly string[] = [
  "abuse", "aide", "anonyme", "anonymous", "api", "auth", "avatars", "bot", "carte", "cartes",
  "cnil", "collectif", "collective", "communaute", "community", "compte", "comptes", "conditions",
  "confidentialite", "connexion", "contact", "contacts", "cookies", "demo", "equipe", "espace",
  "everyone", "help", "historique", "hostmaster", "info", "infos", "inscription", "invite", "legal",
  "mail", "member", "members", "membre", "membres", "mentions_legales", "moi", "modo", "modos",
  "noreply", "no_reply", "nous", "null", "partage", "postmaster", "profil", "profile", "profils",
  "robot", "root", "securite", "security", "signalement", "signalements", "staff", "system",
  "systeme", "team", "tous", "undefined", "webmaster", "www",
];

/**
 * Mots réservés : tout identifiant qui en CONTIENT un (sous forme repliée) est refusé — « adm1n »,
 * « adrnin », « la_moderation », « equipe_stratavault »… Mêmes mots que la base. Revers assumé :
 * quelques identifiants anodins (« badminton », « supporter_psg ») sont refusés aussi.
 */
export const RESERVED_HANDLE_WORDS: readonly string[] = [
  "admin",
  "moderat",
  "stratavault",
  "officiel",
  "official",
  "support",
];

/** Remplacements de la forme repliée : chiffres qui imitent une lettre, « l » et « i » confondus, « _ » retiré. */
const FOLD: Readonly<Record<string, string>> = { "0": "o", "1": "i", l: "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", _: "" };

/**
 * Forme « repliée » d'un identifiant : caractères de FOLD remplacés, puis « rn » → « m » et
 * « vv » → « w » (lettres qui se confondent à l'écran). Sert à le comparer aux mots réservés, et la
 * base refuse deux identifiants de même forme repliée (« alice », « a1ice », « al_ice », « aiice »).
 * Même règle que public.profiles_handle_fold dans la base.
 */
export const foldHandle = (handle: string) =>
  handle
    .replace(/[01l34578_]/g, (char) => FOLD[char] ?? char)
    .replaceAll("rn", "m")
    .replaceAll("vv", "w");

const FOLDED_RESERVED = new Set(RESERVED_HANDLES.map(foldHandle));
const FOLDED_WORDS = RESERVED_HANDLE_WORDS.map(foldHandle);

/** Identifiant tel que la base l'enregistre : sans espaces autour, sans « @ » initial, en minuscules. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/** Format d'un identifiant déjà normalisé (au moins une lettre : jamais un simple nombre). */
export function isHandleFormatOk(handle: string): boolean {
  return HANDLE_PATTERN.test(handle) && /[a-z]/.test(handle);
}

/** Identifiant réservé : égal à un nom réservé, ou contenant un mot réservé (formes repliées). */
export function isReservedHandle(handle: string): boolean {
  const folded = foldHandle(handle);
  return FOLDED_RESERVED.has(folded) || FOLDED_WORDS.some((word) => folded.includes(word));
}

/** Identifiant utilisable pour un nouveau profil ou un changement d'identifiant. */
export const isHandleAvailableFormat = (handle: string) => isHandleFormatOk(handle) && !isReservedHandle(handle);
