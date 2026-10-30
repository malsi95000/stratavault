// Accès aux profils et aux avatars (profiles.ts) : colonnes lues, filtre user_id, classement des
// erreurs, jeton d'envoi, suppression des avatars (ordre imposé par la politique de Storage, et
// vérification qu'aucun fichier ne reste).
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AvatarStorageError,
  ProfileDataError,
  cancelAvatarUpload,
  classifyProfileError,
  createProfile,
  downloadAvatarObject,
  findProfile,
  getOwnAvatarUploadTicket,
  getOwnProfile,
  listOwnAvatarObjects,
  listOwnAvatarReadGrants,
  openAvatarRead,
  openAvatarUpload,
  removeAllAvatars,
  removeAvatarObjects,
  updateProfile,
} from "./profiles";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Result = { data: unknown; error: { code?: string; message?: string } | null };

const state = vi.hoisted(() => ({
  queries: [] as { table: string; columns: string; filters: [string, unknown][] }[],
  next: { data: null, error: null } as Result,
  rpc: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  order: [] as string[],
  /** Fichiers du compte dans le compartiment (my_avatar_files) ; `remove` les efface. */
  files: [] as string[],
}));

/**
 * Suppression par l'API Storage : efface les fichiers demandés, sauf `refused`, qu'elle ignore SANS
 * erreur (comme un fichier que la politique refuse d'effacer).
 */
function storageRemoves(...refused: string[]) {
  state.remove.mockImplementation(async (names: string[]) => {
    state.order.push("remove");
    const removed = names.filter((name) => state.files.includes(name) && !refused.includes(name));
    state.files = state.files.filter((name) => !removed.includes(name));
    return { data: removed.map((name) => ({ name })), error: null };
  });
}

const client = {
  from(table: string) {
    const query = { table, columns: "", filters: [] as [string, unknown][] };
    state.queries.push(query);
    const builder = {
      select: (columns: string) => ((query.columns = columns), builder),
      eq: (column: string, value: unknown) => (query.filters.push([column, value]), builder),
      maybeSingle: async () => state.next,
    };
    return builder;
  },
  rpc: state.rpc,
  storage: { from: () => ({ download: state.download, remove: state.remove }) },
} as never;

