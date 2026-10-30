// Server Actions de « Mon profil » (actions.ts) : session vérifiée, compte attendu, validation,
// limites, classement des erreurs, enchaînement de l'envoi d'un avatar. Les accès aux données
// (src/lib/supabase/profiles.ts, testés à part) sont simulés ; l'image est ré-encodée par le vrai sharp.
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITED } from "@/features/auth/messages";
import { resetAuthRateLimits } from "@/features/auth/rateLimit";
import { deleteMyProfile, removeAvatar, saveProfile, uploadAvatar } from "./actions";
import { INITIAL_PROFILE_STATE } from "./formState";
import {
  AVATAR_BAD_TYPE,
  AVATAR_FILES_REMOVED,
  AVATAR_RATE_LIMITED,
  AVATAR_REMOVE_INCOMPLETE,
  AVATAR_REMOVED,
  AVATAR_SAVED,
  AVATAR_UNAVAILABLE,
  HANDLE_RESERVED,
  HANDLE_TAKEN,
  PROFILE_CREATED,
  PROFILE_DELETED,
  PROFILE_MISSING,
  PROFILE_SAVED,
  PROFILE_SESSION_CHANGED,
  PROFILE_SESSION_ENDED,
  PROFILE_UNAVAILABLE,
} from "./messages";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OLD = "99999999-9999-4999-8999-999999999999";
/** Nom du fichier tiré par la base avec le jeton d'envoi. */
const NEW = "4ed9fa33-eca3-4272-863a-02329e8692a5";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  calls: [] as string[],
  data: {} as Record<string, (...args: unknown[]) => unknown>,
  client: { marker: "client de la session" },
  ip: { value: "203.0.113.9" },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ ...mocks.client, auth: { getUser: mocks.getUser } }),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": mocks.ip.value }) }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

vi.mock("@/lib/supabase/profiles", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase/profiles")>();
  const names = [
    "createProfile",
    "updateProfile",
    "deleteProfile",
    "getOwnProfile",
    "setProfileAvatar",
    "openAvatarUpload",
    "cancelAvatarUpload",
    "uploadAvatarObject",
    "listOwnAvatarObjects",
    "removeAvatarObjects",
    "removeAllAvatars",
  ] as const;
  const fakes = Object.fromEntries(
    names.map((name) => [
      name,
      vi.fn(async (...args: unknown[]) => {
        mocks.calls.push(name);
        return mocks.data[`${name}Result`]?.(...args);
      }),
    ]),
  );
  Object.assign(mocks.data, fakes);
  return { ...original, ...fakes };
});

const { AvatarStorageError, ProfileDataError } = await import("@/lib/supabase/profiles");

const form = (fields: Record<string, string | Blob>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries({ account: ALICE, ...fields })) data.append(name, value);
  return data;
};
const profileFields = { handle: "Alice", displayName: "Alice", bio: "", visibility: "members" };
const fake = (name: string) => mocks.data[name] as ReturnType<typeof vi.fn>;
const returns = (name: string, value: (...args: unknown[]) => unknown) => {
  mocks.data[`${name}Result`] = vi.fn(value);
};
const pngFile = async () =>
  new File(
    [new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: "#123456" } }).png().toBuffer())],
    "photo.png",
    { type: "image/png" },
  );

