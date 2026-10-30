// public.delete_my_account() et avatars (supabase/migrations/20261017120300_delete_my_account_avatars.sql),
// sur un vrai PostgreSQL (PGlite) : la base refuse de supprimer un compte dont un fichier reste dans
// le compartiment « avatars » (appel direct à l'API, ou envoi depuis un autre onglet pendant la
// suppression), si bien qu'aucun avatar ne survit à son compte. Envois et suppressions de fichiers
// simulés comme le fait l'API Storage (src/test/pglite.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS, MIGRATION_FILES, migrationsUpTo, openTestDb, type TestDb } from "@/test/pglite";

const MIGRATION = "20261017120300_delete_my_account_avatars.sql";
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSIONS: Record<string, string> = {
  [ALICE]: "a5a5a5a5-0000-4000-8000-000000000001",
  [BOB]: "b5b5b5b5-0000-4000-8000-000000000002",
};
const A1 = "11111111-1111-4111-8111-111111111111";
const A2 = "22222222-2222-4222-8222-222222222222";
const B1 = "33333333-3333-4333-8333-333333333333";

const AUTH_TABLES = `
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade);
`;

let t: TestDb;

const count = async (sql: string, params: unknown[] = []) =>
  Number((await t.db.query<{ n: number }>(`select count(*)::int as n from ${sql}`, params)).rows[0].n);

const passwordClaims = (userId: string): Record<string, unknown> => ({
  sub: userId,
  role: "authenticated",
  session_id: SESSIONS[userId],
  amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 2 }],
});
const deleteAccount = (userId: string) =>
  t.asClaims<{ deleted: boolean }>(passwordClaims(userId), "select public.delete_my_account() as deleted");

/** Jeton d'envoi pour un nom choisi par le test (open_avatar_upload tire un nom au hasard). */
const giveTicket = (userId: string, name: string) =>
  t.db.query(
    `insert into public.avatar_upload_tickets (user_id, avatar_id, expires_at) values ($1, $2, now() + interval '5 minutes')
     on conflict (user_id) do update set avatar_id = excluded.avatar_id, expires_at = excluded.expires_at`,
    [userId, name],
  );
/** Envoi par l'API Storage avec un jeton en cours (consommé par l'écriture du fichier). */
async function upload(userId: string, name: string) {
  await giveTicket(userId, name);
  await t.storageUpload(userId, "avatars", name);
}
/** Fichier envoyé puis désigné comme avatar (le jeton est consommé). */
async function withAvatar(userId: string, name: string) {
  await upload(userId, name);
  await t.as(userId, "select public.set_profile_avatar($1)", [name]);
}
/** Ce que fait l'application avant d'appeler la fonction (removeAllAvatars). */
async function removeAllAvatars(userId: string) {
  await t.as(userId, "select public.set_profile_avatar(null)");
  await t.as(userId, "select public.cancel_avatar_upload()");
  const names = (await t.as<{ name: string }>(userId, "select name from public.my_avatar_files() as name")).map((r) => r.name);
  await t.storageRemove(userId, "avatars", names);
}
const filesOf = async (userId: string) =>
  (
    await t.db.query<{ name: string }>(
      "select name from storage.objects where bucket_id = 'avatars' and owner_id = $1 order by name",
      [userId],
    )
  ).rows.map((r) => r.name);

beforeAll(async () => {
  t = await openTestDb();
  await t.db.exec(AUTH_TABLES);
}, 60_000);

beforeEach(async () => {
  await t.db.exec("delete from storage.objects; delete from public.rate_limits; delete from auth.users;");
  for (const [id, handle] of [
    [ALICE, "alice"],
    [BOB, "bob"],
  ]) {
    await t.addUsers(id);
    await t.db.query("insert into auth.sessions (id, user_id) values ($1, $2)", [SESSIONS[id], id]);
    await t.as(id, "select public.create_my_profile($1, 'Nom', '', 'members')", [handle]);
  }
});

afterAll(async () => {
  await t?.db.close();
});

/** Le compte d'Alice est entier : utilisateur, session, profil (avec son avatar `avatar`) et fichiers. */
async function expectAliceIntact(avatar: string | null, files: string[]) {
  expect(await count("auth.users where id = $1", [ALICE])).toBe(1);
  expect(await count("auth.sessions where user_id = $1", [ALICE])).toBe(1);
  const { rows } = await t.db.query<{ avatar_id: string | null }>("select avatar_id from public.profiles where user_id = $1", [ALICE]);
  expect(rows).toEqual([{ avatar_id: avatar }]);
  expect(await filesOf(ALICE)).toEqual(files);
}