beforeEach(() => {
  state.queries.length = 0;
  state.order.length = 0;
  state.next = { data: null, error: null };
  state.rpc.mockReset();
  state.download.mockReset();
  state.remove.mockReset();
  state.files = ["f1", "f2"];
  state.rpc.mockImplementation(async (fn: string) => {
    state.order.push(fn);
    return fn === "my_avatar_files" ? { data: [...state.files], error: null } : { data: null, error: null };
  });
  storageRemoves();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("classifyProfileError", () => {
  it("classe les erreurs de la base sans jamais garder le message", () => {
    expect(classifyProfileError({ code: "23505", message: 'duplicate key value violates unique constraint "profiles_handle_key"' })).toBe("handle-taken");
    expect(classifyProfileError({ code: "23505", message: 'duplicate key value violates unique constraint "profiles_pkey"' })).toBe("exists");
    expect(
      classifyProfileError({ code: "23505", message: 'duplicate key value violates unique constraint "profiles_handle_fold_key"' }),
    ).toBe("handle-taken");
    expect(classifyProfileError({ code: "23514", message: 'violates check constraint "profiles_handle_reserved"' })).toBe("handle-reserved");
    expect(classifyProfileError({ code: "23514", message: 'violates check constraint "profiles_handle_format"' })).toBe("handle-invalid");
    expect(classifyProfileError({ code: "23514", message: 'violates check constraint "profiles_bio"' })).toBe("invalid");
    expect(classifyProfileError({ code: "P0001", message: "profiles_rate_limited" })).toBe("rate-limited");
    expect(classifyProfileError({ code: "P0001", message: "profiles_not_found" })).toBe("missing");
    expect(classifyProfileError({ code: "P0001", message: "profiles_exists" })).toBe("exists");
    expect(classifyProfileError({ code: "P0001", message: "profiles_invalid" })).toBe("invalid");
    expect(classifyProfileError({ code: "P0001", message: "autre" })).toBe("unavailable");
    expect(classifyProfileError({ code: "42501" })).toBe("unauthorized");
    expect(classifyProfileError({ code: "PGRST301" })).toBe("unauthorized");
    expect(classifyProfileError({})).toBe("unavailable");
  });
});

describe("lectures", () => {
  it("son profil : sa ligne seulement (filtre user_id en plus de la RLS), colonnes utiles", async () => {
    state.next = {
      data: { handle: "alice", display_name: "Alice", bio: "", visibility: "members", avatar_id: null, handle_changed_at: "h", created_at: "c", updated_at: "u" },
      error: null,
    };
    expect(await getOwnProfile(client, ALICE)).toEqual({
      handle: "alice",
      displayName: "Alice",
      bio: "",
      visibility: "members",
      avatarId: null,
      handleChangedAt: "h",
      createdAt: "c",
      updatedAt: "u",
    });
    expect(state.queries).toEqual([
      {
        table: "profiles",
        columns: "handle, display_name, bio, visibility, avatar_id, handle_changed_at, created_at, updated_at",
        filters: [["user_id", ALICE]],
      },
    ]);
    state.next = { data: null, error: { code: "XX000" } };
    await expect(getOwnProfile(client, ALICE)).rejects.toEqual(new ProfileDataError("unavailable"));
  });

  it("profil d'un membre : par la fonction de la base, identifiant exact", async () => {
    state.rpc.mockResolvedValue({ data: [{ handle: "bob", display_name: "Bob", bio: "b", avatar_id: null, is_self: false }], error: null });
    expect(await findProfile(client, "bob")).toEqual({ handle: "bob", displayName: "Bob", bio: "b", avatarId: null, isSelf: false });
    expect(state.rpc).toHaveBeenCalledWith("profile_by_handle", { p_handle: "bob" });
    state.rpc.mockResolvedValue({ data: [], error: null });
    expect(await findProfile(client, "inconnu")).toBeNull();
  });

  it("ses fichiers : par la fonction de la base (jamais la liste de Storage) ; base sans avatars : aucun", async () => {
    expect(await listOwnAvatarObjects(client)).toEqual(["f1", "f2"]);
    expect(state.rpc).toHaveBeenCalledWith("my_avatar_files");
    state.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await listOwnAvatarObjects(client)).toEqual([]);
    state.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await expect(listOwnAvatarObjects(client)).rejects.toBeInstanceOf(AvatarStorageError);
  });

  it("ses autorisations d'affichage d'avatars : par la fonction de la base ; base sans avatars : aucune", async () => {
    state.rpc.mockResolvedValue({ data: [{ avatar_id: "a1", expires_at: "2026-10-12T08:01:00+00:00" }], error: null });
    expect(await listOwnAvatarReadGrants(client)).toEqual([{ avatarId: "a1", expiresAt: "2026-10-12T08:01:00+00:00" }]);
    expect(state.rpc).toHaveBeenCalledWith("my_avatar_read_grants");
    state.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await listOwnAvatarReadGrants(client)).toEqual([]);
    state.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await expect(listOwnAvatarReadGrants(client)).rejects.toBeInstanceOf(ProfileDataError);
  });

  it("lecture d'un avatar : un booléen de la base, rien d'autre", async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });
    expect(await openAvatarRead(client, "id")).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("open_avatar_read", { p_avatar: "id" });
    state.rpc.mockResolvedValue({ data: false, error: null });
    expect(await openAvatarRead(client, "id")).toBe(false);
    state.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "profiles_rate_limited" } });
    await expect(openAvatarRead(client, "id")).rejects.toEqual(new ProfileDataError("rate-limited"));
  });

  it("téléchargement : fichier absent = null ; toute autre erreur est levée", async () => {
    state.download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2])]), error: null });
    expect(await downloadAvatarObject(client, "id")).toEqual(new Uint8Array([1, 2]));
    state.download.mockResolvedValue({ data: null, error: { status: 400, statusCode: "404", message: "Object not found" } });
    expect(await downloadAvatarObject(client, "id")).toBeNull();
    state.download.mockResolvedValue({ data: null, error: { status: 404 } });
    expect(await downloadAvatarObject(client, "id")).toBeNull();
    state.download.mockResolvedValue({ data: null, error: { status: 503, statusCode: "503" } });
    await expect(downloadAvatarObject(client, "id")).rejects.toThrow(/avatars: download/);
  });
});

