import "server-only";

// Accès aux profils (public.profiles) et aux avatars (compartiment privé « avatars » de Supabase
// Storage) pour l'utilisateur vérifié par l'appelant, avec le jeton de SA session : la base et
// Storage appliquent leurs politiques (supabase/migrations/20261017120100_profiles.sql et
// 20261017120200_avatars.sql). Chaque lecture de sa propre ligne filtre aussi sur user_id (défense en
// profondeur) et ne lit que les colonnes utiles. Les écritures passent par les fonctions de la base
// (create_my_profile, update_my_profile, set_profile_avatar). Les profils des autres ne se lisent que
// par identifiant exact (profile_by_handle) ; aucune liste. Un fichier d'avatar s'appelle
// « <avatar_id> », nom tiré au hasard par la base avec le jeton d'envoi (open_avatar_upload) : il ne
// contient jamais l'identifiant du compte.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnProfile, ProfileFields, PublicProfile } from "@/features/profiles/types";
import type { Database } from "./database";

type Db = SupabaseClient<Database>;

export const AVATARS_BUCKET = "avatars";

/** Échec classé pour l'interface ; jamais le message brut de la base. */
export type ProfileErrorKind =
  | "handle-taken"
  | "handle-invalid"
  | "handle-reserved"
  | "invalid"
  | "exists"
  | "missing"
  | "rate-limited"
  | "unauthorized"
  | "unavailable";

export class ProfileDataError extends Error {
  constructor(readonly kind: ProfileErrorKind) {
    super(`profiles: ${kind}`);
  }
}

type DbError = { code?: string; message?: string };

const RAISED_ERRORS = new Map<string, ProfileErrorKind>([
  ["profiles_rate_limited", "rate-limited"],
  ["profiles_not_found", "missing"],
  ["profiles_invalid", "invalid"],
  ["profiles_exists", "exists"],
]);

/** Classe une erreur de PostgREST (codes PostgreSQL et nom de la contrainte en cause). */
export function classifyProfileError(error: DbError): ProfileErrorKind {
  const message = error.message ?? "";
  if (error.code === "P0001") return RAISED_ERRORS.get(message) ?? "unavailable";
  if (error.code === "23505") return /profiles_handle(_fold)?_key/.test(message) ? "handle-taken" : "exists";
  if (error.code === "23514") {
    if (message.includes("profiles_handle_format")) return "handle-invalid";
    if (message.includes("profiles_handle_reserved")) return "handle-reserved";
    return "invalid";
  }
  if (error.code === "22P02" || error.code === "22001") return "invalid";
  if (error.code === "42501" || error.code?.startsWith("PGRST3")) return "unauthorized";
  return "unavailable";
}

function fail(error: DbError): never {
  const kind = classifyProfileError(error);
  // Seul le code est journalisé : jamais le contenu d'un profil.
  if (kind === "unavailable") console.error(`[profiles] Requête refusée (code ${error.code ?? "inconnu"}).`);
  throw new ProfileDataError(kind);
}

const OWN_COLUMNS = "handle, display_name, bio, visibility, avatar_id, handle_changed_at, created_at, updated_at";

type OwnRow = {
  handle: string;
  display_name: string;
  bio: string;
  visibility: "members" | "contacts";
  avatar_id: string | null;
  handle_changed_at: string;
  created_at: string;
  updated_at: string;
};

