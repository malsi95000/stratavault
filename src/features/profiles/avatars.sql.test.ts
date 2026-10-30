// Avatars dans la base (supabase/migrations/20261017120200_avatars.sql), sur un vrai PostgreSQL
// (PGlite) : compartiment privé, politiques de storage.objects (simulé comme chez Supabase,
// src/test/pglite.ts ; les envois et suppressions suivent le chemin de l'API Storage : sonde avec le
// rôle et le jeton du compte, annulée, puis écriture avec le rôle de l'API), jetons d'envoi,
// autorisations de lecture d'une minute, set_profile_avatar, open_avatar_read et my_avatar_files.
// Aucun nom de fichier ne contient l'identifiant d'un compte, et aucun compte ne peut lister les
// avatars des autres.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const A1 = "11111111-1111-4111-8111-111111111111";
const A2 = "22222222-2222-4222-8222-222222222222";
const A3 = "33333333-3333-4333-8333-333333333333";
/** Identifiant avec des lettres (pour les essais en majuscules). */
const HEX = "abcdef12-abcd-4abc-8abc-abcdefabcdef";
/**
 * Refus d'un envoi : par la politique (sonde) ou par le déclencheur de storage.objects, qui s'exécute
 * avant elle et à l'écriture réelle.
 */
const REFUSED = /row-level security|avatars_write_refused/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let t: TestDb;

/** Jeton d'envoi de `userId` pour un nom choisi par le test (open_avatar_upload tire un nom au hasard). */
const giveTicket = (userId: string, name: string, expiresIn = "5 minutes") =>
  t.db.query(
    `insert into public.avatar_upload_tickets (user_id, avatar_id, expires_at) values ($1, $2, now() + $3::interval)
     on conflict (user_id) do update set avatar_id = excluded.avatar_id, expires_at = excluded.expires_at`,
    [userId, name, expiresIn],
  );
const ticketOf = async (userId: string) =>
  (await t.db.query<{ avatar_id: string }>("select avatar_id from public.avatar_upload_tickets where user_id = $1", [userId])).rows;
/** Envoi par l'API Storage, sans jeton fourni par le test. */
const storageUpload = (userId: string | null, name: string, bucket = "avatars") => t.storageUpload(userId, bucket, name);
/**
 * Envoi complet tel que le fait l'application, pour un nom choisi par le test : jeton, envoi par
 * l'API Storage, puis jeton retiré (l'envoi est terminé).
 */
async function upload(userId: string | null, name: string, bucket = "avatars") {
  if (userId) await giveTicket(userId, name);
  try {
    await storageUpload(userId, name, bucket);
  } finally {
    if (userId) await t.db.query("delete from public.avatar_upload_tickets where user_id = $1", [userId]);
  }
}
/** Ce que renvoie la liste de l'API Storage pour ce compte (lignes visibles du compartiment). */
const visibleRows = (userId: string | null) =>
  t.as<{ name: string; owner_id: string }>(userId, "select name, owner_id from storage.objects where bucket_id = 'avatars' order by name");
const visibleNames = async (userId: string | null) => (await visibleRows(userId)).map((r) => r.name);
/** Suppression par l'API Storage : noms effectivement supprimés (les refus sont ignorés sans erreur). */
const remove = (userId: string, ...names: string[]) => t.storageRemove(userId, "avatars", names);
const storedNames = async () =>
  (await t.db.query<{ name: string }>("select name from storage.objects where bucket_id = 'avatars' order by name")).rows.map(
    (r) => r.name,
  );
const setAvatar = (userId: string | null, avatarId: string | null) =>
  t.as<{ previous: string | null }>(userId, "select public.set_profile_avatar($1) as previous", [avatarId]);
const openUpload = async (userId: string | null) =>
  (await t.as<{ name: string }>(userId, "select public.open_avatar_upload() as name"))[0].name;
const cancelUpload = (userId: string | null) => t.as(userId, "select public.cancel_avatar_upload()");
const openRead = async (userId: string | null, avatarId: string) =>
  (await t.as<{ ok: boolean }>(userId, "select public.open_avatar_read($1) as ok", [avatarId]))[0].ok;
const ownFiles = async (userId: string) =>
  (await t.as<{ name: string }>(userId, "select name from public.my_avatar_files() as name")).map((r) => r.name);
