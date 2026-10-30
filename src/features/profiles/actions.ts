"use server";

// Server Actions de « Mon profil » (mode compte seulement) : créer ou modifier son profil, changer ou
// retirer son avatar, supprimer son profil.
//
// Chacune : limite par IP avant tout appel à Supabase, session vérifiée auprès de l'API Auth
// (getUser, jamais getSession), compte attendu par la page (champ `account` : si un autre compte a
// été ouvert dans un autre onglet, rien n'est écrit), entrées revalidées (zod, signature de l'image),
// erreurs génériques. La base applique en plus ses politiques RLS, ses contraintes et ses limites par
// compte. Protection CSRF : voir src/features/account/actions.ts.
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { RATE_LIMITED } from "@/features/auth/messages";
import {
  checkAccountAttempt,
  checkAttempt,
  clientIp,
  trustedProxyHops,
  type AuthAttempt,
} from "@/features/auth/rateLimit";
import * as data from "@/lib/supabase/profiles";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import { checkActiveUser } from "@/lib/supabase/user";
import { AVATAR_CONTENT_TYPE, AVATAR_INPUT_MAX_BYTES, reencodeAvatar } from "./avatarImage";
import {
  invalidProfile,
  profileError,
  profileSuccess,
  textField,
  type ProfileFormState,
} from "./formState";
import {
  AVATAR_BAD_TYPE,
  AVATAR_FILES_REMOVED,
  AVATAR_RATE_LIMITED,
  AVATAR_REMOVE_INCOMPLETE,
  AVATAR_REMOVED,
  AVATAR_REQUIRED,
  AVATAR_SAVED,
  AVATAR_TOO_LARGE,
  AVATAR_UNAVAILABLE,
  AVATAR_UNREADABLE,
  HANDLE_INVALID,
  HANDLE_RESERVED,
  HANDLE_TAKEN,
  PROFILE_CREATED,
  PROFILE_DELETED,
  PROFILE_EXISTS,
  PROFILE_MISSING,
  PROFILE_RATE_LIMITED,
  PROFILE_SAVED,
  PROFILE_SESSION_CHANGED,
  PROFILE_SESSION_ENDED,
  PROFILE_UNAVAILABLE,
} from "./messages";
import { profileSchema } from "./schemas";

type Session = { db: ServerSupabaseClient; userId: string };
type Run = (session: Session) => Promise<ProfileFormState>;

/**
 * Exécute `run` pour le compte connecté, s'il est bien celui attendu par la page. `attempt` : limite
 * par IP appliquée d'abord (et par compte pour l'envoi d'un avatar).
 */
async function asProfileOwner(formData: FormData, attempt: AuthAttempt, run: Run): Promise<ProfileFormState> {
  if (checkAttempt(attempt, clientIp(await headers(), trustedProxyHops())) !== "allowed") {
    return profileError(RATE_LIMITED);
  }
  const check = await checkActiveUser();
  if (check.status === "unavailable") return profileError(PROFILE_UNAVAILABLE);
  if (check.status === "signed-out") return profileError(PROFILE_SESSION_ENDED);
  if (textField(formData, "account") !== check.user.id) return profileError(PROFILE_SESSION_CHANGED);
  if (attempt === "avatarUpload" && !checkAccountAttempt("avatarUpload", check.user.id)) {
    return profileError(AVATAR_RATE_LIMITED);
  }
  const db = await createClient();
  if (!db) return profileError(PROFILE_SESSION_ENDED);
  try {
    return await run({ db, userId: check.user.id });
  } catch (error) {
    return failureState(error);
  }
}

/** Message d'une erreur des données (déjà classée), sans jamais renvoyer l'erreur brute. */
function failureState(error: unknown): ProfileFormState {
  if (!(error instanceof data.ProfileDataError)) {
    if (!(error instanceof data.AvatarStorageError)) console.error("[profiles] Erreur inattendue.");
    return profileError(PROFILE_UNAVAILABLE);
  }
  switch (error.kind) {
    case "handle-taken":
      return profileError(HANDLE_TAKEN, { handle: HANDLE_TAKEN });
    case "handle-invalid":
      return profileError(HANDLE_INVALID, { handle: HANDLE_INVALID });
    case "handle-reserved":
      return profileError(HANDLE_RESERVED, { handle: HANDLE_RESERVED });
    case "exists":
      return profileError(PROFILE_EXISTS);
    case "missing":
      return profileError(PROFILE_MISSING);
    case "rate-limited":
      return profileError(PROFILE_RATE_LIMITED);
    case "unauthorized":
      return profileError(PROFILE_SESSION_ENDED);
    default:
      return profileError(PROFILE_UNAVAILABLE);
  }
}

/**
 * Crée (`mode` = « create », depuis le formulaire de création : jamais de création silencieuse) ou
 * modifie (`mode` = « update ») le profil du compte connecté.
 */
export async function saveProfile(_previous: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const parsed = profileSchema.safeParse({
    handle: textField(formData, "handle"),
    displayName: textField(formData, "displayName"),
    bio: textField(formData, "bio"),
    visibility: textField(formData, "visibility"),
  });
  if (!parsed.success) return invalidProfile(parsed.error);
  const creating = textField(formData, "mode") === "create";

  return asProfileOwner(formData, "profileWrite", async ({ db }) => {
    if (creating) {
      await data.createProfile(db, parsed.data);
    } else if (!(await data.updateProfile(db, parsed.data))) {
      return profileError(PROFILE_MISSING);
    }
    refresh();
    return profileSuccess(creating ? PROFILE_CREATED : PROFILE_SAVED);
  });
}