describe("public.delete_my_account() et avatars", () => {
  it("appel direct avec un avatar encore en place : refusé, rien n'est supprimé", async () => {
    await withAvatar(ALICE, A1);
    await expect(deleteAccount(ALICE)).rejects.toThrow(/account_avatars_remain/);
    await expectAliceIntact(A1, [A1]);
  });

  it("fichier envoyé pendant la suppression (autre onglet, jeton en cours) : refusé, jeton et profil intacts", async () => {
    await withAvatar(ALICE, A1);
    await removeAllAvatars(ALICE);
    // Un autre onglet obtient un jeton et envoie un fichier avant l'appel de la fonction.
    await upload(ALICE, A2);
    await expect(deleteAccount(ALICE)).rejects.toThrow(/account_avatars_remain/);
    await expectAliceIntact(null, [A2]);
    // Nouvel essai par l'application : les fichiers restants sont effacés d'abord, puis le compte.
    await removeAllAvatars(ALICE);
    expect(await deleteAccount(ALICE)).toEqual([{ deleted: true }]);
  });

  it("après la suppression des fichiers : compte, profil et jeton d'envoi supprimés, aucun fichier ne reste", async () => {
    await withAvatar(ALICE, A1);
    await removeAllAvatars(ALICE);
    // Jeton ouvert sans fichier envoyé : il disparaît avec le compte.
    await giveTicket(ALICE, A2);
    expect(await deleteAccount(ALICE)).toEqual([{ deleted: true }]);
    expect(await count("auth.users where id = $1", [ALICE])).toBe(0);
    expect(await count("public.profiles where user_id = $1", [ALICE])).toBe(0);
    expect(await count("public.avatar_upload_tickets where user_id = $1", [ALICE])).toBe(0);
    expect(await filesOf(ALICE)).toEqual([]);
    // Le jeton supprimé ne permet plus aucun envoi.
    await expect(t.storageUpload(ALICE, "avatars", A2)).rejects.toThrow(/row-level security|avatars_write_refused/);
  });

  it("adresse d'envoi signée obtenue avant la suppression, envoi après : refusé, aucun fichier orphelin", async () => {
    await giveTicket(ALICE, A2);
    // createSignedUploadUrl : la sonde passe (profil, jeton, aucun fichier).
    await t.storageSignUpload(ALICE, "avatars", A2);
    expect(await deleteAccount(ALICE)).toEqual([{ deleted: true }]);
    // uploadToSignedUrl : écriture avec le rôle de l'API, sans politique ; le déclencheur refuse
    // (ni profil ni jeton pour ce compte).
    await expect(t.storageUploadToSignedUrl(ALICE, "avatars", A2)).rejects.toThrow(/avatars_write_refused/);
    await expect(t.storageUploadToSignedUrl(ALICE, "avatars", A2, true)).rejects.toThrow(/avatars_write_refused/);
    expect(await filesOf(ALICE)).toEqual([]);
  });

  it("l'avatar d'un autre compte n'empêche rien et n'est pas touché", async () => {
    await withAvatar(BOB, B1);
    expect(await deleteAccount(ALICE)).toEqual([{ deleted: true }]);
    expect(await filesOf(BOB)).toEqual([B1]);
    expect(await count("public.profiles where user_id = $1 and avatar_id = $2", [BOB, B1])).toBe(1);
  });

  it("compte sans profil (comme avec la version en production) : supprimé comme avant", async () => {
    await t.db.query("delete from public.profiles where user_id = $1", [ALICE]);
    expect(await deleteAccount(ALICE)).toEqual([{ deleted: true }]);
    expect(await count("auth.users where id = $1", [ALICE])).toBe(0);
  });

  it("garde les protections de la fonction : SECURITY DEFINER, search_path vide, réservée aux comptes connectés", async () => {
    const { rows } = await t.db.query<{ secdef: boolean; config: string[]; args: string; anon: boolean; auth: boolean }>(
      `select p.prosecdef as secdef, p.proconfig as config, pg_get_function_identity_arguments(p.oid) as args,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth
       from pg_proc as p where p.proname = 'delete_my_account'`,
    );
    expect(rows).toEqual([{ secdef: true, config: ['search_path=""'], args: "", anon: false, auth: true }]);
    await expect(t.as(null, "select public.delete_my_account()")).rejects.toThrow(/permission denied/);
    await expect(t.as(ALICE, "select public.delete_my_account()")).rejects.toThrow(/account_session_ended/);
  });
});

describe("migration", () => {
  it("s'applique juste après les avatars, ne remplace que delete_my_account, sur une base au niveau des avatars", async () => {
    expect(MIGRATION_FILES.indexOf(MIGRATION)).toBe(MIGRATION_FILES.indexOf("20261017120200_avatars.sql") + 1);
    const sql = MIGRATIONS[MIGRATION_FILES.indexOf(MIGRATION)];
    expect(sql.match(/create or replace function public\.(\w+)/gi)).toEqual(["create or replace function public.delete_my_account"]);
    expect(sql).not.toMatch(/drop |alter table|create policy|create table/i);
    const old = await openTestDb(migrationsUpTo("20261017120200_avatars.sql"));
    try {
      await old.db.exec(AUTH_TABLES);
      await old.db.exec(sql);
    } finally {
      await old.db.close();
    }
  }, 60_000);
});