describe("écritures du profil", () => {
  const fields = { handle: "alice", displayName: "Alice", bio: "", visibility: "members" as const };
  const args = { p_handle: "alice", p_display_name: "Alice", p_bio: "", p_visibility: "members" };

  it("création et modification par les fonctions de la base", async () => {
    state.rpc.mockResolvedValue({ data: "created", error: null });
    await createProfile(client, fields);
    expect(state.rpc).toHaveBeenLastCalledWith("create_my_profile", args);
    state.rpc.mockResolvedValue({ data: "saved", error: null });
    expect(await updateProfile(client, fields)).toBe(true);
    expect(state.rpc).toHaveBeenLastCalledWith("update_my_profile", args);
    expect(state.queries).toEqual([]);
  });

  it("identifiant pris : réponse de la base (sans erreur) levée comme un refus classé", async () => {
    state.rpc.mockResolvedValue({ data: "handle-taken", error: null });
    await expect(createProfile(client, fields)).rejects.toEqual(new ProfileDataError("handle-taken"));
    await expect(updateProfile(client, fields)).rejects.toEqual(new ProfileDataError("handle-taken"));
  });

  it("trop de changements de nom affiché : réponse de la base (sans erreur) levée comme un refus classé", async () => {
    state.rpc.mockResolvedValue({ data: "rate-limited", error: null });
    await expect(updateProfile(client, fields)).rejects.toEqual(new ProfileDataError("rate-limited"));
  });

  it("profil absent : false ; réponse inattendue ou erreur : refus classé", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "profiles_not_found" } });
    expect(await updateProfile(client, fields)).toBe(false);
    state.rpc.mockResolvedValue({ data: "autre", error: null });
    await expect(createProfile(client, fields)).rejects.toEqual(new ProfileDataError("unavailable"));
    state.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "profiles_exists" } });
    await expect(createProfile(client, fields)).rejects.toEqual(new ProfileDataError("exists"));
  });
});

describe("jeton d'envoi", () => {
  const NAME = "4ed9fa33-eca3-4272-863a-02329e8692a5";

  it("le nom du fichier vient de la base ; réponse inattendue ou refus : erreur classée", async () => {
    state.rpc.mockResolvedValue({ data: NAME, error: null });
    expect(await openAvatarUpload(client)).toBe(NAME);
    expect(state.rpc).toHaveBeenCalledWith("open_avatar_upload");
    for (const data of [null, "", "x", NAME.toUpperCase(), NAME + "/x", 42]) {
      state.rpc.mockResolvedValue({ data, error: null });
      await expect(openAvatarUpload(client), String(data)).rejects.toEqual(new ProfileDataError("unavailable"));
    }
    state.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "profiles_rate_limited" } });
    await expect(openAvatarUpload(client)).rejects.toEqual(new ProfileDataError("rate-limited"));
    state.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "profiles_not_found" } });
    await expect(openAvatarUpload(client)).rejects.toEqual(new ProfileDataError("missing"));
  });

  it("annulation et relecture (export) par les fonctions de la base ; base sans avatars : rien", async () => {
    await cancelAvatarUpload(client);
    expect(state.rpc).toHaveBeenCalledWith("cancel_avatar_upload");
    state.rpc.mockResolvedValue({ data: [{ avatar_id: NAME, expires_at: "e" }], error: null });
    expect(await getOwnAvatarUploadTicket(client)).toEqual({ avatarId: NAME, expiresAt: "e" });
    expect(state.rpc).toHaveBeenCalledWith("my_avatar_upload_ticket");
    state.rpc.mockResolvedValue({ data: [], error: null });
    expect(await getOwnAvatarUploadTicket(client)).toBeNull();
    state.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await cancelAvatarUpload(client);
    expect(await getOwnAvatarUploadTicket(client)).toBeNull();
    state.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await expect(cancelAvatarUpload(client)).rejects.toBeInstanceOf(ProfileDataError);
    await expect(getOwnAvatarUploadTicket(client)).rejects.toBeInstanceOf(ProfileDataError);
  });
});

