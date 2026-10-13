// Fonction public.delete_my_account() (supabase/migrations/20261009120000_delete_my_account.sql),
// exécutée sur un vrai PostgreSQL (PGlite) avec les droits de l'API : rôle authenticated et claims
// du jeton (sub, session_id, amr). Le schéma auth de Supabase est simulé (src/test/pglite.ts) ; les
// tables des sessions et des identités y sont ajoutées ici, avec la même clé étrangère
// « on delete cascade » que chez Supabase.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BLANK_DOC, openTestDb, type TestDb } from "@/test/pglite";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSIONS: Record<string, string> = {
  [ALICE]: "a5a5a5a5-0000-4000-8000-000000000001",
  [BOB]: "b5b5b5b5-0000-4000-8000-000000000002",
};

const AUTH_TABLES = `
  create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade);
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade);
`;

let t: TestDb;

const count = async (sql: string, params: unknown[] = []) =>
  Number((await t.db.query<{ n: number }>(`select count(*)::int as n from ${sql}`, params)).rows[0].n);

/** Compte complet : utilisateur, identité, session et deux cartes (créées comme l'application). */
async function addAccount(id: string) {
  await t.addUsers(id);
  await t.db.query("insert into auth.identities (user_id) values ($1)", [id]);
  await t.db.query("insert into auth.sessions (id, user_id) values ($1, $2)", [SESSIONS[id], id]);
  for (const name of ["Sahel", "Arctique"]) {
    await t.as(id, "select id from public.create_map($1, $2)", [name, JSON.stringify(BLANK_DOC)]);
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Claims d'un jeton de la session de `userId`, ouverte par mot de passe il y a `ageSeconds`. */
const passwordClaims = (userId: string, ageSeconds = 2): Record<string, unknown> => ({
  sub: userId,
  role: "authenticated",
  session_id: SESSIONS[userId],
  amr: [{ method: "password", timestamp: nowSeconds() - ageSeconds }],
});

const deleteWith = (claims: Record<string, unknown>) =>
  t.asClaims<{ deleted: boolean }>(claims, "select public.delete_my_account() as deleted");
const deleteAs = (userId: string | null) =>
  t.as<{ deleted: boolean }>(userId, "select public.delete_my_account() as deleted");

beforeAll(async () => {
  t = await openTestDb();
  await t.db.exec(AUTH_TABLES);
}, 60_000);

beforeEach(async () => {
  await t.db.exec("delete from auth.users");
  await addAccount(ALICE);
  await addAccount(BOB);
});

afterAll(async () => {
  await t?.db.close();
});

/** Rien n'a été supprimé. */
async function expectNothingDeleted() {
  expect(await count("auth.users")).toBe(2);
  expect(await count("public.maps")).toBe(4);
  expect(await count("auth.sessions")).toBe(2);
}

describe("public.delete_my_account()", () => {
  it("supprime le compte de l'utilisateur connecté, avec ses cartes, identités et sessions", async () => {
    expect(await deleteWith(passwordClaims(ALICE))).toEqual([{ deleted: true }]);
    expect(await count("auth.users where id = $1", [ALICE])).toBe(0);
    expect(await count("public.maps where user_id = $1", [ALICE])).toBe(0);
    expect(await count("auth.identities where user_id = $1", [ALICE])).toBe(0);
    expect(await count("auth.sessions where user_id = $1", [ALICE])).toBe(0);
  });

  it("ne touche à aucun autre compte", async () => {
    await deleteWith(passwordClaims(ALICE));
    expect(await count("auth.users where id = $1", [BOB])).toBe(1);
    expect(await count("public.maps where user_id = $1", [BOB])).toBe(2);
    expect(await count("auth.sessions where user_id = $1", [BOB])).toBe(1);
  });

  it("ne prend aucun argument : impossible de viser un autre compte", async () => {
    await expect(t.asClaims(passwordClaims(ALICE), "select public.delete_my_account($1)", [BOB])).rejects.toThrow(
      /does not exist/,
    );
    // Jeton d'Alice portant la session de Bob : refusé (la session doit appartenir à auth.uid()).
    await expect(deleteWith({ ...passwordClaims(ALICE), session_id: SESSIONS[BOB] })).rejects.toThrow(
      /account_session_ended/,
    );
    await expectNothingDeleted();
  });

  it("un utilisateur connecté n'a aucun droit direct sur auth.users", async () => {
    await expect(t.as(ALICE, "delete from auth.users where id = $1", [BOB])).rejects.toThrow(/permission denied/);
    expect(await count("auth.users")).toBe(2);
  });

  it("refuse un appel sans auth.uid() (rôle authenticated sans claim sub)", async () => {
    await expect(deleteAs("")).rejects.toThrow(/account_not_authenticated/);
    const withoutSub = { ...passwordClaims(ALICE), sub: undefined };
    await expect(deleteWith(withoutSub)).rejects.toThrow(/account_not_authenticated/);
    await expectNothingDeleted();
  });

  it("n'est pas exécutable par le rôle anonyme", async () => {
    await expect(deleteAs(null)).rejects.toThrow(/permission denied/);
    await expectNothingDeleted();
  });

  it("refuse un jeton dont la session a été fermée (déconnexion), même non expiré", async () => {
    await t.db.query("delete from auth.sessions where id = $1", [SESSIONS[ALICE]]);
    await expect(deleteWith(passwordClaims(ALICE))).rejects.toThrow(/account_session_ended/);
    // Jeton sans session, ou session mal formée.
    await expect(deleteWith({ ...passwordClaims(ALICE), session_id: undefined })).rejects.toThrow(
      /account_session_ended/,
    );
    await expect(deleteWith({ ...passwordClaims(ALICE), session_id: "pas-un-uuid" })).rejects.toThrow(
      /account_session_ended/,
    );
    expect(await count("auth.users where id = $1", [ALICE])).toBe(1);
  });

  it("exige un mot de passe saisi il y a moins de 5 minutes : un jeton copié ne suffit pas", async () => {
    const refused = [
      // Jeton d'une session ouverte par mot de passe il y a 10 minutes (cookie de session copié).
      passwordClaims(ALICE, 600),
      // Session ouverte par un lien reçu par e-mail.
      { ...passwordClaims(ALICE), amr: [{ method: "otp", timestamp: nowSeconds() }] },
      { ...passwordClaims(ALICE), amr: [{ method: "recovery", timestamp: nowSeconds() }] },
      // Formats inattendus.
      { ...passwordClaims(ALICE), amr: undefined },
      { ...passwordClaims(ALICE), amr: ["password"] },
      { ...passwordClaims(ALICE), amr: { method: "password", timestamp: nowSeconds() } },
      { ...passwordClaims(ALICE), amr: [{ method: "password", timestamp: String(nowSeconds()) }] },
      { ...passwordClaims(ALICE), amr: [{ method: "password" }] },
    ];
    for (const claims of refused) {
      await expect(deleteWith(claims), JSON.stringify(claims.amr)).rejects.toThrow(
        /account_reauthentication_required/,
      );
    }
    await expectNothingDeleted();
    // Mot de passe récent parmi d'autres méthodes : accepté.
    const mixed = {
      ...passwordClaims(ALICE),
      amr: [
        { method: "otp", timestamp: nowSeconds() - 3600 },
        { method: "password", timestamp: nowSeconds() - 60 },
      ],
    };
    expect(await deleteWith(mixed)).toEqual([{ deleted: true }]);
  });

  it("un second appel avec le même jeton est refusé : la session a été supprimée avec le compte", async () => {
    const claims = passwordClaims(ALICE);
    await deleteWith(claims);
    await expect(deleteWith(claims)).rejects.toThrow(/account_session_ended/);
  });

  it("s'exécute avec un search_path vide (SECURITY DEFINER sûr)", async () => {
    const [fn] = (
      await t.db.query<{ secdef: boolean; config: string[] | null }>(
        "select prosecdef as secdef, proconfig as config from pg_proc where proname = 'delete_my_account'",
      )
    ).rows;
    expect(fn.secdef).toBe(true);
    expect(fn.config).toEqual(['search_path=""']);
  });
});