/** Ses fichiers autres que l'avatar actuel (envoi précédent interrompu) : supprimés au mieux. */
async function removeLeftovers(db: ServerSupabaseClient, currentAvatar: string | null) {
  try {
    await data.removeAvatarObjects(db, (await data.listOwnAvatarObjects(db)).filter((name) => name !== currentAvatar));
  } catch {
    // Sans effet sur l'envoi : au pire, la base refuse un troisième fichier (« indisponible »).
  }
}

/**
 * Supprime un fichier d'avatar devenu inutile (`cancelTicket` : celui de l'envoi en cours, dont le
 * jeton est d'abord annulé) ; un échec laisse un fichier orphelin, effacé au prochain envoi ou
 * retrait d'avatar (ou avec le profil), et que /profil propose d'effacer.
 */
async function removeQuietly(db: ServerSupabaseClient, name: string, cancelTicket = false) {
  try {
    if (cancelTicket) await data.cancelAvatarUpload(db);
    await data.removeAvatarObjects(db, [name]);
  } catch {
    console.error("[profiles] Ancien avatar non supprimé (effacé au prochain envoi ou retrait).");
  }
}

/** Lit le fichier envoyé (champ « avatar ») après avoir vérifié sa taille ; null si absent. */
async function readUpload(formData: FormData): Promise<Uint8Array | "too-large" | null> {
  const file = formData.get("avatar");
  if (!(file instanceof Blob) || file.size === 0) return null;
  if (file.size > AVATAR_INPUT_MAX_BYTES) return "too-large";
  return new Uint8Array(await file.arrayBuffer());
}

const ENCODING_ERRORS = {
  "too-large": AVATAR_TOO_LARGE,
  "bad-type": AVATAR_BAD_TYPE,
  unreadable: AVATAR_UNREADABLE,
  unavailable: AVATAR_UNAVAILABLE,
} as const;

/**
 * Change l'avatar : image vérifiée et ré-encodée (avatarImage.ts), jeton d'envoi demandé à la base
 * (30 par jour et par compte ; il donne le nom du fichier, un uuid aléatoire sans l'identifiant du
 * compte), fichier envoyé sous ce nom, désigné dans le profil, puis l'ancien fichier est supprimé.
 */
export async function uploadAvatar(_previous: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  return asProfileOwner(formData, "avatarUpload", async ({ db, userId }) => {
    const upload = await readUpload(formData);
    if (upload === null) return profileError(AVATAR_REQUIRED, { avatar: AVATAR_REQUIRED });
    if (upload === "too-large") return profileError(AVATAR_TOO_LARGE, { avatar: AVATAR_TOO_LARGE });
    const encoded = await reencodeAvatar(upload);
    if (!encoded.ok) {
      const message = ENCODING_ERRORS[encoded.error];
      return profileError(message, encoded.error === "unavailable" ? {} : { avatar: message });
    }

    const profile = await data.getOwnProfile(db, userId);
    if (!profile) return profileError(PROFILE_MISSING);
    let avatarId: string;
    try {
      avatarId = await data.openAvatarUpload(db);
    } catch (error) {
      if (error instanceof data.ProfileDataError && error.kind === "rate-limited") return profileError(AVATAR_RATE_LIMITED);
      throw error;
    }
    // Le nouveau jeton remplace celui d'un envoi précédent interrompu : ses restes peuvent s'effacer.
    await removeLeftovers(db, profile.avatarId);

    try {
      await data.uploadAvatarObject(db, avatarId, encoded.bytes, AVATAR_CONTENT_TYPE);
    } catch (error) {
      // Refus de Storage (jeton échu ou remplacé par un envoi dans un autre onglet…) ou panne.
      if (error instanceof data.AvatarStorageError) return profileError(AVATAR_UNAVAILABLE);
      throw error;
    }
    let previous: string | null;
    try {
      previous = await data.setProfileAvatar(db, avatarId);
    } catch (error) {
      await removeQuietly(db, avatarId, true);
      if (error instanceof data.ProfileDataError && error.kind === "rate-limited") return profileError(AVATAR_RATE_LIMITED);
      throw error;
    }
    if (previous) await removeQuietly(db, previous);
    refresh();
    return profileSuccess(AVATAR_SAVED);
  });
}

/**
 * Retire l'avatar du profil, annule le jeton d'envoi, puis efface TOUS les fichiers du compte dans le
 * compartiment : l'ancien avatar, et tout fichier resté d'un envoi ou d'un effacement précédent qui a
 * échoué. Si Storage échoue ou laisse un fichier, l'avatar reste retiré et la personne en est
 * informée ; la page /profil propose de réessayer tant qu'il reste un fichier (« Effacer les
 * fichiers de l'avatar »).
 */
export async function removeAvatar(_previous: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  return asProfileOwner(formData, "profileWrite", async ({ db }) => {
    const previous = await data.setProfileAvatar(db, null);
    refresh();
    try {
      await data.cancelAvatarUpload(db);
      await data.removeAvatarObjects(db, await data.listOwnAvatarObjects(db));
    } catch {
      console.error("[profiles] Fichiers de l'avatar non effacés.");
      return profileError(AVATAR_REMOVE_INCOMPLETE);
    }
    return profileSuccess(previous ? AVATAR_REMOVED : AVATAR_FILES_REMOVED);
  });
}

/** Supprime le profil et tous les fichiers de son avatar (le compte et ses cartes restent). */
export async function deleteMyProfile(_previous: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  return asProfileOwner(formData, "profileWrite", async ({ db, userId }) => {
    // Avatar d'abord : un fichier ne doit pas survivre au profil.
    await data.removeAllAvatars(db);
    await data.deleteProfile(db, userId);
    refresh();
    return profileSuccess(PROFILE_DELETED);
  });
}