describe("removeAvatarObjects", () => {
  it("supprime par l'API Storage, puis vérifie par la base que les fichiers ont disparu", async () => {
    await removeAvatarObjects(client, ["f1"]);
    expect(state.order).toEqual(["remove", "my_avatar_files"]);
    expect(state.files).toEqual(["f2"]);
    state.order.length = 0;
    await removeAvatarObjects(client, []);
    expect(state.order).toEqual([]);
  });

  it("fichier ignoré sans erreur par l'API Storage (refusé par la politique) : erreur", async () => {
    storageRemoves("f2");
    await expect(removeAvatarObjects(client, ["f1", "f2"])).rejects.toThrow(/avatars: remove/);
    expect(state.files).toEqual(["f2"]);
    // Réponse vide, sans erreur, alors que le fichier est toujours là.
    state.remove.mockResolvedValue({ data: [], error: null });
    await expect(removeAvatarObjects(client, ["f2"])).rejects.toThrow(/avatars: remove/);
  });
});

describe("removeAllAvatars", () => {
  it("retire l'avatar du profil, annule le jeton d'envoi, supprime chaque fichier, puis vérifie", async () => {
    await removeAllAvatars(client);
    expect(state.rpc).toHaveBeenCalledWith("set_profile_avatar", { p_avatar: null });
    expect(state.order).toEqual(["set_profile_avatar", "cancel_avatar_upload", "my_avatar_files", "remove", "my_avatar_files"]);
    expect(state.remove).toHaveBeenCalledWith(["f1", "f2"]);
    expect(state.files).toEqual([]);
  });

  it("un fichier reste (ignoré en silence par l'API Storage, ou envoyé entre-temps) : erreur", async () => {
    // Avatar redevenu actuel par un envoi terminé dans un autre onglet : la politique refuse de
    // l'effacer, et l'API Storage ne le signale pas.
    storageRemoves("f2");
    await expect(removeAllAvatars(client)).rejects.toThrow(/avatars: remove/);
    state.files = ["f1"];
    state.remove.mockImplementation(async () => {
      state.files = ["f3"];
      return { data: [{ name: "f1" }], error: null };
    });
    await expect(removeAllAvatars(client)).rejects.toThrow(/avatars: remove/);
  });

  it("sans profil : supprime quand même les fichiers restants ; base sans profils : rien à faire", async () => {
    state.files = ["f1"];
    state.rpc.mockImplementation(async (fn: string) => {
      if (fn === "my_avatar_files") return { data: [...state.files], error: null };
      if (fn === "set_profile_avatar") return { data: null, error: { code: "P0001", message: "profiles_not_found" } };
      return { data: null, error: null };
    });
    await removeAllAvatars(client);
    expect(state.rpc).toHaveBeenCalledWith("cancel_avatar_upload");
    expect(state.remove).toHaveBeenCalledWith(["f1"]);
    state.remove.mockClear();
    state.rpc.mockReset();
    state.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    await removeAllAvatars(client);
    expect(state.rpc).toHaveBeenCalledOnce();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("échec de la base ou de Storage : erreur (l'appelant ne supprime rien d'autre)", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await expect(removeAllAvatars(client)).rejects.toBeInstanceOf(ProfileDataError);
    state.rpc.mockResolvedValue({ data: null, error: null });
    state.remove.mockResolvedValue({ data: null, error: { message: "storage" } });
    state.rpc.mockImplementation(async (fn: string) => (fn === "my_avatar_files" ? { data: ["f1"], error: null } : { data: null, error: null }));
    await expect(removeAllAvatars(client)).rejects.toThrow(/avatars: remove/);
    // Jeton impossible à annuler : erreur, aucun fichier supprimé.
    state.remove.mockClear();
    state.rpc.mockImplementation(async (fn: string) =>
      fn === "cancel_avatar_upload" ? { data: null, error: { code: "XX000" } } : { data: null, error: null },
    );
    await expect(removeAllAvatars(client)).rejects.toBeInstanceOf(ProfileDataError);
    expect(state.remove).not.toHaveBeenCalled();
  });
});