const createProfile = (userId: string, handle: string, visibility = "members") =>
  t.as(userId, "select public.create_my_profile($1, 'Nom', '', $2)", [handle, visibility]);
const uploadHits = async (userId: string) =>
  (await t.db.query<{ hits: number }>("select hits from public.rate_limits where user_id = $1 and action = 'avatar_upload'", [userId]))
    .rows[0]?.hits ?? 0;
/** Fichier envoyé puis désigné comme avatar. */
async function withAvatar(userId: string, avatarId: string) {
  await upload(userId, avatarId);
  await setAvatar(userId, avatarId);
}

beforeAll(async () => {
  t = await openTestDb();
  await t.addUsers(ALICE, BOB, CAROL);
  await t.db.exec("insert into storage.buckets (id, name) values ('autre', 'autre')");
}, 60_000);

beforeEach(async () => {
  await t.db.exec(
    "delete from storage.objects; delete from public.avatar_read_grants; delete from public.avatar_upload_tickets; delete from public.profiles; delete from public.rate_limits;",
  );
  await createProfile(ALICE, "alice");
  await createProfile(BOB, "bob");
});

afterAll(async () => {
  await t?.db.close();
});

describe("compartiment « avatars »", () => {
  it("privé, WebP seulement, 100 Ko au plus", async () => {
    const { rows } = await t.db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'");
    expect(rows).toEqual([{ public: false, file_size_limit: 102400, allowed_mime_types: ["image/webp"] }]);
  });
});

