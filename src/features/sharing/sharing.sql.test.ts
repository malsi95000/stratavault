// Partage des cartes dans la base (supabase/migrations/20261019120000_map_sharing.sql), sur un vrai
// PostgreSQL (PGlite) avec les droits de l'API : aucune lecture ni écriture directe des tables,
// invitations de contacts, liens à jeton (empreinte seule), rôles, retrait, départ, verrou
// d'édition, écriture du contenu par update_map_data, blocages, suppressions en cascade, limites.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BLANK_DOC, MIGRATIONS, MIGRATION_FILES, migrationsUpTo, openTestDb, type TestDb } from "@/test/pglite";
import {
  INVITATION_DAYS,
  LINK_ATTEMPTS_PER_DAY,
  LOCK_CALLS_PER_HOUR,
  LOCK_LEASE_MS,
  MAX_ACTIVE_LINKS,
  MAX_LINK_HOURS,
  MAX_LINK_USES,
  MAX_MAP_SEATS,
  MAX_PENDING_INVITATIONS,
  MAX_SHARED_MAPS,
  SHARED_READS_PER_HOUR,
  SHARED_STATES_PER_HOUR,
  SHARES_PER_DAY,
  SHARE_CHANGES_PER_DAY,
} from "./limits";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DAVE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UNKNOWN = "12345678-1234-4234-8234-123456789abc";
const MIGRATION = "20261019120000_map_sharing.sql";
const DOC = JSON.stringify(BLANK_DOC);
const DOC2 = JSON.stringify({ ...BLANK_DOC, notes: { FRA: "Paris" } });

let t: TestDb;

type Row = Record<string, unknown>;
type Share = { map_id: string; kind: string; id: string; handle: string | null; display_name: string | null; role: string; uses: number | null; max_uses: number | null };

const one = async <T = Row>(userId: string | null, sql: string, params: unknown[] = []) =>
  (await t.as<T>(userId, sql, params))[0];
/** Appelle une fonction de la base qui renvoie un statut texte. */
const call = async (userId: string | null, sql: string, params: unknown[] = []) =>
  (await one<{ status: string }>(userId, `select ${sql} as status`, params)).status;
const profile = (userId: string, handle: string, visibility = "members") =>
  call(userId, "public.create_my_profile($1, $2, '', $3)", [handle, `Nom ${handle}`, visibility]);
const newMap = async (userId: string, name = "Carte") =>
  (await one<{ id: string; revision: string }>(userId, "select id, revision::text from public.create_map($1, $2)", [name, DOC]));
const write = (userId: string, id: string, revision: string, data = DOC2) =>
  t.as<{ id: string; revision: string }>(userId, "select id, revision::text from public.update_map_data($1, $2, $3)", [id, data, revision]);
const revisionOf = async (id: string) =>
  (await t.db.query<{ revision: string }>("select revision::text from public.maps where id = $1", [id])).rows[0].revision;
const contactRef = async (userId: string, handle: string) =>
  (await t.as<{ id: string; handle: string }>(userId, "select id, handle from public.my_contacts()")).find((c) => c.handle === handle)!.id;
async function befriend(a: string, b: string, bHandle: string, aHandle: string) {
  expect(await call(a, "public.send_contact_request($1)", [bHandle])).toBe("sent");
  const [request] = await t.as<{ id: string }>(b, "select id from public.my_contact_requests() where direction = 'incoming' and handle = $1", [aHandle]);
  expect(await call(b, "public.accept_contact_request($1)", [request.id])).toBe("accepted");
}
const invite = (userId: string, map: string, contact: string, role = "editor") =>
  call(userId, "public.invite_contact_to_map($1, $2, $3)", [map, contact, role]);
const invitations = (userId: string) =>
  t.as<{ id: string; map_name: string; role: string; owner_handle: string; owner_display_name: string }>(
    userId,
    "select id, map_name, role, owner_handle, owner_display_name from public.my_map_invitations()",
  );
const answer = (userId: string, id: string, accept: boolean) =>
  one<{ status: string; map_id: string | null }>(userId, "select status, map_id from public.answer_map_invitation($1, $2)", [id, accept]);
const createLinkRow = (userId: string, map: string, role = "reader", uses = 5, hours = 24) =>
  one<{ status: string; token: string | null }>(userId, "select status, token from public.create_map_link($1, $2, $3, $4)", [
    map,
    role,
    uses,
    hours,
  ]);
/** Crée un lien et renvoie son jeton (échec du test si la base répond autre chose que « created »). */
const createLink = async (userId: string, map: string, role = "reader", uses = 5, hours = 24) => {
  const row = await createLinkRow(userId, map, role, uses, hours);
  expect(row.status).toBe("created");
  return row.token!;
};
const acceptLink = (userId: string, token: string) =>
  one<{ status: string; map_id: string | null }>(userId, "select status, map_id from public.accept_map_link($1)", [token]);
const preview = (userId: string, token: string) =>
  t.as<{ map_name: string; role: string; owner_handle: string; owner_display_name: string | null; my_role: string | null }>(
    userId,
    "select map_name, role, owner_handle, owner_display_name, my_role from public.preview_map_link($1)",
    [token],
  );
const shares = (userId: string, map: string | null = null) =>
  t.as<Share>(userId, "select map_id, kind, id, handle, display_name, role, uses, max_uses from public.my_map_shares($1)", [map]);
const sharedWithMe = (userId: string) =>
  t.as<{ id: string; name: string; role: string; owner_handle: string; owner_display_name: string | null }>(
    userId,
    "select id, name, role, owner_handle, owner_display_name from public.maps_shared_with_me()",
  );
const lock = (userId: string, map: string) =>
  one<{ status: string; holder_name: string | null; expires_at: string | null }>(
    userId,
    "select status, holder_name, expires_at from public.acquire_map_lock($1)",
    [map],
  );
const release = async (userId: string, map: string) =>
  (await one<{ released: boolean }>(userId, "select public.release_map_lock($1) as released", [map])).released;
const state = (userId: string, map: string) =>
  t.as<{ role: string; revision: string; lock_mine: boolean; lock_held: boolean; lock_holder_name: string | null }>(
    userId,
    "select role, revision::text, lock_mine, lock_held, lock_holder_name from public.shared_map_state($1)",
    [map],
  );
const hits = async (userId: string, action: string) =>
  (await t.db.query<{ hits: number }>("select hits from public.rate_limits where user_id = $1 and action = $2", [userId, action]))
    .rows[0]?.hits ?? 0;
const setHits = (userId: string, action: string, value: number) =>
  t.db.query(
    `insert into public.rate_limits (user_id, action, window_start, hits) values ($1, $2, now(), $3)
     on conflict (user_id, action) do update set hits = excluded.hits, window_start = now()`,
    [userId, action, value],
  );
const count = async (table: string) => (await t.db.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0].n;
const expireLock = (map: string) => t.db.query("update public.map_locks set expires_at = now() - interval '1 second' where map_id = $1", [map]);

/** Alice possède une carte ; Bob en est membre avec le rôle donné (par une invitation acceptée). */
async function sharedMap(role = "editor") {
  const map = await newMap(ALICE);
  const invited = await invite(ALICE, map.id, await contactRef(ALICE, "bob"), role);
  expect(invited).toBe("invited");
  const [invitation] = await invitations(BOB);
  expect(await answer(BOB, invitation.id, true)).toEqual({ status: "joined", map_id: map.id });
  return map;
}