beforeEach(() => {
  resetAuthRateLimits();
  mocks.ip.value = "203.0.113.9";
  mocks.calls.length = 0;
  for (const key of Object.keys(mocks.data)) if (key.endsWith("Result")) delete mocks.data[key];
  for (const fn of Object.values(mocks.data)) (fn as ReturnType<typeof vi.fn>).mockClear();
  mocks.getUser.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: ALICE, email: "a@exemple.fr" } }, error: null });
  returns("getOwnProfile", () => ({ handle: "alice", avatarId: OLD }));
  returns("updateProfile", () => true);
  returns("listOwnAvatarObjects", () => [OLD]);
  returns("setProfileAvatar", () => OLD);
  returns("openAvatarUpload", () => NEW);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("saveProfile", () => {
  it("crée le profil seulement depuis le formulaire de création, avec les valeurs normalisées", async () => {
    expect(await saveProfile(INITIAL_PROFILE_STATE, form({ ...profileFields, mode: "create" }))).toMatchObject({
      status: "success",
      message: PROFILE_CREATED,
    });
    expect(fake("createProfile")).toHaveBeenCalledWith(expect.objectContaining({ marker: "client de la session" }), {
      handle: "alice",
      displayName: "Alice",
      bio: "",
      visibility: "members",
    });
    expect(fake("updateProfile")).not.toHaveBeenCalled();
    // Sans « create » : modification du profil existant, jamais de création.
    expect(await saveProfile(INITIAL_PROFILE_STATE, form(profileFields))).toMatchObject({ message: PROFILE_SAVED });
    expect(fake("updateProfile")).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ handle: "alice" }));
    expect(fake("createProfile")).toHaveBeenCalledTimes(1);
    returns("updateProfile", () => false);
    expect(await saveProfile(INITIAL_PROFILE_STATE, form(profileFields))).toMatchObject({ message: PROFILE_MISSING });
  });

  it("revalide les champs sans rien demander à Supabase", async () => {
    const state = await saveProfile(INITIAL_PROFILE_STATE, form({ ...profileFields, handle: "admin" }));
    expect(state.fieldErrors).toEqual({ handle: HANDLE_RESERVED });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("session terminée, injoignable, ou autre compte que celui de la page : rien n'est écrit", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await saveProfile(INITIAL_PROFILE_STATE, form(profileFields))).toMatchObject({ message: PROFILE_SESSION_ENDED });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    expect(await saveProfile(INITIAL_PROFILE_STATE, form(profileFields))).toMatchObject({ message: PROFILE_UNAVAILABLE });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }, error: null });
    expect(await saveProfile(INITIAL_PROFILE_STATE, form(profileFields))).toMatchObject({ message: PROFILE_SESSION_CHANGED });
    expect(mocks.calls).toEqual([]);
  });

  it("identifiant déjà pris : message sous le champ ; erreur inattendue : message générique", async () => {
    returns("updateProfile", () => {
      throw new ProfileDataError("handle-taken");
    });
    expect(await saveProfile(INITIAL_PROFILE_STATE, form(profileFields))).toMatchObject({
      message: HANDLE_TAKEN,
      fieldErrors: { handle: HANDLE_TAKEN },
    });
    returns("updateProfile", () => {
      throw new Error("brut");
    });
    expect(await saveProfile(INITIAL_PROFILE_STATE, form(profileFields))).toMatchObject({ message: PROFILE_UNAVAILABLE });
  });

  it("limite par IP avant tout appel à Supabase", async () => {
    for (let i = 0; i < 30; i += 1) await saveProfile(INITIAL_PROFILE_STATE, form(profileFields));
    mocks.getUser.mockClear();
    expect(await saveProfile(INITIAL_PROFILE_STATE, form(profileFields))).toMatchObject({ message: RATE_LIMITED });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

describe("uploadAvatar", () => {
  it("ré-encode, demande un jeton, envoie sous le nom donné par la base, désigne l'avatar, puis supprime l'ancien", async () => {
    returns("listOwnAvatarObjects", () => [OLD, "88888888-8888-4888-8888-888888888888"]);
    expect(await uploadAvatar(INITIAL_PROFILE_STATE, form({ avatar: await pngFile() }))).toMatchObject({
      status: "success",
      message: AVATAR_SAVED,
    });
    expect(mocks.calls).toEqual([
      "getOwnProfile",
      "openAvatarUpload",
      "listOwnAvatarObjects",
      "removeAvatarObjects",
      "uploadAvatarObject",
      "setProfileAvatar",
      "removeAvatarObjects",
    ]);
    // Reste d'un envoi interrompu supprimé ; l'avatar actuel gardé jusqu'au changement.
    expect(fake("removeAvatarObjects").mock.calls[0][1]).toEqual(["88888888-8888-4888-8888-888888888888"]);
    const [, name, bytes, type] = fake("uploadAvatarObject").mock.calls[0] as [unknown, string, Uint8Array, string];
    // Nom du fichier : celui du jeton, tiré au hasard par la base (jamais l'identifiant du compte).
    expect(name).toBe(NEW);
    expect(type).toBe("image/webp");
    expect((await sharp(bytes).metadata()).format).toBe("webp");
    expect(fake("setProfileAvatar").mock.calls[0][1]).toBe(name);
    expect(fake("removeAvatarObjects").mock.calls[1][1]).toEqual([OLD]);
  });

  it("refuse un fichier qui n'est pas une image PNG, JPEG ou WebP, sans rien envoyer", async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>'], "a.png", { type: "image/png" });
    expect(await uploadAvatar(INITIAL_PROFILE_STATE, form({ avatar: svg }))).toMatchObject({
      fieldErrors: { avatar: AVATAR_BAD_TYPE },
    });
    expect(mocks.calls).toEqual([]);
  });

  it("changement refusé par la base : jeton annulé, puis le fichier envoyé est supprimé", async () => {
    returns("setProfileAvatar", () => {
      throw new ProfileDataError("rate-limited");
    });
    expect(await uploadAvatar(INITIAL_PROFILE_STATE, form({ avatar: await pngFile() }))).toMatchObject({
      message: AVATAR_RATE_LIMITED,
    });
    expect(mocks.calls.slice(-3)).toEqual(["setProfileAvatar", "cancelAvatarUpload", "removeAvatarObjects"]);
    expect(fake("removeAvatarObjects").mock.calls.at(-1)?.[1]).toEqual([NEW]);
  });

  it("jeton refusé par la base (30 envois par jour) : rien n'est envoyé", async () => {
    returns("openAvatarUpload", () => {
      throw new ProfileDataError("rate-limited");
    });
    expect(await uploadAvatar(INITIAL_PROFILE_STATE, form({ avatar: await pngFile() }))).toMatchObject({
      status: "error",
      message: AVATAR_RATE_LIMITED,
    });
    expect(mocks.calls).toEqual(["getOwnProfile", "openAvatarUpload"]);
    returns("openAvatarUpload", () => {
      throw new ProfileDataError("missing");
    });
    expect(await uploadAvatar(INITIAL_PROFILE_STATE, form({ avatar: await pngFile() }))).toMatchObject({
      message: PROFILE_MISSING,
    });
    expect(fake("uploadAvatarObject")).not.toHaveBeenCalled();
  });

  it("envoi refusé par Storage (jeton échu ou remplacé, panne) : message de l'avatar, profil inchangé", async () => {
    returns("uploadAvatarObject", () => {
      throw new AvatarStorageError("upload");
    });
    expect(await uploadAvatar(INITIAL_PROFILE_STATE, form({ avatar: await pngFile() }))).toMatchObject({
      status: "error",
      message: AVATAR_UNAVAILABLE,
    });
    expect(fake("setProfileAvatar")).not.toHaveBeenCalled();
  });

  it("sans profil : rien n'est envoyé", async () => {
    returns("getOwnProfile", () => null);
    expect(await uploadAvatar(INITIAL_PROFILE_STATE, form({ avatar: await pngFile() }))).toMatchObject({
      message: PROFILE_MISSING,
    });
    expect(fake("uploadAvatarObject")).not.toHaveBeenCalled();
  });

  it("10 envois par heure et par compte, quelle que soit l'IP", async () => {
    returns("getOwnProfile", () => null);
    for (let i = 0; i < 10; i += 1) {
      mocks.ip.value = `198.51.100.${i}`;
      await uploadAvatar(INITIAL_PROFILE_STATE, form({ avatar: new Blob(["x"]) }));
    }
    mocks.ip.value = "198.51.100.200";
    expect(await uploadAvatar(INITIAL_PROFILE_STATE, form({ avatar: new Blob(["x"]) }))).toMatchObject({
      message: AVATAR_RATE_LIMITED,
    });
  });
});

describe("removeAvatar et deleteMyProfile", () => {
  it("retirer l'avatar : retiré du profil, jeton d'envoi annulé, puis tous les fichiers du compte supprimés", async () => {
    const LEFTOVER = "88888888-8888-4888-8888-888888888888";
    returns("listOwnAvatarObjects", () => [OLD, LEFTOVER]);
    expect(await removeAvatar(INITIAL_PROFILE_STATE, form({}))).toMatchObject({ status: "success", message: AVATAR_REMOVED });
    expect(mocks.calls).toEqual(["setProfileAvatar", "cancelAvatarUpload", "listOwnAvatarObjects", "removeAvatarObjects"]);
    expect(fake("setProfileAvatar").mock.calls[0][1]).toBeNull();
    expect(fake("removeAvatarObjects").mock.calls[0][1]).toEqual([OLD, LEFTOVER]);
  });

  it("effacement du fichier en échec : signalé (jamais « Avatar retiré. »), et un nouvel essai efface les restes", async () => {
    // Storage en panne, ou fichier ignoré sans erreur par Storage (removeAvatarObjects le détecte).
    returns("removeAvatarObjects", () => {
      throw new AvatarStorageError("remove");
    });
    expect(await removeAvatar(INITIAL_PROFILE_STATE, form({}))).toMatchObject({
      status: "error",
      message: AVATAR_REMOVE_INCOMPLETE,
    });
    // Nouvel essai sans avatar : les fichiers restants sont effacés.
    returns("removeAvatarObjects", () => undefined);
    returns("setProfileAvatar", () => null);
    expect(await removeAvatar(INITIAL_PROFILE_STATE, form({}))).toMatchObject({
      status: "success",
      message: AVATAR_FILES_REMOVED,
    });
    expect(fake("removeAvatarObjects").mock.calls.at(-1)?.[1]).toEqual([OLD]);
  });

  it("supprimer le profil : avatars d'abord, puis le profil ; échec de Storage : profil gardé", async () => {
    expect(await deleteMyProfile(INITIAL_PROFILE_STATE, form({}))).toMatchObject({ message: PROFILE_DELETED });
    expect(mocks.calls).toEqual(["removeAllAvatars", "deleteProfile"]);
    mocks.calls.length = 0;
    returns("removeAllAvatars", () => {
      throw new Error("storage");
    });
    expect(await deleteMyProfile(INITIAL_PROFILE_STATE, form({}))).toMatchObject({ message: PROFILE_UNAVAILABLE });
    expect(mocks.calls).toEqual(["removeAllAvatars"]);
  });
});