describe("politiques de storage.objects", () => {
  it("envoi : nom « <uuid> » exact, fichier à soi, profil existant, deux fichiers au plus", async () => {
    await upload(ALICE, A1);
    expect((await t.db.query("select owner_id from storage.objects where name = $1", [A1])).rows).toEqual([{ owner_id: ALICE }]);
    // Noms refusés (un nom qui n'est pas un uuid ne peut même pas recevoir de jeton).
    const refused = [`${A2}.svg`, `${ALICE}/${A2}`, `x/${A2}`, HEX.toUpperCase(), `../${A2}`, "avatar", ""];
    for (const name of refused) await expect(upload(ALICE, name), name).rejects.toThrow(/row-level security|avatars_write_refused|invalid input syntax/);
    // Un fichier au nom d'un autre propriétaire (owner_id choisi : ancienne API Storage, qui écrivait
    // la ligne avec le rôle du compte) est refusé.
    await giveTicket(ALICE, A2);
    await expect(
      t.as(ALICE, "insert into storage.objects (bucket_id, name, owner_id) values ('avatars', $1, $2)", [A2, BOB]),
    ).rejects.toThrow(REFUSED);
    await upload(ALICE, A2);
    // Troisième fichier : refusé (2 × 100 Ko au plus par compte), même avec un jeton.
    await expect(upload(ALICE, A3)).rejects.toThrow(REFUSED);
    // Sans profil, pas d'envoi ; ni pour un visiteur anonyme, ni dans un autre compartiment.
    await expect(upload(CAROL, A3)).rejects.toThrow(REFUSED);
    await expect(upload(null, A3)).rejects.toThrow(REFUSED);
    await expect(upload(BOB, A3, "autre")).rejects.toThrow(REFUSED);
    expect(await storedNames()).toEqual([A1, A2]);
  });

  it("envoi : seulement avec un jeton en cours pour ce nom, même directement à l'API Storage", async () => {
    await expect(storageUpload(ALICE, A1)).rejects.toThrow(REFUSED);
    // Jeton d'un autre nom, ou échu : refusé.
    await giveTicket(ALICE, A2);
    await expect(storageUpload(ALICE, A1)).rejects.toThrow(REFUSED);
    await giveTicket(ALICE, A1, "-1 second");
    await expect(storageUpload(ALICE, A1)).rejects.toThrow(REFUSED);
    // Le jeton d'Alice ne sert pas à Bob.
    await giveTicket(ALICE, A1);
    await expect(storageUpload(BOB, A1)).rejects.toThrow(REFUSED);
    await storageUpload(ALICE, A1);
    expect(await storedNames()).toEqual([A1]);
  });

  it("un jeton donne au plus un envoi : consommé par l'écriture du fichier, son nom ne sert plus ensuite", async () => {
    const name = await openUpload(ALICE);
    await storageUpload(ALICE, name);
    expect(await ticketOf(ALICE)).toEqual([]);
    await expect(storageUpload(ALICE, name)).rejects.toThrow(REFUSED);
    // Le fichier se supprime, mais son nom ne peut plus servir (pas d'envoi et de suppression en boucle).
    expect(await remove(ALICE, name)).toEqual([name]);
    await expect(storageUpload(ALICE, name)).rejects.toThrow(REFUSED);
    // Jeton annulé ou échu avant l'envoi : refusé.
    const cancelled = await openUpload(ALICE);
    await cancelUpload(ALICE);
    await expect(storageUpload(ALICE, cancelled)).rejects.toThrow(REFUSED);
    const expired = await openUpload(ALICE);
    await t.db.exec("update public.avatar_upload_tickets set expires_at = now() - interval '1 second'");
    await expect(storageUpload(ALICE, expired)).rejects.toThrow(REFUSED);
    expect(await storedNames()).toEqual([]);
    // Une nouvelle demande remplace le jeton précédent.
    const first = await openUpload(ALICE);
    const second = await openUpload(ALICE);
    await expect(storageUpload(ALICE, first)).rejects.toThrow(REFUSED);
    await storageUpload(ALICE, second);
    expect(await storedNames()).toEqual([second]);
  });

  it("30 envois par jour et par compte, même faits directement à l'API Storage (envoi puis suppression en boucle)", async () => {
    // Une demande refusée pour une autre raison (pas de profil) n'entame pas le quota.
    await expect(openUpload(CAROL)).rejects.toThrow(/profiles_not_found/);
    expect(await uploadHits(CAROL)).toBe(0);
    for (let i = 0; i < 30; i += 1) {
      const name = await openUpload(ALICE);
      await storageUpload(ALICE, name);
      await cancelUpload(ALICE);
      expect(await remove(ALICE, name), String(i)).toEqual([name]);
    }
    // Le compteur n'est tenu que par open_avatar_upload : les sondes de l'API Storage (annulées) n'y
    // changent rien.
    expect(await uploadHits(ALICE)).toBe(30);
    await expect(openUpload(ALICE)).rejects.toThrow(/profiles_rate_limited/);
    // Le refus est annulé, compteur compris ; sans nouveau jeton, plus aucun envoi.
    expect(await uploadHits(ALICE)).toBe(30);
    expect(await ticketOf(ALICE)).toEqual([]);
    await expect(storageUpload(ALICE, A1)).rejects.toThrow(REFUSED);
    // Les autres comptes ne sont pas touchés.
    await storageUpload(BOB, await openUpload(BOB));
    // Fenêtre échue : le compteur repart.
    await t.db.query("update public.rate_limits set window_start = now() - interval '2 days' where user_id = $1", [ALICE]);
    await storageUpload(ALICE, await openUpload(ALICE));
    expect(await uploadHits(ALICE)).toBe(1);
  });

  it("aucune modification ni remplacement d'un fichier", async () => {
    await upload(ALICE, A1);
    expect(await t.as(ALICE, "update storage.objects set name = $1 returning 1", [A2])).toEqual([]);
  });
});