const toOwn = (row: OwnRow): OwnProfile => ({
  handle: row.handle,
  displayName: row.display_name,
  bio: row.bio,
  visibility: row.visibility,
  avatarId: row.avatar_id,
  handleChangedAt: row.handle_changed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Paramètres des fonctions d'écriture de la base. */
const toArgs = (fields: ProfileFields) => ({
  p_handle: fields.handle,
  p_display_name: fields.displayName,
  p_bio: fields.bio,
  p_visibility: fields.visibility,
});

/** Profil du compte `userId` ; null s'il n'en a pas encore créé. */
export async function getOwnProfile(db: Db, userId: string): Promise<OwnProfile | null> {
  const { data, error } = await db.from("profiles").select(OWN_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) fail(error);
  return data ? toOwn(data) : null;
}

/**
 * Crée le profil du compte connecté (user_id = auth.uid(), fixé par la base). Identifiant déjà pris :
 * réponse « handle-taken » de la base (l'essai y est compté), levée ici comme les autres refus.
 */
export async function createProfile(db: Db, fields: ProfileFields): Promise<void> {
  const { data, error } = await db.rpc("create_my_profile", toArgs(fields));
  if (error) fail(error);
  if (data === "handle-taken") throw new ProfileDataError("handle-taken");
  if (data !== "created") fail({});
}

/**
 * Modifie le profil du compte connecté ; false s'il n'existe pas. Trop de changements de nom affiché :
 * réponse « rate-limited » de la base (le refus y reste compté), levée comme les autres refus.
 */
export async function updateProfile(db: Db, fields: ProfileFields): Promise<boolean> {
  const { data, error } = await db.rpc("update_my_profile", toArgs(fields));
  if (error) {
    if (classifyProfileError(error) === "missing") return false;
    fail(error);
  }
  if (data === "handle-taken") throw new ProfileDataError("handle-taken");
  if (data === "rate-limited") throw new ProfileDataError("rate-limited");
  if (data !== "saved") fail({});
  return true;
}

export async function deleteProfile(db: Db, userId: string): Promise<void> {
  const { error } = await db.from("profiles").delete().eq("user_id", userId);
  if (error) fail(error);
}

/** Profil désigné par l'identifiant exact `handle` (déjà normalisé), s'il est visible ; sinon null. */
export async function findProfile(db: Db, handle: string): Promise<PublicProfile | null> {
  const { data, error } = await db.rpc("profile_by_handle", { p_handle: handle });
  if (error) fail(error);
  const [row] = data ?? [];
  if (!row) return null;
  return {
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    avatarId: row.avatar_id,
    isSelf: row.is_self,
  };
}

/** Désigne (ou retire, avec null) l'avatar du profil connecté ; renvoie l'avatar précédent. */
export async function setProfileAvatar(db: Db, avatarId: string | null): Promise<string | null> {
  const { data, error } = await db.rpc("set_profile_avatar", { p_avatar: avatarId });
  if (error) fail(error);
  return typeof data === "string" ? data : null;
}

/**
 * Ouvre pour une minute la lecture de l'avatar `avatarId` par le compte connecté : vrai si c'est le
 * sien ou l'avatar actuel d'un profil qui lui est visible ; faux sinon (même réponse).
 */
export async function openAvatarRead(db: Db, avatarId: string): Promise<boolean> {
  const { data, error } = await db.rpc("open_avatar_read", { p_avatar: avatarId });
  if (error) fail(error);
  return data === true;
}

/** Échec d'une opération de Storage (aucun détail gardé : le message peut citer le chemin). */
export class AvatarStorageError extends Error {
  constructor(readonly operation: "upload" | "download" | "list" | "remove") {
    super(`avatars: ${operation}`);
  }
}

const AVATAR_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Demande à la base un jeton d'envoi (open_avatar_upload : 30 par jour et par compte, cinq minutes)
 * et renvoie le nom du fichier à envoyer, tiré au hasard par la base. Sans ce jeton, Storage refuse
 * l'envoi. Refus classés : « rate-limited », « missing » (pas de profil).
 */
export async function openAvatarUpload(db: Db): Promise<string> {
  const { data, error } = await db.rpc("open_avatar_upload");
  if (error) fail(error);
  if (typeof data !== "string" || !AVATAR_NAME.test(data)) fail({});
  return data;
}

/**
 * Annule le jeton d'envoi du compte connecté (cancel_avatar_upload) : son nom ne peut plus servir à
 * aucun envoi, même par une adresse signée déjà obtenue. Base d'avant les avatars (PGRST202) : rien à faire.
 */
export async function cancelAvatarUpload(db: Db): Promise<void> {
  const { error } = await db.rpc("cancel_avatar_upload");
  if (error && error.code !== "PGRST202") fail(error);
}

/** Envoie l'avatar WebP déjà ré-encodé sous le nom `name` ; jamais de remplacement d'un fichier existant (upsert: false). */
export async function uploadAvatarObject(db: Db, name: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const { error } = await db.storage
    .from(AVATARS_BUCKET)
    .upload(name, bytes, { contentType, upsert: false, cacheControl: "3600" });
  if (error) throw new AvatarStorageError("upload");
}

/** Réponse « fichier introuvable » de l'API Storage (404, ou 400 avec le code 404 selon les versions). */
function isStorageNotFound(error: unknown): boolean {
  const { status, statusCode } = (error ?? {}) as { status?: unknown; statusCode?: unknown };
  return status === 404 || String(statusCode) === "404";
}

/**
 * Contenu d'un fichier d'avatar ; null s'il n'existe pas ou n'est pas lisible par ce compte. Toute
 * autre erreur (Storage injoignable…) est levée : l'appelant ne la confond pas avec une absence.
 */
export async function downloadAvatarObject(db: Db, name: string): Promise<Uint8Array | null> {
  const { data, error } = await db.storage.from(AVATARS_BUCKET).download(name);
  if (error) {
    if (isStorageNotFound(error)) return null;
    throw new AvatarStorageError("download");
  }
  if (!data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Noms de tous les fichiers du compte connecté (deux au plus, d'après la politique d'envoi), lus par
 * la base : la liste de l'API Storage montrerait aussi les avatars que le compte vient d'afficher.
 * Base d'avant les avatars (fonction absente, code PGRST202) : aucun fichier.
 */
export async function listOwnAvatarObjects(db: Db): Promise<string[]> {
  const { data, error } = await db.rpc("my_avatar_files");
  if (error) {
    if (error.code === "PGRST202") return [];
    throw new AvatarStorageError("list");
  }
  return (data ?? []).filter((name): name is string => typeof name === "string");
}

/** Autorisation d'afficher l'avatar d'un autre membre, du compte connecté (droit d'accès). */
export type OwnAvatarReadGrant = { avatarId: string; expiresAt: string };

/**
 * Autorisations d'affichage d'avatars du compte connecté (my_avatar_read_grants), pour « Télécharger
 * mes données ». Base d'avant les avatars (fonction absente, PGRST202) : aucune. Toute autre erreur
 * est levée.
 */
export async function listOwnAvatarReadGrants(db: Db): Promise<OwnAvatarReadGrant[]> {
  const { data, error } = await db.rpc("my_avatar_read_grants");
  if (error) {
    if (error.code === "PGRST202") return [];
    fail(error);
  }
  return (data ?? []).map((row) => ({ avatarId: row.avatar_id, expiresAt: row.expires_at }));
}

/** Jeton d'envoi d'avatar du compte connecté (nom du fichier attendu, échéance). */
export type OwnAvatarUploadTicket = { avatarId: string; expiresAt: string };

/**
 * Jeton d'envoi d'avatar du compte connecté (my_avatar_upload_ticket), pour « Télécharger mes
 * données » ; null s'il n'en a pas. Base d'avant les avatars (PGRST202) : aucun. Toute autre erreur
 * est levée.
 */
export async function getOwnAvatarUploadTicket(db: Db): Promise<OwnAvatarUploadTicket | null> {
  const { data, error } = await db.rpc("my_avatar_upload_ticket");
  if (error) {
    if (error.code === "PGRST202") return null;
    fail(error);
  }
  const [row] = data ?? [];
  return row ? { avatarId: row.avatar_id, expiresAt: row.expires_at } : null;
}

/**
 * Supprime les fichiers `names` par l'API Storage et renvoie les fichiers du compte qui restent,
 * relus par la base. L'API ignore SANS erreur un fichier que la politique refuse d'effacer (avatar
 * actuel) : seule cette relecture dit ce qui a vraiment été supprimé.
 */
async function removeAndList(db: Db, names: readonly string[]): Promise<string[]> {
  if (names.length > 0) {
    const { error } = await db.storage.from(AVATARS_BUCKET).remove([...names]);
    if (error) throw new AvatarStorageError("remove");
  }
  return listOwnAvatarObjects(db);
}

/** Supprime les fichiers `names` du compte ; erreur si l'un d'eux est encore là ensuite. */
export async function removeAvatarObjects(db: Db, names: readonly string[]): Promise<void> {
  if (names.length === 0) return;
  const remaining = await removeAndList(db, names);
  if (names.some((name) => remaining.includes(name))) throw new AvatarStorageError("remove");
}

/**
 * Supprime l'avatar du compte connecté et tous ses fichiers (suppression du profil ou du compte) :
 * l'avatar est d'abord retiré du profil (la politique de Storage interdit de supprimer l'avatar
 * actuel) et le jeton d'envoi annulé (plus aucun envoi ne peut aboutir), puis chaque fichier du compte est
 * supprimé par l'API Storage, seule à effacer aussi le fichier lui-même. S'il reste un fichier
 * ensuite (envoi terminé entre-temps dans un autre onglet…), erreur : l'appelant ne supprime rien
 * d'autre. Sans profil, il n'y a rien à retirer ; base d'avant les profils (fonction absente, code
 * PGRST202) : aucun avatar n'a pu être envoyé, rien à faire.
 */
export async function removeAllAvatars(db: Db): Promise<void> {
  const { error } = await db.rpc("set_profile_avatar", { p_avatar: null });
  if (error) {
    if (error.code === "PGRST202") return;
    const kind = classifyProfileError(error);
    if (kind !== "missing") fail(error);
  }
  await cancelAvatarUpload(db);
  const remaining = await removeAndList(db, await listOwnAvatarObjects(db));
  if (remaining.length > 0) throw new AvatarStorageError("remove");
}