async function reset() {
  await t.db.exec(`
    delete from public.maps;
    delete from public.contact_blocks;
    delete from public.profiles;
    delete from public.rate_limits;
    delete from auth.users where id not in ('${ALICE}', '${BOB}', '${CAROL}', '${DAVE}');
  `);
  for (const [id, handle] of [
    [ALICE, "alice"],
    [BOB, "bob"],
    [CAROL, "carol"],
  ]) {
    expect(await profile(id, handle)).toBe("created");
  }
  await befriend(ALICE, BOB, "bob", "alice");
  await t.db.exec("delete from public.rate_limits;");
}

beforeAll(async () => {
  t = await openTestDb();
  await t.addUsers(ALICE, BOB, CAROL, DAVE);
}, 60_000);

beforeEach(reset);

afterAll(async () => {
  await t?.db.close();
});

describe("migration du partage", () => {
  it("vient après celle des contacts, ne remplace que update_map_data, et s'applique à une base existante", async () => {
    expect(MIGRATION_FILES).toContain(MIGRATION);
    expect(MIGRATION_FILES.indexOf(MIGRATION)).toBe(MIGRATION_FILES.indexOf("20261018120000_contacts.sql") + 1);
    const sql = MIGRATIONS[MIGRATION_FILES.indexOf(MIGRATION)];
    expect(sql).not.toMatch(/drop (table|function)|alter table public\.(maps|profiles|contacts|contact_\w+)\b|create policy|delete_my_account/i);
    expect(sql.match(/create or replace function public\.(\w+)/gi)).toEqual(["create or replace function public.update_map_data"]);

    // Base au niveau des contacts, avec une carte et des compteurs : tout reste valide, la carte s'écrit comme avant.
    const old = await openTestDb(migrationsUpTo("20261018120000_contacts.sql"));
    await old.addUsers(ALICE);
    await old.as(ALICE, "select public.create_my_profile('alice', 'Alice', '', 'members')");
    const [map] = await old.as<{ id: string; revision: string }>(ALICE, "select id, revision::text from public.create_map('C', $1)", [DOC]);
    await old.db.exec(sql);
    expect((await old.db.query("select action from public.rate_limits order by action")).rows).toEqual([
      { action: "handle_attempt" },
      { action: "profile_create" },
    ]);
    const written = await old.as<{ id: string }>(ALICE, "select id from public.update_map_data($1, $2, $3)", [map.id, DOC2, map.revision]);
    expect(written).toEqual([{ id: map.id }]);
    await old.db.close();
  }, 60_000);

  it("liste fermée des compteurs : les actions du partage acceptées", async () => {
    for (const action of ["map_share", "map_join", "map_change", "map_lock", "map_read", "map_state", "contact_change"]) {
      await setHits(ALICE, action, 1);
    }
    await expect(setHits(ALICE, "map_spam", 1)).rejects.toThrow(/rate_limits_action/);
  });
});