describe("écriture réelle par l'API Storage (adresses d'envoi signées, sans politique)", () => {
  const signUpload = (userId: string, name: string, upsert = false) => t.storageSignUpload(userId, "avatars", name, upsert);
  const signedUpload = (owner: string, name: string, upsert = false) =>
    t.storageUploadToSignedUrl(owner, "avatars", name, upsert);
  const versionOf = async (name: string) =>
    (await t.db.query<{ version: string | null }>("select version from storage.objects where name = $1", [name])).rows[0]?.version;

  it("l'adresse signée (x-upsert) ne permet pas de réécrire le fichier, même devenu l'avatar", async () => {
    const name = await openUpload(ALICE);
    await signUpload(ALICE, name, true);
    await signedUpload(ALICE, name, true);
    await setAvatar(ALICE, name);
    const version = await versionOf(name);
    for (let i = 0; i < 3; i += 1) await expect(signedUpload(ALICE, name, true), String(i)).rejects.toThrow(REFUSED);
    expect(await versionOf(name)).toBe(version);
    expect(await storedNames()).toEqual([name]);
  });

  it("plusieurs adresses signées obtenues avant tout envoi : un seul fichier, et deux au plus par compte", async () => {
    const names: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const name = await openUpload(ALICE); // remplace le jeton précédent
      await signUpload(ALICE, name); // la sonde passe : aucun fichier encore
      names.push(name);
    }
    const results = [];
    for (const name of names) results.push(await signedUpload(ALICE, name).then(() => "ok", () => "refusé"));
    // Seul le nom du dernier jeton (en cours) est accepté, et il est alors consommé.
    expect(results).toEqual(["refusé", "refusé", "refusé", "refusé", "ok"]);
    expect(await storedNames()).toEqual([names[4]]);
    await expect(signedUpload(ALICE, names[4])).rejects.toThrow(/avatars_write_refused|unique|duplicate/);
    // Deux fichiers au plus, même avec un jeton en cours et une adresse signée obtenue avant (la
    // sonde passe encore : un seul fichier à ce moment-là).
    const second = await openUpload(ALICE);
    await signUpload(ALICE, second);
    await giveTicket(ALICE, A1);
    await signUpload(ALICE, A1);
    await giveTicket(ALICE, second);
    await signedUpload(ALICE, second);
    await giveTicket(ALICE, A1);
    await expect(signedUpload(ALICE, A1)).rejects.toThrow(/avatars_write_refused/);
    // Le refus annule tout : le jeton reste, aucun fichier de plus.
    expect(await ticketOf(ALICE)).toEqual([{ avatar_id: A1 }]);
    expect(await storedNames()).toEqual([names[4], second].toSorted());
  });

  it("adresse signée obtenue avant la suppression du profil : plus aucun envoi ensuite", async () => {
    const name = await openUpload(ALICE);
    await signUpload(ALICE, name);
    await t.as(ALICE, "select public.cancel_avatar_upload()");
    await t.db.query("delete from public.profiles where user_id = $1", [ALICE]);
    await expect(signedUpload(ALICE, name)).rejects.toThrow(/avatars_write_refused/);
    expect(await storedNames()).toEqual([]);
  });

  it("propriétaire sans profil, inconnu ou mal formé : refusé", async () => {
    await giveTicket(CAROL, A1);
    await expect(signedUpload(CAROL, A1)).rejects.toThrow(/avatars_write_refused/);
    expect(await ticketOf(CAROL)).toEqual([{ avatar_id: A1 }]);
    for (const owner of ["dddddddd-dddd-4ddd-8ddd-dddddddddddd", ALICE.toUpperCase(), "x", ""]) {
      await expect(signedUpload(owner, A2), owner).rejects.toThrow(/avatars_write_refused/);
    }
    await expect(t.db.query("insert into storage.objects (bucket_id, name, owner_id) values ('avatars', $1, null)", [A2])).rejects.toThrow(
      /avatars_write_refused/,
    );
    expect(await storedNames()).toEqual([]);
  });

  it("aucun déplacement, renommage, changement de propriétaire ni nouvelle version, même avec le rôle de l'API", async () => {
    await withAvatar(ALICE, A1);
    await t.db.query("insert into storage.objects (bucket_id, name, owner_id) values ('autre', $1, $2)", [A2, BOB]);
    for (const [sql, params] of [
      ["update storage.objects set name = $1 where name = $2", [A3, A1]],
      ["update storage.objects set owner_id = $1 where name = $2", [BOB, A1]],
      ["update storage.objects set version = 'v2' where name = $1", [A1]],
      ["update storage.objects set bucket_id = 'autre' where name = $1", [A1]],
      ["update storage.objects set bucket_id = 'avatars' where name = $1", [A2]],
    ] as const) {
      await expect(t.db.query(sql, [...params]), sql).rejects.toThrow(/avatars_write_refused/);
    }
    // Les autres colonnes restent modifiables par l'API Storage, et les autres compartiments ne sont pas touchés.
    await t.db.query("update storage.objects set metadata = '{\"size\": 1}'::jsonb where name = $1", [A1]);
    await t.db.query("update storage.objects set name = $1 where name = $2", [A3, A2]);
    expect(await storedNames()).toEqual([A1]);
  });

  it("autres compartiments : aucune règle des avatars", async () => {
    await t.db.query("insert into storage.objects (bucket_id, name, owner_id) values ('autre', 'x/y.png', $1)", [CAROL]);
    expect((await t.db.query("select name from storage.objects where bucket_id = 'autre'")).rows).toEqual([{ name: "x/y.png" }]);
  });

  it("le déclencheur : SECURITY DEFINER, search_path vide, appelable par personne", async () => {
    const { rows } = await t.db.query<{ secdef: boolean; config: string[]; anon: boolean; auth: boolean }>(
      `select p.prosecdef as secdef, p.proconfig as config,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth
       from pg_proc as p where p.proname = 'avatars_guard_write'`,
    );
    expect(rows).toEqual([{ secdef: true, config: ['search_path=""'], anon: false, auth: false }]);
    const triggers = await t.db.query<{ tgname: string }>(
      "select tgname from pg_trigger where tgrelid = 'storage.objects'::regclass and not tgisinternal order by tgname",
    );
    expect(triggers.rows.map((r) => r.tgname)).toEqual(["avatars_guard_insert", "avatars_guard_update"]);
  });

  it("liste du compartiment : ses fichiers seulement, jamais l'identifiant d'un autre compte", async () => {
    await withAvatar(ALICE, A1);
    await upload(BOB, A2);
    await upload(BOB, A3);
    await setAvatar(BOB, A3);
    // Bob et Alice ont des profils « members » avec avatar : aucun ne voit les fichiers de l'autre.
    expect(await visibleNames(BOB)).toEqual([A2, A3]);
    expect(await visibleNames(ALICE)).toEqual([A1]);
    expect(await visibleNames(CAROL)).toEqual([]);
    expect(await visibleNames(null)).toEqual([]);
    expect(JSON.stringify(await visibleRows(BOB))).not.toContain(ALICE);
  });

  it("lecture de l'avatar d'un autre : seulement après open_avatar_read, l'avatar actuel, pendant une minute", async () => {
    await upload(BOB, A1);
    await upload(BOB, A2);
    await setAvatar(BOB, A2);
    // Bob ne peut pas ouvrir un fichier qui n'est pas son avatar actuel pour Alice.
    expect(await openRead(ALICE, A1)).toBe(false);
    expect(await visibleNames(ALICE)).toEqual([]);
    expect(await openRead(ALICE, A2)).toBe(true);
    // Seul l'avatar demandé est lisible (pas l'autre fichier de Bob), et la liste ne montre que lui.
    expect(await visibleNames(ALICE)).toEqual([A2]);
    // Autorisation échue : plus rien.
    await t.db.exec("update public.avatar_read_grants set expires_at = now() - interval '1 second'");
    expect(await visibleNames(ALICE)).toEqual([]);
    // Profil passé en « contacts » : l'autorisation en cours ne suffit plus, et aucune nouvelle.
    expect(await openRead(ALICE, A2)).toBe(true);
    await t.as(BOB, "select public.update_my_profile('bob', 'Nom', '', 'contacts')");
    expect(await visibleNames(ALICE)).toEqual([]);
    expect(await openRead(ALICE, A2)).toBe(false);
    expect(await visibleNames(BOB)).toEqual([A1, A2]);
  });

  it("une autorisation ne donne que le fichier du titulaire du profil", async () => {
    // Bob désigne son avatar ; Alice ne peut pas créer de fichier qui porterait ce nom pour le
    // remplacer (les noms sont tirés au hasard par la base ; le test lui donne un jeton pour ce nom).
    await withAvatar(BOB, A1);
    await expect(upload(ALICE, A1)).rejects.toThrow(/unique|duplicate/);
    expect(await openRead(CAROL, A1)).toBe(true);
    const granted = await t.as<{ ok: boolean }>(CAROL, "select public.avatars_read_granted($1, $2) as ok", [A1, ALICE]);
    expect(granted).toEqual([{ ok: false }]);
    expect(await visibleRows(CAROL)).toEqual([{ name: A1, owner_id: BOB }]);
  });

  it("suppression : ses fichiers, sauf l'avatar actuel (ignoré sans erreur par l'API Storage)", async () => {
    await upload(ALICE, A1);
    await upload(ALICE, A2);
    await setAvatar(ALICE, A1);
    await withAvatar(BOB, A3);
    expect(await openRead(BOB, A1)).toBe(true);
    expect(await remove(BOB, A1, A2)).toEqual([]);
    expect(await remove(ALICE, A1, A2)).toEqual([A2]);
    expect(await storedNames()).toEqual([A1, A3]);
    await setAvatar(ALICE, null);
    expect(await remove(ALICE, A1)).toEqual([A1]);
  });
});

describe("public.open_avatar_upload et public.cancel_avatar_upload", () => {
  it("délivre un nom aléatoire en minuscules, enregistré pour cinq minutes", async () => {
    const name = await openUpload(ALICE);
    expect(name).toMatch(UUID);
    expect(name).not.toContain(ALICE);
    const { rows } = await t.db.query<{ avatar_id: string; minutes: number }>(
      "select avatar_id, round(extract(epoch from expires_at - now()) / 60)::int as minutes from public.avatar_upload_tickets where user_id = $1",
      [ALICE],
    );
    expect(rows).toEqual([{ avatar_id: name, minutes: 5 }]);
    expect(await openUpload(ALICE)).not.toBe(name);
  });

  it("profil requis ; réservées aux comptes connectés", async () => {
    await expect(openUpload(CAROL)).rejects.toThrow(/profiles_not_found/);
    await expect(openUpload("")).rejects.toThrow(/profiles_not_authenticated/);
    await expect(openUpload(null)).rejects.toThrow(/permission denied/);
    await expect(cancelUpload("")).rejects.toThrow(/profiles_not_authenticated/);
    await expect(cancelUpload(null)).rejects.toThrow(/permission denied/);
  });

  it("annuler ne retire que son propre jeton ; les jetons échus de tous les comptes sont effacés", async () => {
    await giveTicket(CAROL, A3, "-1 minute");
    await openUpload(ALICE);
    await openUpload(BOB);
    expect(await ticketOf(CAROL)).toEqual([]);
    await cancelUpload(ALICE);
    expect(await ticketOf(ALICE)).toEqual([]);
    expect(await ticketOf(BOB)).toHaveLength(1);
  });

  it("set_profile_avatar consomme le jeton du fichier désigné", async () => {
    const name = await openUpload(ALICE);
    await storageUpload(ALICE, name);
    await setAvatar(ALICE, name);
    expect(await ticketOf(ALICE)).toEqual([]);
    // Un autre jeton en cours n'est pas touché.
    await giveTicket(ALICE, A2);
    await setAvatar(ALICE, null);
    await setAvatar(ALICE, name);
    expect(await ticketOf(ALICE)).toEqual([{ avatar_id: A2 }]);
  });

  it("les jetons ne sont accessibles à personne par l'API et disparaissent avec le compte", async () => {
    await openUpload(ALICE);
    for (const role of [ALICE, null]) {
      await expect(t.as(role, "select * from public.avatar_upload_tickets")).rejects.toThrow(/permission denied/);
      await expect(
        t.as(role, "insert into public.avatar_upload_tickets values ($1, $2, now() + interval '1 day')", [BOB, A1]),
      ).rejects.toThrow(/permission denied/);
      await expect(t.as(role, "update public.avatar_upload_tickets set expires_at = now() + interval '1 day'")).rejects.toThrow(
        /permission denied/,
      );
    }
    await t.db.query("delete from auth.users where id = $1", [ALICE]);
    expect(await ticketOf(ALICE)).toEqual([]);
    await t.addUsers(ALICE);
  });

  it("my_avatar_upload_ticket : le jeton du compte connecté seulement (droit d'accès)", async () => {
    const name = await openUpload(ALICE);
    await openUpload(BOB);
    const ticket = (userId: string | null) =>
      t.as<Record<string, unknown>>(userId, "select * from public.my_avatar_upload_ticket()");
    const rows = await ticket(ALICE);
    expect(rows).toHaveLength(1);
    expect(rows[0].avatar_id).toBe(name);
    expect(Object.keys(rows[0]).toSorted()).toEqual(["avatar_id", "expires_at"]);
    expect(await ticket("")).toEqual([]);
    await expect(ticket(null)).rejects.toThrow(/permission denied/);
  });
});