describe("tables du partage : aucun accès par l'API", () => {
  it("ni lecture ni écriture directe, pour les comptes connectés comme pour les visiteurs", async () => {
    const map = await sharedMap();
    await acceptLink(CAROL, await createLink(ALICE, map.id));
    await lock(BOB, map.id);
    expect(await count("map_link_uses")).toBe(1);
    for (const role of [ALICE, BOB, null]) {
      for (const table of ["map_members", "map_invitations", "map_links", "map_locks", "map_link_uses"]) {
        const column = table === "map_link_uses" ? "link_id" : "map_id";
        for (const sql of [`select * from public.${table}`, `delete from public.${table}`, `update public.${table} set ${column} = ${column}`]) {
          await expect(t.as(role, sql), `${role} ${sql}`).rejects.toThrow(/permission denied/);
        }
      }
      await expect(
        t.as(role, "insert into public.map_members (map_id, user_id, role) values ($1, $2, 'editor')", [map.id, CAROL]),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("les politiques des cartes ne changent pas : un membre ne lit, ne renomme ni ne supprime la ligne", async () => {
    const map = await sharedMap();
    expect(await t.as(BOB, "select * from public.maps where id = $1", [map.id])).toEqual([]);
    expect(await t.as(BOB, "update public.maps set name = 'Volée' where id = $1 returning id", [map.id])).toEqual([]);
    expect(await t.as(BOB, "delete from public.maps where id = $1 returning id", [map.id])).toEqual([]);
    expect(await t.as(BOB, "select public.set_map_cover($1, null) as ok", [map.id])).toEqual([{ ok: false }]);
    expect(await count("maps")).toBe(1);
    // Le propriétaire, lui, garde tous ses droits.
    expect(await t.as(ALICE, "update public.maps set name = 'Nouveau' where id = $1 returning name", [map.id])).toEqual([{ name: "Nouveau" }]);
  });

  it("fonctions réservées aux comptes connectés ; fonctions internes fermées à tous", async () => {
    for (const sql of [
      `public.invite_contact_to_map('${UNKNOWN}', '${UNKNOWN}', 'editor')`,
      `public.cancel_map_invitation('${UNKNOWN}')`,
      `public.revoke_map_link('${UNKNOWN}')`,
      `public.set_map_member_role('${UNKNOWN}', 'reader')`,
      `public.remove_map_member('${UNKNOWN}')`,
      `public.leave_shared_map('${UNKNOWN}')`,
      `public.release_map_lock('${UNKNOWN}')`,
    ]) {
      await expect(call(null, sql), sql).rejects.toThrow(/permission denied/);
      await expect(call("", sql), sql).rejects.toThrow(/sharing_not_authenticated/);
    }
    for (const sql of [
      `select * from public.answer_map_invitation('${UNKNOWN}', true)`,
      `select * from public.accept_map_link('${"a".repeat(64)}')`,
      `select * from public.preview_map_link('${"a".repeat(64)}')`,
      `select * from public.acquire_map_lock('${UNKNOWN}')`,
      `select * from public.open_shared_map('${UNKNOWN}')`,
      `select * from public.shared_map_state('${UNKNOWN}')`,
      `select * from public.create_map_link('${UNKNOWN}', 'reader', 1, 1)`,
    ]) {
      await expect(t.as(null, sql), sql).rejects.toThrow(/permission denied/);
      await expect(t.as("", sql), sql).rejects.toThrow(/sharing_not_authenticated/);
    }
    for (const sql of [
      "select * from public.maps_shared_with_me()",
      "select * from public.my_map_invitations()",
      "select * from public.my_map_shares()",
      "select * from public.my_map_locks()",
      "select * from public.my_map_link_uses()",
    ]) {
      await expect(t.as(null, sql), sql).rejects.toThrow(/permission denied/);
      expect(await t.as("", sql), sql).toEqual([]);
    }
    for (const sql of [
      "select public.map_sharing_role($1, $1)",
      "select public.map_sharing_uuid('x')",
      "select public.map_sharing_check_role('editor')",
      "select public.map_sharing_token_hash('x')",
      "select public.map_sharing_lock_map($1)",
      "select public.map_sharing_lock_user($1)",
      "select public.map_sharing_keep_profile($1)",
      "select public.map_sharing_take($1, 'map_change', 1, interval '1 day')",
      "select public.map_sharing_require_profile($1)",
      "select public.map_sharing_seats($1)",
      "select public.map_sharing_name($1, $1)",
      "select public.map_sharing_holder($1)",
      "select public.map_sharing_hold($1, $1)",
      "select public.map_sharing_join($1, $1, 'editor', 0)",
      "select public.map_sharing_usable_link('x', $1)",
    ]) {
      await expect(t.as(ALICE, sql, sql.includes("$1") ? [ALICE] : []), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("les fonctions SECURITY DEFINER du partage ont un search_path vide", async () => {
    const { rows } = await t.db.query<{ name: string; config: string[] | null }>(
      `select proname as name, proconfig as config from pg_proc
       where prosecdef and pronamespace = 'public'::regnamespace and (proname like '%map%' or proname like '%shar%')`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(24);
    for (const fn of rows) expect(fn.config, fn.name).toEqual(['search_path=""']);
  });
});

describe("invitation d'un contact", () => {
  it("le propriétaire invite un contact ; l'invité voit l'invitation, l'accepte et devient membre", async () => {
    const map = await newMap(ALICE, "Sahel");
    expect(await invite(ALICE, map.id, await contactRef(ALICE, "bob"), "reader")).toBe("invited");
    expect(await invitations(BOB)).toEqual([
      { id: expect.any(String), map_name: "Sahel", role: "reader", owner_handle: "alice", owner_display_name: "Nom alice" },
    ]);
    expect(await invitations(CAROL)).toEqual([]);
    expect((await shares(ALICE, map.id)).map((s) => [s.kind, s.handle, s.role])).toEqual([["invitation", "bob", "reader"]]);
    const [invitation] = await invitations(BOB);
    // Personne d'autre ne peut y répondre.
    expect(await answer(CAROL, invitation.id, true)).toEqual({ status: "not-found", map_id: null });
    expect(await answer(ALICE, invitation.id, true)).toEqual({ status: "not-found", map_id: null });
    expect(await answer(BOB, invitation.id, true)).toEqual({ status: "joined", map_id: map.id });
    expect(await invitations(BOB)).toEqual([]);
    expect(await sharedWithMe(BOB)).toEqual([
      { id: map.id, name: "Sahel", role: "reader", owner_handle: "alice", owner_display_name: "Nom alice" },
    ]);
    expect((await shares(ALICE)).map((s) => [s.kind, s.handle, s.role])).toEqual([["member", "bob", "reader"]]);
    expect(await answer(BOB, invitation.id, true)).toEqual({ status: "not-found", map_id: null });
  });

  it("refuser, annuler ; invitation échue introuvable", async () => {
    const map = await newMap(ALICE);
    const bob = await contactRef(ALICE, "bob");
    await invite(ALICE, map.id, bob);
    expect((await answer(BOB, (await invitations(BOB))[0].id, false)).status).toBe("refused");
    expect(await count("map_invitations")).toBe(0);
    await invite(ALICE, map.id, bob);
    const [sent] = await shares(ALICE, map.id);
    expect(await call(BOB, "public.cancel_map_invitation($1)", [sent.id])).toBe("not-found");
    expect(await call(ALICE, "public.cancel_map_invitation($1)", [sent.id])).toBe("cancelled");
    expect(await invitations(BOB)).toEqual([]);
    await invite(ALICE, map.id, bob);
    const [pending] = await invitations(BOB);
    await t.db.query("update public.map_invitations set expires_at = now() - interval '1 second'");
    expect(await invitations(BOB)).toEqual([]);
    expect(await shares(ALICE, map.id)).toEqual([]);
    expect((await answer(BOB, pending.id, true)).status).toBe("not-found");
    expect(await count("map_members")).toBe(0);
    // Une invitation échue est remplacée par la suivante.
    await invite(ALICE, map.id, bob);
    expect(await invite(ALICE, map.id, bob)).toBe("already-invited");
    expect(await t.db.query("select 1 from public.map_invitations where expires_at <= now()").then((r) => r.rows)).toEqual([]);
  });

  it("seuls le propriétaire et ses contacts : autre carte, autre contact, référence mal formée → not-found", async () => {
    const map = await newMap(ALICE);
    const bob = await contactRef(ALICE, "bob");
    expect(await invite(BOB, map.id, bob)).toBe("not-found");
    expect(await invite(ALICE, UNKNOWN, bob)).toBe("not-found");
    expect(await invite(ALICE, map.id, UNKNOWN)).toBe("not-found");
    expect(await invite(ALICE, "pas un uuid", bob)).toBe("not-found");
    // Contact de Bob avec Carol : Alice ne peut pas se servir de sa référence.
    await befriend(BOB, CAROL, "carol", "bob");
    expect(await invite(ALICE, map.id, await contactRef(BOB, "carol"))).toBe("not-found");
    await expect(invite(ALICE, map.id, bob, "owner")).rejects.toThrow(/sharing_invalid/);
    await expect(invite(ALICE, map.id, bob, "x".repeat(100_000))).rejects.toThrow(/sharing_invalid/);
    expect(await count("map_invitations")).toBe(0);
  });

  it("profil exigé du propriétaire ; déjà membre ; carte pleine ; invité saturé", async () => {
    const map = await sharedMap();
    const bob = await contactRef(ALICE, "bob");
    expect(await invite(ALICE, map.id, bob)).toBe("already-member");
    const other = await newMap(ALICE);
    // 50 places : membres et invitations en attente (comptes créés par le propriétaire de la base).
    const { rows } = await t.db.query<{ id: string }>(
      `with ids as (select gen_random_uuid() as id, i from generate_series(1, $1::int) as i),
       u as (insert into auth.users (id) select id from ids returning id)
       insert into public.profiles (user_id, handle, display_name) select ids.id, 'm' || lpad(ids.i::text, 4, '0'), 'M' from ids join u using (id)
       returning user_id as id`,
      [MAX_MAP_SEATS + MAX_PENDING_INVITATIONS],
    );
    const seats = rows.slice(0, MAX_MAP_SEATS);
    await t.db.query(
      "insert into public.map_members (map_id, user_id, role) select $1, unnest($2::uuid[]), 'reader'",
      [other.id, seats.slice(0, MAX_MAP_SEATS - 1).map((r) => r.id)],
    );
    await t.db.query("insert into public.map_invitations (map_id, invitee_id, role, expires_at) values ($1, $2, 'reader', now() + interval '1 day')", [
      other.id,
      seats[MAX_MAP_SEATS - 1].id,
    ]);
    expect(await invite(ALICE, other.id, bob)).toBe("map-full");
    // Bob a déjà 100 invitations en attente (sur des cartes de comptes créés ici).
    await t.db.query("delete from public.map_invitations where map_id = $1", [other.id]);
    await t.db.query(
      `with owners as (select unnest($1::uuid[]) as id),
       m as (insert into public.maps (user_id, name, data) select id, 'x', $3::jsonb from owners returning id)
       insert into public.map_invitations (map_id, invitee_id, role, expires_at) select id, $2, 'reader', now() + interval '1 day' from m`,
      [rows.slice(0, MAX_PENDING_INVITATIONS).map((r) => r.id), BOB, DOC],
    );
    expect(await invite(ALICE, other.id, bob)).toBe("unavailable");
    await t.db.query("delete from public.profiles where user_id = $1", [ALICE]);
    await expect(invite(ALICE, other.id, bob)).rejects.toThrow(/sharing_no_profile|not-found/);
  }, 30_000);

  it("100 partages par jour, comptés avant de chercher la carte ou le contact", async () => {
    const map = await newMap(ALICE);
    await setHits(ALICE, "map_share", SHARES_PER_DAY - 1);
    expect(await invite(ALICE, UNKNOWN, UNKNOWN)).toBe("not-found");
    expect(await hits(ALICE, "map_share")).toBe(SHARES_PER_DAY);
    await expect(invite(ALICE, map.id, await contactRef(ALICE, "bob"))).rejects.toThrow(/sharing_rate_limited/);
    await expect(createLink(ALICE, map.id)).rejects.toThrow(/sharing_rate_limited/);
  });
});

describe("liens d'invitation", () => {
  it("jeton fort montré une fois : seule son empreinte SHA-256 est gardée", async () => {
    const map = await newMap(ALICE);
    const token = await createLink(ALICE, map.id, "editor", 3, 48);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await createLink(ALICE, map.id)).not.toBe(token);
    const { rows } = await t.db.query<{ hash: string; plain: boolean }>(
      "select encode(token_hash, 'hex') as hash, encode(token_hash, 'hex') = $1 as plain from public.map_links order by created_at limit 1",
      [token],
    );
    expect(rows[0].plain).toBe(false);
    const expected = (await t.db.query<{ h: string }>("select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h", [token])).rows[0].h;
    expect((await t.db.query<{ hash: string }>("select encode(token_hash, 'hex') as hash from public.map_links")).rows.map((r) => r.hash)).toContain(
      expected,
    );
    // La liste du propriétaire ne montre jamais le jeton.
    const links = (await shares(ALICE, map.id)).filter((s) => s.kind === "link");
    expect(links).toHaveLength(2);
    expect(JSON.stringify(links)).not.toContain(token);
    expect(links[0]).toMatchObject({ role: "editor", uses: 0, max_uses: 3, handle: null });
  });

  it("aperçu, puis acceptation : membre avec le rôle du lien, un usage consommé", async () => {
    const map = await newMap(ALICE, "Arctique");
    const token = await createLink(ALICE, map.id, "editor", 2);
    expect(await preview(CAROL, token)).toEqual([
      { map_name: "Arctique", role: "editor", owner_handle: "alice", owner_display_name: "Nom alice", my_role: null },
    ]);
    expect(await acceptLink(CAROL, token)).toEqual({ status: "joined", map_id: map.id });
    expect((await preview(CAROL, token))[0].my_role).toBe("editor");
    expect(await acceptLink(CAROL, token)).toEqual({ status: "already-member", map_id: map.id });
    expect(await acceptLink(ALICE, token)).toEqual({ status: "owner", map_id: map.id });
    expect((await shares(ALICE, map.id)).find((s) => s.kind === "link")).toMatchObject({ uses: 1, max_uses: 2 });
    expect(await acceptLink(BOB, token)).toEqual({ status: "joined", map_id: map.id });
    // Épuisé : même réponse qu'un lien inconnu, et il disparaît de la liste.
    expect(await count("map_links")).toBe(1);
    expect((await shares(ALICE, map.id)).filter((s) => s.kind === "link")).toEqual([]);
    await t.db.query("delete from public.map_members where user_id = $1", [BOB]);
    expect(await acceptLink(BOB, token)).toEqual({ status: "not-found", map_id: null });
    expect(await preview(BOB, token)).toEqual([]);
  });

  it("lien inconnu, échu, révoqué, mal formé : la même réponse", async () => {
    const map = await newMap(ALICE);
    const expired = await createLink(ALICE, map.id);
    await t.db.query("update public.map_links set expires_at = now() - interval '1 second'");
    const revoked = await createLink(ALICE, map.id);
    const revokedId = (await shares(ALICE, map.id)).find((s) => s.kind === "link")!.id;
    expect(await call(BOB, "public.revoke_map_link($1)", [revokedId])).toBe("not-found");
    expect(await call(ALICE, "public.revoke_map_link($1)", [revokedId])).toBe("revoked");
    for (const token of [expired, revoked, "f".repeat(64), "F".repeat(64), "x", "a".repeat(65), "a".repeat(100_000)]) {
      expect(await acceptLink(CAROL, token), token.slice(0, 8)).toEqual({ status: "not-found", map_id: null });
      expect(await preview(CAROL, token)).toEqual([]);
    }
    expect(await count("map_members")).toBe(0);
  });

  it("profil exigé pour rejoindre ; bornes des liens ; 10 liens actifs par carte ; carte d'un autre", async () => {
    const map = await newMap(ALICE);
    const token = await createLink(ALICE, map.id);
    await expect(acceptLink(DAVE, token)).rejects.toThrow(/sharing_no_profile/);
    // L'aperçu reste possible sans profil (il dit d'en créer un).
    expect(await preview(DAVE, token)).toHaveLength(1);
    for (const [uses, hours] of [
      [0, 24],
      [MAX_LINK_USES + 1, 24],
      [1, 0],
      [1, MAX_LINK_HOURS + 1],
    ]) {
      await expect(createLink(ALICE, map.id, "reader", uses, hours)).rejects.toThrow(/sharing_invalid/);
    }
    await expect(createLink(ALICE, map.id, "owner")).rejects.toThrow(/sharing_invalid/);
    // Carte d'un autre compte, carte inconnue, référence mal formée : la même réponse, sans jeton.
    for (const id of [map.id, UNKNOWN]) expect(await createLinkRow(BOB, id)).toEqual({ status: "not-found", token: null });
    expect(await createLinkRow(ALICE, "x")).toEqual({ status: "not-found", token: null });
    for (let i = 1; i < MAX_ACTIVE_LINKS; i += 1) await createLink(ALICE, map.id, "reader", MAX_LINK_USES, MAX_LINK_HOURS);
    expect(await createLinkRow(ALICE, map.id)).toEqual({ status: "links-full", token: null });
    // Un lien échu libère sa place.
    await t.db.query("update public.map_links set expires_at = now() - interval '1 second' where ctid = (select ctid from public.map_links limit 1)");
    await createLink(ALICE, map.id);
    expect(await count("map_links")).toBe(MAX_ACTIVE_LINKS);
  });

  it("un lien ne sert qu'une fois par compte : un membre retiré ne revient pas par le lien déjà utilisé", async () => {
    const map = await newMap(ALICE);
    const token = await createLink(ALICE, map.id, "editor", 5, 24);
    expect(await acceptLink(CAROL, token)).toEqual({ status: "joined", map_id: map.id });
    expect(await t.as(CAROL, "select map_id from public.my_map_link_uses()")).toEqual([{ map_id: map.id }]);
    // Encore membre : le lien répond « déjà membre », sans consommer d'usage.
    expect(await acceptLink(CAROL, token)).toEqual({ status: "already-member", map_id: map.id });
    const member = (await shares(ALICE, map.id)).find((s) => s.kind === "member")!;
    expect(await call(ALICE, "public.remove_map_member($1)", [member.id])).toBe("removed");
    // Retirée : le même lien répond comme un lien inconnu (aperçu et acceptation), rien n'est consommé.
    expect(await preview(CAROL, token)).toEqual([]);
    expect(await acceptLink(CAROL, token)).toEqual({ status: "not-found", map_id: null });
    expect(await sharedWithMe(CAROL)).toEqual([]);
    expect(await lock(CAROL, map.id)).toMatchObject({ status: "not-found" });
    expect((await shares(ALICE, map.id)).find((s) => s.kind === "link")).toMatchObject({ uses: 1, max_uses: 5 });
    // Le lien sert toujours aux autres comptes ; un autre lien du propriétaire fait revenir Carol.
    expect(await acceptLink(BOB, token)).toEqual({ status: "joined", map_id: map.id });
    expect(await acceptLink(CAROL, await createLink(ALICE, map.id, "reader"))).toEqual({ status: "joined", map_id: map.id });
    expect((await sharedWithMe(CAROL))[0].role).toBe("reader");
    // Révoquer le lien efface ses usages.
    const linkIds = (await shares(ALICE, map.id)).filter((s) => s.kind === "link").map((s) => s.id);
    for (const id of linkIds) expect(await call(ALICE, "public.revoke_map_link($1)", [id])).toBe("revoked");
    expect(await count("map_link_uses")).toBe(0);
  });

  it("un éditeur passé lecteur qui quitte la carte ne repasse pas éditeur par le lien déjà utilisé", async () => {
    const map = await newMap(ALICE);
    const token = await createLink(ALICE, map.id, "editor", 5, MAX_LINK_HOURS);
    expect(await acceptLink(CAROL, token)).toEqual({ status: "joined", map_id: map.id });
    const member = (await shares(ALICE, map.id)).find((s) => s.kind === "member")!;
    expect(await call(ALICE, "public.set_map_member_role($1, 'reader')", [member.id])).toBe("updated");
    expect(await lock(CAROL, map.id)).toMatchObject({ status: "read-only" });
    expect(await call(CAROL, "public.leave_shared_map($1)", [map.id])).toBe("left");
    expect(await acceptLink(CAROL, token)).toEqual({ status: "not-found", map_id: null });
    expect(await sharedWithMe(CAROL)).toEqual([]);
    expect((await shares(ALICE, map.id)).find((s) => s.kind === "link")).toMatchObject({ uses: 1 });
    // Supprimer puis recréer son profil ne rouvre pas le lien.
    await t.as(CAROL, "delete from public.profiles where user_id = $1", [CAROL]);
    expect(await profile(CAROL, "carol")).toBe("created");
    expect(await acceptLink(CAROL, token)).toEqual({ status: "not-found", map_id: null });
  });

  it("création de lien refusée (carte d'un autre, liens pleins) : l'essai reste compté", async () => {
    const other = await newMap(BOB);
    for (let i = 0; i < 3; i += 1) expect((await createLinkRow(ALICE, other.id)).status).toBe("not-found");
    expect(await hits(ALICE, "map_share")).toBe(3);
    await setHits(ALICE, "map_share", SHARES_PER_DAY - 1);
    expect((await createLinkRow(ALICE, UNKNOWN)).status).toBe("not-found");
    await expect(createLinkRow(ALICE, other.id)).rejects.toThrow(/sharing_rate_limited/);
    // Liens pleins : compté aussi.
    await t.db.exec("delete from public.rate_limits");
    const map = await newMap(ALICE);
    for (let i = 0; i < MAX_ACTIVE_LINKS; i += 1) await createLink(ALICE, map.id);
    expect((await createLinkRow(ALICE, map.id)).status).toBe("links-full");
    expect(await hits(ALICE, "map_share")).toBe(MAX_ACTIVE_LINKS + 1);
  });

  it("60 essais par jour (aperçu et acceptation), comptés avant de chercher le jeton ; jeton mal formé non compté", async () => {
    const map = await newMap(ALICE);
    const token = await createLink(ALICE, map.id);
    await acceptLink(CAROL, "pas un jeton");
    expect(await hits(CAROL, "map_join")).toBe(0);
    await preview(CAROL, "f".repeat(64));
    await acceptLink(CAROL, "e".repeat(64));
    expect(await hits(CAROL, "map_join")).toBe(2);
    await setHits(CAROL, "map_join", LINK_ATTEMPTS_PER_DAY);
    await expect(acceptLink(CAROL, token)).rejects.toThrow(/sharing_rate_limited/);
    await expect(preview(CAROL, token)).rejects.toThrow(/sharing_rate_limited/);
  });

  it("200 cartes partagées au plus par compte ; une invitation en attente compte pour la place du lien", async () => {
    const map = await newMap(ALICE);
    await t.db.query(
      `with m as (insert into public.maps (user_id, name, data) select $1, 'x', $2::jsonb from generate_series(1, $3) returning id)
       insert into public.map_members (map_id, user_id, role) select id, $4, 'reader' from m`,
      [BOB, DOC, MAX_SHARED_MAPS, CAROL],
    );
    expect(await acceptLink(CAROL, await createLink(ALICE, map.id))).toEqual({ status: "memberships-full", map_id: null });
    await t.db.query("delete from public.maps where user_id = $1", [BOB]);
    // Carte pleine sauf la place réservée à l'invitation de Bob : le lien la lui donne.
    const full = await newMap(ALICE);
    await invite(ALICE, full.id, await contactRef(ALICE, "bob"));
    const { rows } = await t.db.query<{ id: string }>(
      `with ids as (select gen_random_uuid() as id, i from generate_series(1, $1::int) as i),
       u as (insert into auth.users (id) select id from ids returning id)
       insert into public.profiles (user_id, handle, display_name) select ids.id, 'p' || lpad(ids.i::text, 4, '0'), 'P' from ids join u using (id)
       returning user_id as id`,
      [MAX_MAP_SEATS - 1],
    );
    await t.db.query("insert into public.map_members (map_id, user_id, role) select $1, unnest($2::uuid[]), 'reader'", [
      full.id,
      rows.map((r) => r.id),
    ]);
    const link = await createLink(ALICE, full.id);
    expect(await acceptLink(CAROL, link)).toEqual({ status: "map-full", map_id: null });
    expect(await acceptLink(BOB, link)).toEqual({ status: "joined", map_id: full.id });
    expect(await invitations(BOB)).toEqual([]);
  }, 30_000);
});

describe("membres : rôle, retrait, départ", () => {
  it("le propriétaire change le rôle et retire un membre ; personne d'autre", async () => {
    const map = await sharedMap("editor");
    const [member] = await shares(ALICE, map.id);
    expect(await call(BOB, "public.set_map_member_role($1, 'reader')", [member.id])).toBe("not-found");
    expect(await call(ALICE, "public.set_map_member_role($1, 'reader')", [member.id])).toBe("updated");
    expect((await sharedWithMe(BOB))[0].role).toBe("reader");
    await expect(call(ALICE, "public.set_map_member_role($1, 'owner')", [member.id])).rejects.toThrow(/sharing_invalid/);
    expect(await call(BOB, "public.remove_map_member($1)", [member.id])).toBe("not-found");
    expect(await call(ALICE, "public.remove_map_member($1)", [member.id])).toBe("removed");
    expect(await sharedWithMe(BOB)).toEqual([]);
    expect(await call(ALICE, "public.remove_map_member($1)", [member.id])).toBe("not-found");
  });

  it("un membre quitte la carte ; le propriétaire ne « quitte » pas la sienne", async () => {
    const map = await sharedMap();
    expect(await call(ALICE, "public.leave_shared_map($1)", [map.id])).toBe("not-found");
    expect(await call(BOB, "public.leave_shared_map($1)", [map.id])).toBe("left");
    expect(await sharedWithMe(BOB)).toEqual([]);
    expect(await call(BOB, "public.leave_shared_map($1)", [map.id])).toBe("not-found");
    expect(await count("maps")).toBe(1);
  });

  it("300 opérations par jour", async () => {
    const map = await sharedMap();
    await setHits(BOB, "map_change", SHARE_CHANGES_PER_DAY);
    await expect(call(BOB, "public.leave_shared_map($1)", [map.id])).rejects.toThrow(/sharing_rate_limited/);
    expect(await sharedWithMe(BOB)).toHaveLength(1);
  });
});

describe("lecture d'une carte partagée", () => {
  it("propriétaire et membres la lisent (jamais d'identifiant de compte) ; les autres non", async () => {
    const map = await sharedMap("reader");
    const [read] = await t.as<Row>(BOB, "select * from public.open_shared_map($1)", [map.id]);
    expect(read).toMatchObject({ id: map.id, name: "Carte", role: "reader", owner_handle: "alice", owner_display_name: "Nom alice", data: BLANK_DOC });
    expect(Object.keys(read).toSorted()).toEqual(
      ["data", "id", "name", "owner_display_name", "owner_handle", "revision", "role", "updated_at"].toSorted(),
    );
    expect(JSON.stringify(read)).not.toContain(ALICE);
    expect((await t.as<Row>(ALICE, "select role from public.open_shared_map($1)", [map.id]))[0].role).toBe("owner");
    for (const id of [map.id, UNKNOWN, "x"]) {
      expect(await t.as(CAROL, "select * from public.open_shared_map($1)", [id])).toEqual([]);
      expect(await state(CAROL, id)).toEqual([]);
    }
    expect(await state(BOB, map.id)).toEqual([
      { role: "reader", revision: map.revision, lock_mine: false, lock_held: false, lock_holder_name: null },
    ]);
    for (const fn of ["maps_shared_with_me()", "my_map_invitations()", "my_map_shares()", "my_map_locks()"]) {
      for (const user of [ALICE, BOB]) expect(JSON.stringify(await t.as(user, `select * from public.${fn}`))).not.toMatch(new RegExp(`${ALICE}|${BOB}`));
    }
  });

  it("1 200 lectures de l'état par heure, comptées même pour une carte inaccessible", async () => {
    const map = await sharedMap();
    await state(CAROL, map.id);
    await state(CAROL, UNKNOWN);
    expect(await hits(CAROL, "map_state")).toBe(2);
    // Référence mal formée : refusée sans être comptée (son refus ne dit rien).
    await state(CAROL, "x");
    expect(await hits(CAROL, "map_state")).toBe(2);
    await setHits(BOB, "map_state", SHARED_STATES_PER_HOUR);
    await expect(state(BOB, map.id)).rejects.toThrow(/sharing_rate_limited/);
    // La lecture complète a son propre compteur.
    expect(await t.as(BOB, "select id from public.open_shared_map($1)", [map.id])).toEqual([{ id: map.id }]);
  });

  it("600 lectures complètes par heure", async () => {
    const map = await sharedMap();
    await setHits(BOB, "map_read", SHARED_READS_PER_HOUR);
    await expect(t.as(BOB, "select * from public.open_shared_map($1)", [map.id])).rejects.toThrow(/sharing_rate_limited/);
    // L'état (rafraîchissement périodique) reste lisible.
    expect(await state(BOB, map.id)).toHaveLength(1);
  });
});

describe("verrou d'édition et écriture du contenu", () => {
  it("le propriétaire écrit sans verrou tant que personne ne le tient (comme avant)", async () => {
    const map = await sharedMap();
    expect(await write(ALICE, map.id, map.revision)).toHaveLength(1);
  });

  it("le propriétaire qui écrit hors de l'éditeur coopératif prend le verrou, seulement si la carte a des membres", async () => {
    // Carte sans membre : jamais de verrou, comme avant le partage.
    const solo = await newMap(ALICE);
    expect(await write(ALICE, solo.id, solo.revision)).toHaveLength(1);
    expect(await count("map_locks")).toBe(0);

    const map = await sharedMap("editor");
    const [written] = await write(ALICE, map.id, map.revision);
    expect(await t.as(ALICE, "select map_id from public.my_map_locks()")).toEqual([{ map_id: map.id }]);
    const { rows } = await t.db.query<{ lease: number }>(
      "select extract(epoch from expires_at - now())::int as lease from public.map_locks where map_id = $1",
      [map.id],
    );
    expect(rows[0].lease * 1000).toBe(LOCK_LEASE_MS);
    // Les membres voient qu'il la modifie et ne prennent pas la main pendant son bail.
    expect((await state(BOB, map.id))[0]).toMatchObject({ lock_held: true, lock_mine: false, lock_holder_name: "Nom alice" });
    expect(await lock(BOB, map.id)).toMatchObject({ status: "held", holder_name: "Nom alice" });
    await expect(write(BOB, map.id, written.revision)).rejects.toThrow(/maps_locked/);
    // Chaque écriture qui change le contenu renouvelle le bail ; l'éditeur coopératif du propriétaire
    // le reprend tel quel.
    const [again] = await write(ALICE, map.id, written.revision, DOC);
    expect((await lock(ALICE, map.id)).status).toBe("acquired");
    expect(await count("map_locks")).toBe(1);
    // Échu (le propriétaire a cessé d'écrire) : un éditeur le reprend, et le propriétaire n'écrit plus.
    await expireLock(map.id);
    expect((await lock(BOB, map.id)).status).toBe("acquired");
    await expect(write(ALICE, map.id, again.revision)).rejects.toThrow(/maps_locked/);
    expect(await t.as(BOB, "select map_id from public.my_map_locks()")).toEqual([{ map_id: map.id }]);
    // Une écriture refusée ne prend jamais le verrou.
    await release(BOB, map.id);
    await expect(write(ALICE, map.id, map.revision)).rejects.toThrow(/maps_conflict/);
    expect(await count("map_locks")).toBe(0);
  });

  it("le propriétaire qui renvoie le contenu tel quel (ouverture depuis son espace) ne prend ni ne heurte le verrou", async () => {
    const map = await sharedMap("editor");
    // Personne ne tient le verrou : même version, aucun verrou pris.
    expect(await write(ALICE, map.id, map.revision, DOC)).toEqual([{ id: map.id, revision: map.revision }]);
    expect(await count("map_locks")).toBe(0);
    expect((await state(BOB, map.id))[0]).toMatchObject({ lock_held: false });
    // Pendant le bail de Bob : le contenu tel quel passe sans rien changer, une modification est refusée.
    expect((await lock(BOB, map.id)).status).toBe("acquired");
    expect(await write(ALICE, map.id, map.revision, DOC)).toEqual([{ id: map.id, revision: map.revision }]);
    await expect(write(ALICE, map.id, map.revision, DOC2)).rejects.toThrow(/maps_locked/);
    expect(await t.as(BOB, "select map_id from public.my_map_locks()")).toEqual([{ map_id: map.id }]);
    const [written] = await write(BOB, map.id, map.revision);
    expect(written.revision).not.toBe(map.revision);
    // Version périmée et contenu identique à l'ancien : refusée (il diffère du contenu enregistré).
    await expect(write(ALICE, map.id, map.revision, DOC)).rejects.toThrow(/maps_locked/);
    // Contenu tel quel mais version périmée, sans verrou : conflit, comme avant.
    await release(BOB, map.id);
    await expect(write(ALICE, map.id, map.revision, DOC2)).rejects.toThrow(/maps_conflict/);
    expect(await count("map_locks")).toBe(0);
  });

  it("un éditeur doit tenir le verrou ; pendant son bail, personne d'autre n'écrit, pas même le propriétaire", async () => {
    const map = await sharedMap("editor");
    await expect(write(BOB, map.id, map.revision)).rejects.toThrow(/maps_locked/);
    expect(await lock(BOB, map.id)).toMatchObject({ status: "acquired", holder_name: null });
    const [written] = await write(BOB, map.id, map.revision);
    expect(written.id).toBe(map.id);
    await expect(write(ALICE, map.id, written.revision, DOC)).rejects.toThrow(/maps_locked/);
    expect(await lock(ALICE, map.id)).toMatchObject({ status: "held", holder_name: "Nom bob" });
    expect(await state(ALICE, map.id)).toEqual([
      { role: "owner", revision: written.revision, lock_mine: false, lock_held: true, lock_holder_name: "Nom bob" },
    ]);
    expect((await state(BOB, map.id))[0]).toMatchObject({ lock_mine: true, lock_held: true, lock_holder_name: null });
    // Contrôle de version conservé pour l'éditeur.
    await expect(write(BOB, map.id, map.revision)).rejects.toThrow(/maps_conflict/);
    // Libéré : le propriétaire peut le prendre.
    expect(await release(ALICE, map.id)).toBe(false);
    expect(await release(BOB, map.id)).toBe(true);
    expect(await lock(ALICE, map.id)).toMatchObject({ status: "acquired" });
    await expect(write(BOB, map.id, written.revision)).rejects.toThrow(/maps_locked/);
    expect(await write(ALICE, map.id, written.revision)).toHaveLength(1);
  });

  it("bail renouvelé par son titulaire, repris par un autre éditeur une fois échu", async () => {
    const map = await sharedMap("editor");
    const first = await lock(ALICE, map.id);
    const renewed = await lock(ALICE, map.id);
    expect(renewed.status).toBe("acquired");
    expect(new Date(renewed.expires_at!).getTime()).toBeGreaterThanOrEqual(new Date(first.expires_at!).getTime());
    expect((await lock(BOB, map.id)).status).toBe("held");
    await expireLock(map.id);
    expect(await state(BOB, map.id)).toMatchObject([{ lock_held: false }]);
    expect((await lock(BOB, map.id)).status).toBe("acquired");
    await expect(write(ALICE, map.id, map.revision)).rejects.toThrow(/maps_locked/);
    expect(await t.as(ALICE, "select map_id from public.my_map_locks()")).toEqual([]);
    expect(await t.as(BOB, "select map_id from public.my_map_locks()")).toEqual([{ map_id: map.id }]);
  });

  it("un lecteur ne prend jamais le verrou et n'écrit jamais ; un non-membre ne voit rien", async () => {
    const map = await sharedMap("reader");
    expect(await lock(BOB, map.id)).toEqual({ status: "read-only", holder_name: null, expires_at: null });
    await expect(write(BOB, map.id, map.revision)).rejects.toThrow(/maps_locked/);
    expect(await lock(CAROL, map.id)).toEqual({ status: "not-found", holder_name: null, expires_at: null });
    expect(await lock(CAROL, "x")).toMatchObject({ status: "not-found" });
    expect(await write(CAROL, map.id, map.revision)).toEqual([]);
    expect(await revisionOf(map.id)).toBe(map.revision);
  });

  it("passer lecteur ou être retiré fait perdre le verrou", async () => {
    const map = await sharedMap("editor");
    await lock(BOB, map.id);
    const [member] = await shares(ALICE, map.id);
    await call(ALICE, "public.set_map_member_role($1, 'reader')", [member.id]);
    expect(await count("map_locks")).toBe(0);
    await call(ALICE, "public.set_map_member_role($1, 'editor')", [member.id]);
    await lock(BOB, map.id);
    await call(ALICE, "public.remove_map_member($1)", [member.id]);
    expect(await count("map_locks")).toBe(0);
    expect(await write(BOB, map.id, map.revision)).toEqual([]);
  });

  it("durées : bail de deux minutes, invitation de trente jours (mêmes valeurs que l'application)", async () => {
    const map = await sharedMap();
    await lock(BOB, map.id);
    const { rows } = await t.db.query<{ lease: number }>("select extract(epoch from expires_at - acquired_at)::int as lease from public.map_locks");
    expect(rows[0].lease * 1000).toBe(LOCK_LEASE_MS);
    const other = await newMap(ALICE);
    await invite(ALICE, other.id, await contactRef(ALICE, "bob"));
    const days = await t.db.query<{ days: number }>("select round(extract(epoch from expires_at - created_at) / 86400)::int as days from public.map_invitations");
    expect(days.rows[0].days).toBe(INVITATION_DAYS);
  });

  it("l'écriture d'un éditeur compte dans l'espace du propriétaire (quota inchangé)", async () => {
    const map = await sharedMap("editor");
    const other = await newMap(ALICE);
    await t.db.query("update public.maps set data_bytes = 50000000 where id = $1", [other.id]);
    await lock(BOB, map.id);
    await expect(write(BOB, map.id, map.revision)).rejects.toThrow(/maps_quota_exceeded/);
    expect(await revisionOf(map.id)).toBe(map.revision);
  });

  it("600 appels de verrou par heure", async () => {
    const map = await sharedMap();
    await setHits(BOB, "map_lock", LOCK_CALLS_PER_HOUR);
    await expect(lock(BOB, map.id)).rejects.toThrow(/sharing_rate_limited/);
  });
});

describe("verrous : un blocage ou une suppression de profil simultanés ne laissent rien derrière eux", () => {
  /** Positions de `needles` dans le corps de la fonction `fn`, qui doivent toutes s'y trouver, dans cet ordre. */
  const expectOrder = (fn: string, needles: string[]) => {
    const sql = MIGRATIONS[MIGRATION_FILES.indexOf(MIGRATION)];
    const body = sql.slice(sql.indexOf(`create function public.${fn}(`), sql.indexOf(`comment on function public.${fn}(`));
    const positions = needles.map((needle) => {
      expect(body, `${fn} : ${needle}`).toContain(needle);
      return body.indexOf(needle);
    });
    expect(positions, fn).toEqual(positions.toSorted((a, b) => a - b));
  };

  // Le blocage (contacts_block) ne prend que le verrou du couple, et son déclencheur ne voit pas une
  // entrée non validée : l'entrée doit donc prendre ce verrou avant d'être écrite, et relire le
  // blocage après. Le verrou de la carte vient après celui du couple (une invitation tient la ligne
  // du contact, que le blocage attend, puis attend la carte : sinon, cycle) ; le profil, après le
  // couple et avant tout le reste (la suppression du profil prend ses partages après le profil).
  it("répondre à une invitation : couple, profil, carte, compte, puis relecture du blocage", () => {
    expectOrder("answer_map_invitation", [
      "perform public.contacts_lock_pair(v_owner, v_uid);",
      "public.map_sharing_keep_profile(v_owner)",
      "perform public.map_sharing_lock_map(v_map);",
      "perform public.map_sharing_lock_user(v_uid);",
      "not public.contacts_blocked_either(m.user_id, v_uid)",
      "public.map_sharing_join(",
    ]);
  });

  it("accepter un lien : couple, profil, carte, compte, ligne du lien, puis relecture du blocage", () => {
    expectOrder("accept_map_link", [
      "perform public.contacts_lock_pair(v_owner, v_uid);",
      "public.map_sharing_keep_profile(v_owner)",
      "perform public.map_sharing_lock_map(v_map);",
      "perform public.map_sharing_lock_user(v_uid);",
      "for update;",
      "public.map_sharing_usable_link(p_token, v_uid) is distinct from v_link",
      "public.map_sharing_join(",
    ]);
  });

  it("inviter et créer un lien gardent le profil du propriétaire avant tout autre verrou", () => {
    expectOrder("invite_contact_to_map", [
      "public.map_sharing_role(v_map, v_uid) is distinct from 'owner'",
      "public.map_sharing_keep_profile(v_uid)",
      "for key share of c;",
      "perform public.map_sharing_lock_map(v_map);",
      "perform public.map_sharing_lock_user(v_target);",
      "insert into public.map_invitations",
    ]);
    expectOrder("create_map_link", [
      "public.map_sharing_role(v_map, v_uid) is distinct from 'owner'",
      "public.map_sharing_keep_profile(v_uid)",
      "perform public.map_sharing_lock_map(v_map);",
      "insert into public.map_links",
    ]);
  });

  it("le profil du propriétaire n'existe plus au moment de le garder : « not-found », rien n'est écrit", async () => {
    const map = await newMap(ALICE);
    expect(await invite(ALICE, map.id, await contactRef(ALICE, "bob"))).toBe("invited");
    const token = await createLink(ALICE, map.id);
    const [invitation] = await invitations(BOB);
    // État d'une suppression validée entre la lecture du propriétaire et le verrou : ses déclencheurs
    // n'ont pas encore eu d'effet visible par cette transaction.
    await t.db.exec(`
      set session_replication_role = replica;
      delete from public.profiles where user_id = '${ALICE}';
      set session_replication_role = default;
    `);
    expect(await answer(BOB, invitation.id, true)).toEqual({ status: "not-found", map_id: null });
    expect(await acceptLink(BOB, token)).toEqual({ status: "not-found", map_id: null });
    expect(await count("map_members")).toBe(0);
    expect(await count("map_link_uses")).toBe(0);
  });
});

describe("blocages, profils et comptes supprimés", () => {
  it("un blocage retire chacun des cartes de l'autre et supprime les invitations entre eux", async () => {
    await sharedMap();
    const bobMap = await newMap(BOB);
    await invite(BOB, bobMap.id, await contactRef(BOB, "alice"));
    expect(await call(BOB, "public.block_member('handle', 'alice')")).toBe("blocked");
    expect(await sharedWithMe(BOB)).toEqual([]);
    expect(await invitations(ALICE)).toEqual([]);
    expect(await count("map_members")).toBe(0);
    expect(await count("map_invitations")).toBe(0);
  });

  it("un contact retiré supprime les invitations en attente entre les deux, dans les deux sens ; les membres restent", async () => {
    const joined = await sharedMap("reader");
    const aliceMap = await newMap(ALICE, "Invitation d'Alice");
    const bobMap = await newMap(BOB, "Invitation de Bob");
    expect(await invite(ALICE, aliceMap.id, await contactRef(ALICE, "bob"))).toBe("invited");
    expect(await invite(BOB, bobMap.id, await contactRef(BOB, "alice"))).toBe("invited");
    const [pending] = await invitations(BOB);
    // Une invitation d'un autre couple n'est pas touchée.
    await befriend(ALICE, CAROL, "carol", "alice");
    expect(await invite(ALICE, aliceMap.id, await contactRef(ALICE, "carol"))).toBe("invited");

    expect(await call(BOB, "public.remove_contact($1)", [await contactRef(BOB, "alice")])).toBe("removed");
    // Bob se masque et change d'identité : Alice ne le suit plus dans ses invitations, et inversement.
    await call(BOB, "public.update_my_profile('newbob', 'Nouveau Bob', '', 'contacts')");
    expect((await shares(ALICE, aliceMap.id)).map((r) => [r.kind, r.handle])).toEqual([["invitation", "carol"]]);
    expect(await invitations(BOB)).toEqual([]);
    expect(await invitations(ALICE)).toEqual([]);
    expect(await answer(BOB, pending.id, true)).toEqual({ status: "not-found", map_id: null });
    expect((await invitations(CAROL)).map((i) => i.map_name)).toEqual(["Invitation d'Alice"]);
    // Bob reste membre de la carte qu'il avait rejointe.
    expect((await sharedWithMe(BOB)).map((m) => m.id)).toEqual([joined.id]);
    const { rows } = await t.db.query<{ ok: boolean }>(
      "select has_function_privilege('authenticated', 'public.map_sharing_on_contact_delete()', 'execute') or has_function_privilege('anon', 'public.map_sharing_on_contact_delete()', 'execute') as ok",
    );
    expect(rows[0].ok).toBe(false);
  });

  it("une invitation sans contact (retrait simultané) n'est montrée à personne et ne sert plus", async () => {
    const map = await newMap(ALICE, "Invitation d'Alice");
    expect(await invite(ALICE, map.id, await contactRef(ALICE, "bob"))).toBe("invited");
    // Le contact disparaît sans passer par le déclencheur (comme une invitation écrite juste après
    // un retrait simultané) : l'invitation subsiste en base.
    await t.db.exec("set session_replication_role = replica");
    await t.db.query("delete from public.contacts");
    await t.db.exec("set session_replication_role = default");
    expect(await count("map_invitations")).toBe(1);
    const [{ id }] = await t.db.query<{ id: string }>("select id from public.map_invitations").then((r) => r.rows);
    // Ni l'invité ni le propriétaire ne la voient (ni l'identifiant ni le nom de l'autre) ; elle ne
    // permet plus de rejoindre la carte, et elle est supprimée.
    expect(await invitations(BOB)).toEqual([]);
    expect(await shares(ALICE, map.id)).toEqual([]);
    expect(await answer(BOB, id, true)).toEqual({ status: "not-found", map_id: null });
    expect(await count("map_invitations")).toBe(0);
    expect(await sharedWithMe(BOB)).toEqual([]);
  });

  it("inviter verrouille la ligne du contact : un retrait simultané attend, puis supprime l'invitation", () => {
    // PGlite n'a qu'une connexion : la règle est vérifiée sur le texte de la migration. Le retrait
    // (DELETE) attend la fin de l'invitation (for key share), puis le déclencheur la supprime.
    const sql = MIGRATIONS[MIGRATION_FILES.indexOf(MIGRATION)];
    const body = sql.slice(sql.indexOf("create function public.invite_contact_to_map("), sql.indexOf("comment on function public.invite_contact_to_map("));
    expect(body).toMatch(/from public\.contacts as c\s+where c\.id = v_contact[^;]*for key share of c;/);
  });

  it("le lien d'un compte bloqué répond comme un lien inconnu ; le nom d'un éditeur bloqué est caché", async () => {
    const map = await newMap(ALICE);
    const token = await createLink(ALICE, map.id, "editor", 10);
    expect((await acceptLink(BOB, token)).status).toBe("joined");
    expect((await acceptLink(CAROL, token)).status).toBe("joined");
    await lock(CAROL, map.id);
    // Bob et Carol ne sont pas contacts : Bob voit quand même le nom de celle qui modifie la carte.
    expect((await state(BOB, map.id))[0].lock_holder_name).toBe("Nom carol");
    expect(await call(BOB, "public.block_member('handle', 'carol')")).toBe("blocked");
    expect((await state(BOB, map.id))[0]).toMatchObject({ lock_held: true, lock_holder_name: null });
    expect(await call(CAROL, "public.block_member('handle', 'alice')")).toBe("blocked");
    expect(await sharedWithMe(CAROL)).toEqual([]);
    await t.db.query("delete from public.map_members where user_id = $1", [CAROL]);
    expect(await preview(CAROL, token)).toEqual([]);
    expect(await acceptLink(CAROL, token)).toEqual({ status: "not-found", map_id: null });
  });

  it("supprimer son profil : retiré des cartes des autres, partages de ses cartes arrêtés", async () => {
    const map = await sharedMap();
    await createLink(ALICE, map.id);
    await lock(BOB, map.id);
    const bobMap = await newMap(BOB);
    await createLink(BOB, bobMap.id);
    await acceptLink(CAROL, await createLink(BOB, bobMap.id));
    await t.as(BOB, "delete from public.profiles where user_id = $1", [BOB]);
    expect(await sharedWithMe(BOB)).toEqual([]);
    expect(await count("map_locks")).toBe(0);
    expect(await sharedWithMe(CAROL)).toEqual([]);
    expect(await t.db.query("select 1 from public.map_links where map_id = $1", [bobMap.id]).then((r) => r.rows)).toEqual([]);
    // La carte d'Alice garde son lien ; la carte de Bob existe toujours.
    expect(await count("map_links")).toBe(1);
    expect(await count("maps")).toBe(2);
  });

  it("la suppression d'un compte efface ses partages, dans un sens comme dans l'autre", async () => {
    const map = await sharedMap();
    await lock(BOB, map.id);
    await t.db.query("insert into auth.users (id) values ($1)", [UNKNOWN]);
    await profile(UNKNOWN, "zoe");
    const zoeMap = await newMap(UNKNOWN);
    await acceptLink(BOB, await createLink(UNKNOWN, zoeMap.id));
    await t.db.query("delete from auth.users where id = $1", [BOB]);
    expect(await count("map_members")).toBe(0);
    expect(await count("map_locks")).toBe(0);
    await t.db.query("delete from auth.users where id = $1", [UNKNOWN]);
    expect(await count("map_links")).toBe(0);
    await t.addUsers(BOB);
  });
});