describe("public.set_profile_avatar", () => {
  it("désigne puis retire l'avatar, et renvoie le précédent", async () => {
    await upload(ALICE, A1);
    await upload(ALICE, A2);
    expect(await setAvatar(ALICE, A1)).toEqual([{ previous: null }]);
    expect(await setAvatar(ALICE, A2)).toEqual([{ previous: A1 }]);
    expect(await t.as(ALICE, "select avatar_id from public.profiles")).toEqual([{ avatar_id: A2 }]);
    expect(await setAvatar(ALICE, null)).toEqual([{ previous: A2 }]);
    expect(await t.as(ALICE, "select avatar_id from public.profiles")).toEqual([{ avatar_id: null }]);
    // Seul le profil du compte connecté change.
    expect((await t.db.query("select avatar_id from public.profiles where user_id = $1", [BOB])).rows).toEqual([{ avatar_id: null }]);
  });

  it("le fichier doit exister et appartenir au compte", async () => {
    await expect(setAvatar(ALICE, A1)).rejects.toThrow(/profiles_invalid/);
    await upload(BOB, A1);
    await expect(setAvatar(ALICE, A1)).rejects.toThrow(/profiles_invalid/);
    expect(await setAvatar(BOB, A1)).toEqual([{ previous: null }]);
  });

  it("entrée bornée et vérifiée en texte ; profil requis ; réservée aux comptes connectés", async () => {
    for (const bad of ["x", HEX.toUpperCase(), `${A1} `, "a".repeat(100_000), "00000000-0000-0000-0000-00000000000g"]) {
      await expect(setAvatar(ALICE, bad), bad.slice(0, 40)).rejects.toThrow(/profiles_invalid/);
    }
    await expect(setAvatar(CAROL, A1)).rejects.toThrow(/profiles_not_found/);
    await expect(setAvatar("", A1)).rejects.toThrow(/profiles_not_authenticated/);
    await expect(setAvatar(null, A1)).rejects.toThrow(/permission denied/);
  });

  it("20 changements par jour au plus ; retirer l'avatar n'est jamais limité", async () => {
    for (let i = 0; i < 20; i += 1) {
      const id = `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`;
      await upload(ALICE, id);
      await setAvatar(ALICE, id);
      await t.db.query("delete from storage.objects where owner_id = $1 and name <> $2", [ALICE, id]);
    }
    await upload(ALICE, A1);
    await expect(setAvatar(ALICE, A1)).rejects.toThrow(/profiles_rate_limited/);
    expect(await setAvatar(ALICE, null)).toHaveLength(1);
  });
});

describe("public.open_avatar_read", () => {
  it("vrai pour son avatar ou l'avatar actuel d'un profil visible ; faux sinon (même réponse)", async () => {
    await withAvatar(BOB, A1);
    expect(await openRead(ALICE, A1)).toBe(true);
    expect(await openRead(BOB, A1)).toBe(true);
    expect(await openRead(ALICE, A2)).toBe(false);
    expect(await openRead(ALICE, "pas-un-uuid")).toBe(false);
    expect(await openRead(ALICE, "a".repeat(100_000))).toBe(false);
    await t.as(BOB, "select public.update_my_profile('bob', 'Nom', '', 'contacts')");
    expect(await openRead(ALICE, A1)).toBe(false);
    expect(await openRead(BOB, A1)).toBe(true);
    await expect(openRead(null, A1)).rejects.toThrow(/permission denied/);
    await expect(openRead("", A1)).rejects.toThrow(/profiles_not_authenticated/);
  });

  it("ne renvoie qu'un booléen : ni chemin ni identifiant de compte", async () => {
    await withAvatar(BOB, A1);
    const rows = await t.as(ALICE, "select * from public.open_avatar_read($1)", [A1]);
    expect(JSON.stringify(rows)).not.toContain(BOB);
    expect(rows).toEqual([{ open_avatar_read: true }]);
  });

  it("600 demandes par heure au plus ; autorisations échues effacées", async () => {
    await withAvatar(BOB, A1);
    await t.db.query(
      "insert into public.rate_limits (user_id, action, window_start, hits) values ($1, 'avatar_read', now(), 600)",
      [ALICE],
    );
    await expect(openRead(ALICE, A1)).rejects.toThrow(/profiles_rate_limited/);
    await t.db.query("delete from public.rate_limits");
    await t.db.query(
      "insert into public.avatar_read_grants (viewer_id, avatar_id, expires_at) values ($1, $2, now() - interval '5 minutes')",
      [CAROL, A2],
    );
    expect(await openRead(ALICE, A1)).toBe(true);
    const { rows } = await t.db.query<{ viewer_id: string }>("select viewer_id from public.avatar_read_grants");
    expect(rows).toEqual([{ viewer_id: ALICE }]);
  });

  it("les autorisations ne sont accessibles à personne par l'API et disparaissent avec le compte", async () => {
    await withAvatar(BOB, A1);
    await openRead(ALICE, A1);
    for (const role of [ALICE, null]) {
      await expect(t.as(role, "select * from public.avatar_read_grants")).rejects.toThrow(/permission denied/);
      await expect(
        t.as(role, "insert into public.avatar_read_grants values ($1, $2, now() + interval '1 day')", [CAROL, A1]),
      ).rejects.toThrow(/permission denied/);
    }
    await t.db.query("delete from auth.users where id = $1", [ALICE]);
    expect((await t.db.query("select * from public.avatar_read_grants")).rows).toEqual([]);
    await t.addUsers(ALICE);
  });
});

describe("public.my_avatar_files", () => {
  it("noms des fichiers du compte connecté seulement (pas les avatars qu'il vient d'afficher)", async () => {
    await upload(ALICE, A1);
    await withAvatar(BOB, A2);
    await openRead(ALICE, A2);
    expect(await ownFiles(ALICE)).toEqual([A1]);
    expect(await ownFiles(BOB)).toEqual([A2]);
    expect(await ownFiles("")).toEqual([]);
    await expect(t.as(null, "select * from public.my_avatar_files()")).rejects.toThrow(/permission denied/);
  });
});

describe("public.my_avatar_read_grants", () => {
  it("autorisations d'affichage du compte connecté seulement (droit d'accès), en lecture seule", async () => {
    await withAvatar(BOB, A1);
    await createProfile(CAROL, "carol");
    await withAvatar(CAROL, A2);
    expect(await openRead(ALICE, A1)).toBe(true);
    expect(await openRead(ALICE, A2)).toBe(true);
    expect(await openRead(BOB, A2)).toBe(true);
    const grants = (userId: string | null) =>
      t.as<{ avatar_id: string }>(userId, "select avatar_id from public.my_avatar_read_grants() order by avatar_id");
    expect(await grants(ALICE)).toEqual([{ avatar_id: A1 }, { avatar_id: A2 }]);
    expect(await grants(BOB)).toEqual([{ avatar_id: A2 }]);
    expect(await grants("")).toEqual([]);
    await expect(grants(null)).rejects.toThrow(/permission denied/);
    const [row] = await t.as<Record<string, unknown>>(ALICE, "select * from public.my_avatar_read_grants() limit 1");
    expect(Object.keys(row).toSorted()).toEqual(["avatar_id", "expires_at"]);
  });
});

describe("contrôles internes", () => {
  it("ne sont pas appelables par le rôle anonyme", async () => {
    for (const sql of [
      "select public.avatars_read_granted('x', 'y')",
      "select public.avatars_upload_allowed('x')",
      "select public.avatars_upload_pending('x')",
      "select public.avatars_name_ok('x')",
    ]) {
      await expect(t.as(null, sql), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("appelés directement, ne renseignent que sur le compte lui-même et n'écrivent rien", async () => {
    await giveTicket(BOB, A1);
    const pending = async (userId: string, name: string) =>
      (await t.as<{ ok: boolean }>(userId, "select public.avatars_upload_pending($1) as ok", [name]))[0].ok;
    expect(await pending(BOB, A1)).toBe(true);
    expect(await pending(ALICE, A1)).toBe(false);
    expect(await t.as(ALICE, "select public.avatars_upload_allowed($1) as ok", [A1])).toEqual([{ ok: false }]);
    expect(await uploadHits(ALICE)).toBe(0);
  });
});
