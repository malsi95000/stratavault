// Contacts dans la base (supabase/migrations/20261018120000_contacts.sql), sur un vrai PostgreSQL
// (PGlite) avec les droits de l'API : aucune lecture ni écriture directe des tables, fonctions
// bornées (demandes, réponses, retrait, blocage), règle de visibilité des profils remplacée,
// anti-énumération, limites anti-abus, suppressions en cascade.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS, MIGRATION_FILES, migrationsUpTo, openTestDb, type TestDb } from "@/test/pglite";
import {
  BLOCKS_PER_DAY,
  CONTACT_CHANGES_PER_DAY,
  CONTACT_REQUESTS_PER_DAY,
  MAX_BLOCKS,
  MAX_CONTACTS,
  MAX_INCOMING_REQUESTS,
  MAX_OUTGOING_REQUESTS,
} from "./limits";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DAVE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const AVATAR = "99999999-9999-4999-8999-999999999999";
const UNKNOWN_REF = "12345678-1234-4234-8234-123456789abc";
const MIGRATION = "20261018120000_contacts.sql";
/** Dernière migration des profils et des avatars, appliquée juste avant celle des contacts. */
const LAST_PROFILES_MIGRATION = "20261017120300_delete_my_account_avatars.sql";

let t: TestDb;

type Request = { id: string; direction: string; handle: string | null; display_name: string | null; avatar_id: string | null };
type Contact = { id: string; handle: string; display_name: string; avatar_id: string | null };
type Blocked = { id: string; handle: string | null };

/** Appelle une fonction de la base qui renvoie un statut texte. */
const call = async (userId: string | null, sql: string, params: unknown[] = []) =>
  (await t.as<{ status: string }>(userId, `select ${sql} as status`, params))[0].status;
const profile = (userId: string, handle: string, visibility = "members") =>
  call(userId, "public.create_my_profile($1, $2, '', $3)", [handle, `Nom ${handle}`, visibility]);
const send = (userId: string, handle: string) => call(userId, "public.send_contact_request($1)", [handle]);
const accept = (userId: string, id: string) => call(userId, "public.accept_contact_request($1)", [id]);
const refuse = (userId: string, id: string) => call(userId, "public.refuse_contact_request($1)", [id]);
const cancel = (userId: string, id: string) => call(userId, "public.cancel_contact_request($1)", [id]);
const remove = (userId: string, id: string) => call(userId, "public.remove_contact($1)", [id]);
const block = (userId: string, kind: string, value: string) => call(userId, "public.block_member($1, $2)", [kind, value]);
const unblock = (userId: string, id: string) => call(userId, "public.unblock_member($1)", [id]);
const requests = (userId: string) =>
  t.as<Request>(userId, "select id, direction, handle, display_name, avatar_id from public.my_contact_requests()");
const contacts = (userId: string) => t.as<Contact>(userId, "select id, handle, display_name, avatar_id from public.my_contacts()");
const blocked = (userId: string) => t.as<Blocked>(userId, "select id, handle from public.my_blocked_members()");
const find = (userId: string, handle: string) =>
  t.as<{ handle: string }>(userId, "select handle from public.profile_by_handle($1)", [handle]);
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
/** Demande reçue par `userId` de la part de `handle`. */
const incomingFrom = async (userId: string, handle: string) => {
  const found = (await requests(userId)).find((r) => r.direction === "incoming" && r.handle === handle);
  if (!found) throw new Error(`aucune demande de ${handle}`);
  return found.id;
};
/** Rend `a` et `b` contacts par une demande acceptée ; renvoie la référence du contact (vue de `a`). */
async function link(a: string, aHandle: string, b: string, bHandle: string) {
  expect(await send(a, bHandle)).toBe("sent");
  expect(await accept(b, await incomingFrom(b, aHandle))).toBe("accepted");
  return (await contacts(a)).find((c) => c.handle === bHandle)!.id;
}

/**
 * Crée `n` comptes avec un profil « members » (identifiants `<prefix>0000`…), écrits par le
 * propriétaire de la base ; renvoie leurs identifiants de compte.
 */
async function bulkProfiles(prefix: string, n: number): Promise<string[]> {
  const { rows } = await t.db.query<{ id: string }>(
    `with ids as (
       select gen_random_uuid() as id, i from generate_series(1, $2::int) as i
     ), users as (
       insert into auth.users (id) select id from ids returning id
     )
     insert into public.profiles (user_id, handle, display_name)
     select ids.id, $1 || lpad(ids.i::text, 4, '0'), 'Membre' from ids join users using (id)
     returning user_id as id`,
    [prefix, n],
  );
  return rows.map((row) => row.id);
}

async function reset() {
  await t.db.exec(`
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

describe("migration des contacts", () => {
  it("vient après celles des profils et s'applique à une base au niveau de la v2.0 comme des profils", async () => {
    expect(MIGRATION_FILES).toContain(MIGRATION);
    // Après le dernier fichier des profils et des avatars (suppression du compte et avatars).
    expect(MIGRATION_FILES.indexOf(MIGRATION)).toBe(MIGRATION_FILES.indexOf(LAST_PROFILES_MIGRATION) + 1);
    const sql = MIGRATIONS[MIGRATION_FILES.indexOf(MIGRATION)];
    // L'en-tête donne le même ordre d'application.
    expect(sql).toContain(`-- À appliquer après ${LAST_PROFILES_MIGRATION}`);
    // Rien ne touche aux cartes, au compte (l'en-tête nomme seulement le fichier qui précède celui-ci)
    // ni aux fonctions publiques des profils et des avatars.
    expect(sql).not.toMatch(/public\.maps\b|delete_my_account(?!_avatars\.sql)|drop (table|function)|create or replace function public\.(?!profiles_visible_to\b)/i);
    expect(sql.match(/create or replace/gi)).toHaveLength(1);

    // Base au niveau des profils, avec des compteurs déjà écrits : ils restent valides.
    const old = await openTestDb(migrationsUpTo(LAST_PROFILES_MIGRATION));
    await old.addUsers(ALICE);
    await old.as(ALICE, "select public.create_my_profile('alice', 'Alice', '', 'members')");
    await old.db.exec(sql);
    expect((await old.db.query("select action from public.rate_limits order by action")).rows).toEqual([
      { action: "handle_attempt" },
      { action: "profile_create" },
    ]);
    await old.db.close();
  }, 60_000);

  it("liste fermée des compteurs : les nouvelles actions acceptées, une action inconnue refusée", async () => {
    for (const action of ["contact_request", "contact_block", "contact_change", "profile_lookup"]) await setHits(ALICE, action, 1);
    await expect(setHits(ALICE, "contact_spam", 1)).rejects.toThrow(/rate_limits_action/);
  });
});

describe("tables des contacts : aucun accès par l'API", () => {
  it("ni lecture ni écriture directe, pour les comptes connectés comme pour les visiteurs", async () => {
    await link(ALICE, "alice", BOB, "bob");
    await send(ALICE, "carol");
    await block(ALICE, "handle", "carol");
    for (const role of [ALICE, BOB, null]) {
      for (const table of ["contacts", "contact_requests", "contact_blocks"]) {
        for (const sql of [`select * from public.${table}`, `delete from public.${table}`, `update public.${table} set created_at = now()`]) {
          await expect(t.as(role, sql), `${role} ${sql}`).rejects.toThrow(/permission denied/);
        }
      }
      await expect(
        t.as(role, "insert into public.contacts (user_low, user_high) values ($1, $2)", [ALICE, CAROL]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        t.as(role, "insert into public.contact_blocks (blocker_id, blocked_id) values ($1, $2)", [BOB, ALICE]),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("fonctions réservées aux comptes connectés ; fonctions internes fermées à tous", async () => {
    for (const sql of [
      "public.send_contact_request('bob')",
      `public.accept_contact_request('${UNKNOWN_REF}')`,
      `public.refuse_contact_request('${UNKNOWN_REF}')`,
      `public.cancel_contact_request('${UNKNOWN_REF}')`,
      `public.remove_contact('${UNKNOWN_REF}')`,
      "public.block_member('handle', 'bob')",
      `public.unblock_member('${UNKNOWN_REF}')`,
    ]) {
      await expect(call(null, sql), sql).rejects.toThrow(/permission denied/);
      await expect(call("", sql), sql).rejects.toThrow(/contacts_not_authenticated/);
    }
    for (const fn of ["my_contacts", "my_contact_requests", "my_blocked_members"]) {
      await expect(t.as(null, `select * from public.${fn}()`)).rejects.toThrow(/permission denied/);
      expect(await t.as("", `select * from public.${fn}()`)).toEqual([]);
    }
    for (const sql of [
      "select public.contacts_linked($1, $1)",
      "select public.contacts_blocked($1, $1)",
      "select public.contacts_blocked_either($1, $1)",
      "select public.contacts_lock_pair($1, $1)",
      "select public.contacts_lock_accounts($1, $1)",
      "select public.contacts_block($1, $1, false)",
      "select public.contacts_count($1)",
      "select public.contacts_ref_ok('x')",
      "select public.contacts_visible_target('bob', $1)",
      "select public.contacts_take_change($1)",
      "select public.profiles_visible_to($1, 'members', $1)",
    ]) {
      await expect(t.as(ALICE, sql, sql.includes("$1") ? [ALICE] : []), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("les fonctions SECURITY DEFINER des contacts ont un search_path vide", async () => {
    const { rows } = await t.db.query<{ name: string; config: string[] | null; secdef: boolean }>(
      `select proname as name, proconfig as config, prosecdef as secdef from pg_proc
       where pronamespace = 'public'::regnamespace and (proname like '%contact%' or proname like '%block%' or proname = 'profiles_visible_to')
         and proname not like '%map%' and proname not like '%collective%'`,
    );
    expect(rows.filter((fn) => fn.secdef).map((fn) => fn.name).toSorted()).toEqual([
      "accept_contact_request",
      "block_member",
      "cancel_contact_request",
      "my_blocked_members",
      "my_contact_requests",
      "my_contacts",
      "refuse_contact_request",
      "remove_contact",
      "send_contact_request",
      "unblock_member",
    ]);
    for (const fn of rows) expect(fn.config, fn.name).toEqual(['search_path=""']);
  });
});

describe("demandes de contact", () => {
  it("envoyer, voir de part et d'autre, accepter : contacts des deux côtés, demandes effacées", async () => {
    expect(await send(ALICE, " Bob ")).toBe("sent");
    expect(await requests(ALICE)).toEqual([
      { id: expect.any(String), direction: "outgoing", handle: "bob", display_name: "Nom bob", avatar_id: null },
    ]);
    const [incoming] = await requests(BOB);
    expect(incoming).toMatchObject({ direction: "incoming", handle: "alice", display_name: "Nom alice" });
    // La même référence pour les deux ; seul le destinataire accepte.
    expect(incoming.id).toBe((await requests(ALICE))[0].id);
    expect(await accept(ALICE, incoming.id)).toBe("not-found");
    expect(await accept(CAROL, incoming.id)).toBe("not-found");
    expect(await accept(BOB, incoming.id)).toBe("accepted");
    expect(await requests(ALICE)).toEqual([]);
    expect(await requests(BOB)).toEqual([]);
    expect((await contacts(ALICE)).map((c) => c.handle)).toEqual(["bob"]);
    expect((await contacts(BOB)).map((c) => c.handle)).toEqual(["alice"]);
    expect((await contacts(CAROL)).map((c) => c.handle)).toEqual([]);
    // Même ligne, vue des deux côtés.
    expect((await contacts(ALICE))[0].id).toBe((await contacts(BOB))[0].id);
    expect(await accept(BOB, incoming.id)).toBe("not-found");
    expect(await send(ALICE, "bob")).toBe("already-contacts");
    expect(await send(BOB, "alice")).toBe("already-contacts");
  });

  it("réponses sur ses propres relations : soi-même, déjà envoyée, déjà reçue", async () => {
    expect(await send(ALICE, "alice")).toBe("self");
    expect(await send(ALICE, "bob")).toBe("sent");
    expect(await send(ALICE, "BOB")).toBe("already-sent");
    expect(await send(BOB, "alice")).toBe("incoming-pending");
    expect(await count("contact_requests")).toBe(1);
  });

  it("refuser et annuler : seul le destinataire refuse, seul l'expéditeur annule", async () => {
    await send(ALICE, "bob");
    const id = await incomingFrom(BOB, "alice");
    expect(await refuse(ALICE, id)).toBe("not-found");
    expect(await cancel(BOB, id)).toBe("not-found");
    expect(await refuse(CAROL, id)).toBe("not-found");
    expect(await refuse(BOB, id)).toBe("refused");
    expect(await requests(ALICE)).toEqual([]);
    expect(await send(ALICE, "bob")).toBe("sent");
    const again = await incomingFrom(BOB, "alice");
    expect(await cancel(ALICE, again)).toBe("cancelled");
    expect(await cancel(ALICE, again)).toBe("not-found");
    expect(await requests(BOB)).toEqual([]);
  });

  it("un profil est exigé pour envoyer ; références mal formées ou inconnues : « not-found »", async () => {
    await expect(send(DAVE, "bob")).rejects.toThrow(/contacts_no_profile/);
    for (const ref of ["", "x", UNKNOWN_REF, UNKNOWN_REF.toUpperCase(), `${UNKNOWN_REF} `, "a".repeat(100_000)]) {
      expect(await accept(BOB, ref), ref).toBe("not-found");
      expect(await refuse(BOB, ref), ref).toBe("not-found");
      expect(await cancel(BOB, ref), ref).toBe("not-found");
      expect(await remove(BOB, ref), ref).toBe("not-found");
      expect(await unblock(BOB, ref), ref).toBe("not-found");
    }
    expect(await call(BOB, "public.accept_contact_request(null)")).toBe("not-found");
  });
});

describe("anti-énumération", () => {
  it("identifiant inconnu, profil masqué, membre qui vous a bloqué ou que vous avez bloqué : même réponse, essai compté", async () => {
    await call(CAROL, "public.update_my_profile('carol', 'Carol', '', 'contacts')");
    expect(await profile(DAVE, "dave")).toBe("created");
    await block(DAVE, "handle", "alice");
    await block(ALICE, "handle", "bob");
    await t.db.exec("delete from public.rate_limits;");
    for (const handle of ["inconnu", "carol", "dave", "bob"]) expect(await send(ALICE, handle), handle).toBe("not-found");
    expect(await hits(ALICE, "contact_request")).toBe(4);
    expect(await count("contact_requests")).toBe(0);
    // Un format refusé ne dit rien : ni compté, ni cherché.
    for (const handle of ["x", "", "a".repeat(100_000), "bob%"]) expect(await send(ALICE, handle), handle).toBe("not-found");
    expect(await call(ALICE, "public.send_contact_request(null)")).toBe("not-found");
    expect(await hits(ALICE, "contact_request")).toBe(4);
  });

  it("30 demandes par jour, qu'elles aboutissent ou non", async () => {
    await setHits(ALICE, "contact_request", CONTACT_REQUESTS_PER_DAY - 1);
    expect(await send(ALICE, "inconnu")).toBe("not-found");
    await expect(send(ALICE, "bob")).rejects.toThrow(/contacts_rate_limited/);
    await expect(send(ALICE, "inconnu")).rejects.toThrow(/contacts_rate_limited/);
    expect(await count("contact_requests")).toBe(0);
    // Fenêtre échue : le compteur repart.
    await t.db.query("update public.rate_limits set window_start = now() - interval '25 hours' where user_id = $1", [ALICE]);
    expect(await send(ALICE, "bob")).toBe("sent");
  });

  it("les listes ne renvoient jamais d'identifiant de compte", async () => {
    await link(ALICE, "alice", BOB, "bob");
    await send(ALICE, "carol");
    await block(ALICE, "request", (await requests(ALICE))[0].id);
    await send(BOB, "carol");
    const rows = [
      ...(await t.as<Record<string, unknown>>(ALICE, "select * from public.my_contacts()")),
      ...(await t.as<Record<string, unknown>>(BOB, "select * from public.my_contact_requests()")),
      ...(await t.as<Record<string, unknown>>(ALICE, "select * from public.my_blocked_members()")),
    ];
    expect(rows).toHaveLength(3);
    for (const id of [ALICE, BOB, CAROL]) expect(JSON.stringify(rows)).not.toContain(id);
    expect(Object.keys(rows[0]).toSorted()).toEqual(["avatar_id", "created_at", "display_name", "handle", "id"]);
  });
});

describe("visibilité des profils (profiles_visible_to remplacée)", () => {
  it("profil « contacts » : visible par ses contacts et par le destinataire de sa demande, pas par les autres", async () => {
    await call(BOB, "public.update_my_profile('bob', 'Bob', '', 'contacts')");
    expect(await find(ALICE, "bob")).toEqual([]);
    // Bob envoie une demande à Alice : elle voit qui la lui envoie.
    expect(await send(BOB, "alice")).toBe("sent");
    expect(await find(ALICE, "bob")).toEqual([{ handle: "bob" }]);
    expect(await find(CAROL, "bob")).toEqual([]);
    expect((await requests(ALICE))[0]).toMatchObject({ handle: "bob", display_name: "Bob" });
    expect(await accept(ALICE, await incomingFrom(ALICE, "bob"))).toBe("accepted");
    expect(await find(ALICE, "bob")).toEqual([{ handle: "bob" }]);
    expect(await find(CAROL, "bob")).toEqual([]);
    // Contact retiré : de nouveau masqué.
    expect(await remove(ALICE, (await contacts(ALICE))[0].id)).toBe("removed");
    expect(await find(ALICE, "bob")).toEqual([]);
  });

  it("une demande envoyée à un profil qui se masque ensuite n'en montre plus rien, pas même son nouvel identifiant", async () => {
    await send(ALICE, "bob");
    await call(BOB, "public.update_my_profile('cache_cache', 'Bob', '', 'contacts')");
    const [outgoing] = await requests(ALICE);
    expect(outgoing).toMatchObject({ direction: "outgoing", handle: null, display_name: null, avatar_id: null });
    expect(await find(ALICE, "cache_cache")).toEqual([]);
    // Le destinataire voit toujours l'expéditeur.
    expect((await requests(BOB))[0]).toMatchObject({ handle: "alice", display_name: "Nom alice" });
    // La référence suffit pour bloquer ce membre ; son identifiant actuel, qu'Alice ne voit pas,
    // n'est pas gardé avec le blocage (ni dans la liste, ni dans la table, ni dans l'export).
    expect(await block(ALICE, "request", outgoing.id)).toBe("blocked");
    expect(await blocked(ALICE)).toEqual([{ id: expect.any(String), handle: null }]);
    expect(JSON.stringify(await t.as(ALICE, "select * from public.my_blocked_members()"))).not.toContain("cache_cache");
    expect((await t.db.query("select blocked_handle from public.contact_blocks")).rows).toEqual([{ blocked_handle: null }]);
  });

  it("bloquer depuis une demande reçue ou un contact garde l'identifiant que le compte voyait", async () => {
    await call(BOB, "public.update_my_profile('bob', 'Bob', '', 'contacts')");
    await send(BOB, "alice");
    expect(await block(ALICE, "request", await incomingFrom(ALICE, "bob"))).toBe("blocked");
    await call(CAROL, "public.update_my_profile('carol', 'Carol', '', 'contacts')");
    // Même référence vue des deux côtés.
    const contactId = await link(CAROL, "carol", ALICE, "alice");
    expect(await block(ALICE, "contact", contactId)).toBe("blocked");
    expect((await blocked(ALICE)).map((b) => b.handle).toSorted()).toEqual(["bob", "carol"]);
  });

  it("l'avatar suit la même règle (contact : lisible ; bloqué : refusé)", async () => {
    await t.db.query("update public.profiles set avatar_id = $1 where user_id = $2", [AVATAR, BOB]);
    await call(BOB, "public.update_my_profile('bob', 'Bob', '', 'contacts')");
    const open = async (userId: string) =>
      (await t.as<{ ok: boolean }>(userId, "select public.open_avatar_read($1) as ok", [AVATAR]))[0].ok;
    expect(await open(ALICE)).toBe(false);
    await link(BOB, "bob", ALICE, "alice");
    expect(await open(ALICE)).toBe(true);
    expect((await contacts(ALICE))[0].avatar_id).toBe(AVATAR);
    await block(BOB, "handle", "alice");
    expect(await open(ALICE)).toBe(false);
    // L'autorisation d'une minute déjà ouverte ne suffit plus.
    expect(
      (await t.as<{ ok: boolean }>(ALICE, "select public.avatars_read_granted($1, $2) as ok", [AVATAR, BOB]))[0].ok,
    ).toBe(false);
  });
});

describe("retrait d'un contact", () => {
  it("par l'un ou l'autre, pour les deux ; un tiers ne peut pas", async () => {
    const id = await link(ALICE, "alice", BOB, "bob");
    expect(await remove(CAROL, id)).toBe("not-found");
    expect(await remove(BOB, id)).toBe("removed");
    expect(await contacts(ALICE)).toEqual([]);
    expect(await remove(ALICE, id)).toBe("not-found");
    expect(await send(ALICE, "bob")).toBe("sent");
  });
});

describe("blocage", () => {
  it("par identifiant : contact retiré, demandes supprimées, profil (même « members ») masqué au bloqué", async () => {
    await link(ALICE, "alice", BOB, "bob");
    await send(CAROL, "alice");
    expect(await block(ALICE, "handle", "BOB")).toBe("blocked");
    expect(await contacts(ALICE)).toEqual([]);
    expect(await contacts(BOB)).toEqual([]);
    expect(await find(BOB, "alice")).toEqual([]);
    expect(await find(CAROL, "alice")).toEqual([{ handle: "alice" }]);
    expect(await find(CAROL, "bob")).toEqual([{ handle: "bob" }]);
    // Invisibilité réciproque : celui qui bloque ne voit plus non plus le profil (même « members »).
    expect(await find(ALICE, "bob")).toEqual([]);
    // Ni l'un ni l'autre ne peut envoyer de demande ni bloquer par identifiant : même réponse qu'un
    // identifiant inconnu, dans les deux sens.
    expect(await send(BOB, "alice")).toBe("not-found");
    expect(await block(BOB, "handle", "alice")).toBe("not-found");
    expect(await send(ALICE, "bob")).toBe("not-found");
    expect(await block(ALICE, "handle", "bob")).toBe("not-found");
    expect(await block(ALICE, "handle", "alice")).toBe("self");
    expect(await blocked(ALICE)).toEqual([{ id: expect.any(String), handle: "bob" }]);
    expect(await count("contact_blocks")).toBe(1);
    expect(await blocked(BOB)).toEqual([]);
    // La demande de Carol n'est pas touchée.
    expect((await requests(ALICE)).map((r) => r.handle)).toEqual(["carol"]);
  });

  it("depuis une demande (reçue ou envoyée) ou un contact, par sa référence", async () => {
    await send(BOB, "alice");
    const fromBob = await incomingFrom(ALICE, "bob");
    expect(await block(CAROL, "request", fromBob)).toBe("not-found");
    expect(await block(ALICE, "request", fromBob)).toBe("blocked");
    expect(await requests(BOB)).toEqual([]);
    expect(await send(BOB, "alice")).toBe("not-found");

    await send(ALICE, "carol");
    expect(await block(ALICE, "request", (await requests(ALICE))[0].id)).toBe("blocked");
    expect(await find(CAROL, "alice")).toEqual([]);

    expect(await profile(DAVE, "dave")).toBe("created");
    const contactId = await link(DAVE, "dave", BOB, "bob");
    expect(await block(ALICE, "contact", contactId)).toBe("not-found");
    expect(await block(DAVE, "contact", contactId)).toBe("blocked");
    expect(await contacts(BOB)).toEqual([]);
    expect(await count("contact_blocks")).toBe(3);
  });

  it("par identifiant : seulement un profil visible ; entrées bornées, type fermé", async () => {
    await call(CAROL, "public.update_my_profile('carol', 'Carol', '', 'contacts')");
    expect(await block(ALICE, "handle", "carol")).toBe("not-found");
    expect(await block(ALICE, "handle", "inconnu")).toBe("not-found");
    expect(await block(ALICE, "handle", "a".repeat(100_000))).toBe("not-found");
    expect(await block(ALICE, "request", "pas-un-uuid")).toBe("not-found");
    await expect(block(ALICE, "account", BOB)).rejects.toThrow(/contacts_invalid/);
    await expect(block(ALICE, "h".repeat(100_000), "bob")).rejects.toThrow(/contacts_invalid/);
    expect(await count("contact_blocks")).toBe(0);
  });

  it("débloquer : le profil redevient visible, rien ne revient ; seul celui qui bloque débloque", async () => {
    await link(ALICE, "alice", BOB, "bob");
    await block(ALICE, "handle", "bob");
    const [{ id }] = await blocked(ALICE);
    expect(await unblock(BOB, id)).toBe("not-found");
    expect(await unblock(ALICE, id)).toBe("unblocked");
    expect(await find(BOB, "alice")).toEqual([{ handle: "alice" }]);
    expect(await find(ALICE, "bob")).toEqual([{ handle: "bob" }]);
    expect(await contacts(ALICE)).toEqual([]);
    expect(await send(BOB, "alice")).toBe("sent");
  });

  it("survit à la suppression et à la recréation du profil du bloqué, sans montrer sa nouvelle identité", async () => {
    await block(ALICE, "handle", "bob");
    await t.as(BOB, "delete from public.profiles");
    // L'identifiant du moment du blocage, que celui qui bloque connaissait déjà.
    expect(await blocked(ALICE)).toEqual([{ id: expect.any(String), handle: "bob" }]);
    await t.db.exec("delete from public.rate_limits;");
    expect(await profile(BOB, "robert")).toBe("created");
    expect(await send(BOB, "alice")).toBe("not-found");
    expect(await find(BOB, "alice")).toEqual([]);
    expect(await find(ALICE, "robert")).toEqual([]);
    expect(await blocked(ALICE)).toEqual([{ id: expect.any(String), handle: "bob" }]);
  });

  it("ne sert pas de balise : un bloqué qui se masque, change d'identifiant ou recrée son profil n'est pas reconnu", async () => {
    expect(await profile(DAVE, "dave")).toBe("created");
    expect(await block(ALICE, "handle", "bob")).toBe("blocked");
    /**
     * Ce qu'Alice peut apprendre de l'identifiant `handle` : recherche, demande, blocage. Chaque essai
     * est annulé ensuite (transaction), pour comparer les réponses sans rien écrire.
     */
    const probe = async (handle: string) => {
      await t.db.exec("begin");
      try {
        return { find: await find(ALICE, handle), send: await send(ALICE, handle), block: await block(ALICE, "handle", handle) };
      } finally {
        await t.db.exec("rollback");
      }
    };
    const unknown = { find: [], send: "not-found", block: "not-found" };
    const list = [{ id: expect.any(String), handle: "bob" }];
    expect(await probe("inconnu")).toEqual(unknown);
    // Témoin : un autre membre visible répond normalement.
    expect(await probe("dave")).toEqual({ find: [{ handle: "dave" }], send: "sent", block: "blocked" });

    // Bob se masque et change d'identifiant : un tiers ne le trouve plus, Alice non plus.
    await call(BOB, "public.update_my_profile('nouveau_nom', 'Autre', '', 'contacts')");
    expect(await find(CAROL, "nouveau_nom")).toEqual([]);
    expect(await probe("nouveau_nom")).toEqual(unknown);
    expect(await blocked(ALICE)).toEqual(list);
    // Il redevient « members » sous ce nouvel identifiant : visible des autres, mais pour Alice, mêmes
    // réponses qu'un identifiant inconnu (ni « blocked », ni « already-blocked »).
    await call(BOB, "public.update_my_profile('nouveau_nom', 'Autre', '', 'members')");
    expect(await find(CAROL, "nouveau_nom")).toEqual([{ handle: "nouveau_nom" }]);
    expect(await probe("nouveau_nom")).toEqual(unknown);
    expect(await blocked(ALICE)).toEqual(list);
    // Puis recrée un profil sous un autre identifiant : même chose.
    await t.as(BOB, "delete from public.profiles");
    await t.db.exec("delete from public.rate_limits;");
    expect(await profile(BOB, "tout_neuf")).toBe("created");
    expect(await probe("tout_neuf")).toEqual(unknown);
    expect(JSON.stringify(await t.as(ALICE, "select * from public.my_blocked_members()"))).not.toMatch(/nouveau_nom|tout_neuf|Autre/);
    expect(await count("contact_blocks")).toBe(1);
    // L'ancien identifiant, pris par un autre membre, ne lui est pas attribué : ce membre-là reste
    // visible et joignable.
    await t.as(DAVE, "delete from public.profiles");
    expect(await profile(DAVE, "bob")).toBe("created");
    expect(await probe("bob")).toEqual({ find: [{ handle: "bob" }], send: "sent", block: "blocked" });
    expect(await blocked(ALICE)).toEqual(list);
  });

  it("50 blocages par jour, comptés avant de chercher le membre ; 1 000 comptes bloqués au plus", async () => {
    await setHits(ALICE, "contact_block", BLOCKS_PER_DAY - 1);
    expect(await block(ALICE, "handle", "inconnu")).toBe("not-found");
    await expect(block(ALICE, "handle", "bob")).rejects.toThrow(/contacts_rate_limited/);
    await t.db.exec("delete from public.rate_limits;");

    const others = await bulkProfiles("blq", MAX_BLOCKS);
    await t.db.query(
      `insert into public.contact_blocks (blocker_id, blocked_id, blocked_handle)
       select $1, p.user_id, p.handle from public.profiles as p where p.user_id = any($2::uuid[])`,
      [ALICE, others],
    );
    expect(await block(ALICE, "handle", "bob")).toBe("blocks-full");
    expect(await find(BOB, "alice")).toEqual([{ handle: "alice" }]);
    // 1 000 profils créés : plus de 5 s quand toute la suite tourne en parallèle.
  }, 30_000);
});

describe("blocage et opérations simultanées", () => {
  /** Vrai si la transaction en cours tient le verrou consultatif du couple (a, b). */
  const holdsPairLock = async (a: string, b: string) =>
    (
      await t.db.query<{ held: boolean }>(
        `with k as (
           select hashtextextended('public.contacts:' || least($1::uuid, $2::uuid)::text || ':' || greatest($1::uuid, $2::uuid)::text, 0) as key
         )
         select exists (
           select 1 from pg_locks as l, k
           where l.locktype = 'advisory' and l.granted and l.objsubid = 1
             and l.classid::bigint = (k.key >> 32) & 4294967295
             and l.objid::bigint = k.key & 4294967295
         ) as held`,
        [a, b],
      )
    ).rows[0].held;

  /** Exécute `run` dans une transaction annulée ensuite ; dit si le verrou du couple y a été pris. */
  async function locksPair(a: string, b: string, run: () => Promise<unknown>) {
    await t.db.exec("begin");
    try {
      expect(await holdsPairLock(a, b)).toBe(false);
      await run();
      return await holdsPairLock(a, b);
    } finally {
      await t.db.exec("rollback");
    }
  }

  it("envoyer, accepter et bloquer prennent le verrou du couple (le même dans les deux sens)", async () => {
    expect(await locksPair(ALICE, BOB, () => send(ALICE, "bob"))).toBe(true);
    await send(ALICE, "bob");
    const id = await incomingFrom(BOB, "alice");
    expect(await locksPair(BOB, ALICE, () => accept(BOB, id))).toBe(true);
    expect(await locksPair(ALICE, BOB, () => block(BOB, "handle", "alice"))).toBe(true);
    // Un identifiant introuvable ne verrouille rien.
    expect(await locksPair(ALICE, BOB, () => send(ALICE, "inconnu"))).toBe(false);
  });

  /** Vrai si la transaction en cours tient le verrou consultatif du compte `user` (contacts_lock_accounts). */
  const holdsAccountLock = async (user: string) =>
    (
      await t.db.query<{ held: boolean }>(
        `with k as (select hashtextextended('public.contacts.account:' || $1::uuid::text, 0) as key)
         select exists (
           select 1 from pg_locks as l, k
           where l.locktype = 'advisory' and l.granted and l.objsubid = 1
             and l.classid::bigint = (k.key >> 32) & 4294967295
             and l.objid::bigint = k.key & 4294967295
         ) as held`,
        [user],
      )
    ).rows[0].held;

  /** Exécute `run` dans une transaction annulée ensuite ; comptes dont le verrou y a été pris. */
  async function lockedAccounts(run: () => Promise<unknown>) {
    await t.db.exec("begin");
    try {
      await run();
      const held: string[] = [];
      for (const [user, name] of [
        [ALICE, "alice"],
        [BOB, "bob"],
        [CAROL, "carol"],
      ]) {
        if (await holdsAccountLock(user)) held.push(name);
      }
      return held;
    } finally {
      await t.db.exec("rollback");
    }
  }

  it("envoyer et accepter verrouillent les deux comptes : les limites de l'autre membre tiennent sous la concurrence", async () => {
    // Deux membres qui écrivent en même temps au même compte (envoi ou acceptation) passent l'un après
    // l'autre : ses 200 demandes reçues et ses 1 000 contacts ne sont pas dépassés. PGlite n'a qu'une
    // connexion : on vérifie que chaque appel tient le verrou des deux comptes.
    expect(await lockedAccounts(() => send(ALICE, "bob"))).toEqual(["alice", "bob"]);
    await send(CAROL, "bob");
    expect(await lockedAccounts(async () => expect(await accept(BOB, await incomingFrom(BOB, "carol"))).toBe("accepted"))).toEqual([
      "bob",
      "carol",
    ]);
    // Identifiant introuvable, demande inconnue : aucun verrou.
    expect(await lockedAccounts(() => send(ALICE, "inconnu"))).toEqual([]);
    expect(await lockedAccounts(() => accept(BOB, UNKNOWN_REF))).toEqual([]);
    // Ordre fixe : les verrous des comptes avant le profil du compte et le verrou du couple, et les
    // limites comptées après (aucun interblocage, aucune limite vérifiée hors verrou).
    const sql = MIGRATIONS[MIGRATION_FILES.indexOf(MIGRATION)];
    for (const fn of ["send_contact_request", "accept_contact_request"]) {
      const body = sql.slice(sql.indexOf(`create function public.${fn}(`), sql.indexOf(`comment on function public.${fn}(`));
      const at = (needle: string) => {
        expect(body, `${fn} : ${needle}`).toContain(needle);
        return body.indexOf(needle);
      };
      const accounts = at("perform public.contacts_lock_accounts(");
      expect(accounts).toBeLessThan(at("for no key update;"));
      expect(at("for no key update;")).toBeLessThan(at("perform public.contacts_lock_pair("));
      expect(at("perform public.contacts_lock_pair(")).toBeLessThan(at("public.contacts_count("));
    }
  });

  it("le profil du compte est verrouillé en « for no key update » (pas d'interblocage avec les clés étrangères)", () => {
    // Deux membres qui s'ajoutent en même temps : chacun tient son profil, puis l'insertion vérifie
    // la clé étrangère vers le profil de l'autre (for key share). « for update » s'y opposerait et
    // pourrait interbloquer les deux appels ; « for no key update » est compatible. PGlite n'a qu'une
    // connexion : la règle est vérifiée sur le texte de la migration.
    const sql = MIGRATIONS[MIGRATION_FILES.indexOf(MIGRATION)];
    const profileLocks = sql.match(/from public\.profiles as p where p\.user_id = v_uid for [a-z ]+;/g) ?? [];
    expect(profileLocks).toHaveLength(2);
    for (const lock of profileLocks) expect(lock).toMatch(/for no key update;$/);
    expect(sql).not.toMatch(/public\.profiles[^;]*\bfor update\b/);
  });

  it("si un contact ou une demande subsistait à côté d'un blocage, aucune liste ne l'expose", async () => {
    // État que seule une course pourrait produire, écrit directement : contact Alice–Bob avec un
    // blocage d'Alice, demande de Carol à Alice avec un blocage de Carol.
    await t.db.query(
      "insert into public.contacts (user_low, user_high) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))",
      [ALICE, BOB],
    );
    await t.db.query("insert into public.contact_requests (sender_id, recipient_id) values ($1, $2)", [CAROL, ALICE]);
    const blockRow = "insert into public.contact_blocks (blocker_id, blocked_id, blocked_handle) values ($1, $2, $3)";
    await t.db.query(blockRow, [ALICE, BOB, "bob"]);
    await t.db.query(blockRow, [CAROL, ALICE, "alice"]);
    for (const user of [ALICE, BOB]) expect(await contacts(user), user).toEqual([]);
    for (const user of [ALICE, CAROL]) expect(await requests(user), user).toEqual([]);
    // Les profils restent invisibles dans les deux sens.
    expect(await find(BOB, "alice")).toEqual([]);
    expect(await find(ALICE, "bob")).toEqual([]);
    expect(await find(ALICE, "carol")).toEqual([]);
    expect(await find(CAROL, "alice")).toEqual([]);
    // La demande restante ne peut pas être acceptée ; elle est effacée.
    const { rows } = await t.db.query<{ id: string }>("select id from public.contact_requests");
    expect(await accept(ALICE, rows[0].id)).toBe("not-found");
    expect(await count("contact_requests")).toBe(0);
  });
});

describe("limites des demandes et des contacts", () => {
  it("50 demandes envoyées en attente au plus", async () => {
    const others = await bulkProfiles("dst", MAX_OUTGOING_REQUESTS);
    await t.db.query("insert into public.contact_requests (sender_id, recipient_id) select $1, unnest($2::uuid[])", [ALICE, others]);
    expect(await send(ALICE, "bob")).toBe("outgoing-full");
    await cancel(ALICE, (await requests(ALICE))[0].id);
    expect(await send(ALICE, "bob")).toBe("sent");
  });

  it("200 demandes reçues en attente au plus : « unavailable » pour l'expéditeur suivant", async () => {
    const others = await bulkProfiles("src", MAX_INCOMING_REQUESTS);
    await t.db.query("insert into public.contact_requests (sender_id, recipient_id) select unnest($1::uuid[]), $2", [others, BOB]);
    expect(await send(ALICE, "bob")).toBe("unavailable");
    expect(await count("contact_requests")).toBe(MAX_INCOMING_REQUESTS);
    expect(await requests(BOB)).toHaveLength(MAX_INCOMING_REQUESTS);
  });

  it("1 000 contacts au plus, à l'envoi comme à l'acceptation", async () => {
    await send(CAROL, "alice");
    const others = await bulkProfiles("ctc", MAX_CONTACTS);
    await t.db.query(
      "insert into public.contacts (user_low, user_high) select least($1::uuid, o), greatest($1::uuid, o) from unnest($2::uuid[]) as o",
      [ALICE, others],
    );
    expect(await send(ALICE, "bob")).toBe("contacts-full");
    expect(await send(BOB, "alice")).toBe("unavailable");
    expect(await accept(ALICE, await incomingFrom(ALICE, "carol"))).toBe("contacts-full");
    expect(await contacts(ALICE)).toHaveLength(MAX_CONTACTS);
  });

  it("300 autres opérations par jour (accepter, refuser, annuler, retirer, débloquer)", async () => {
    await send(ALICE, "bob");
    await setHits(BOB, "contact_change", CONTACT_CHANGES_PER_DAY);
    await expect(accept(BOB, await incomingFrom(BOB, "alice"))).rejects.toThrow(/contacts_rate_limited/);
    await expect(refuse(BOB, UNKNOWN_REF)).rejects.toThrow(/contacts_rate_limited/);
    await expect(unblock(BOB, UNKNOWN_REF)).rejects.toThrow(/contacts_rate_limited/);
    expect(await requests(BOB)).toHaveLength(1);
  });
});

describe("suppressions en cascade", () => {
  it("supprimer son profil retire ses contacts et ses demandes, pas ses blocages", async () => {
    await link(ALICE, "alice", BOB, "bob");
    await send(ALICE, "carol");
    expect(await profile(DAVE, "dave")).toBe("created");
    await block(ALICE, "handle", "dave");
    expect(await t.as(ALICE, "delete from public.profiles returning handle")).toEqual([{ handle: "alice" }]);
    expect(await contacts(BOB)).toEqual([]);
    expect(await requests(CAROL)).toEqual([]);
    expect(await count("contact_blocks")).toBe(1);
    expect(await find(DAVE, "bob")).toEqual([{ handle: "bob" }]);
  });

  it("supprimer le compte efface ses contacts, ses demandes et tous les blocages qui le concernent", async () => {
    expect(await profile(DAVE, "dave")).toBe("created");
    await link(DAVE, "dave", BOB, "bob");
    await send(DAVE, "carol");
    await block(DAVE, "handle", "alice");
    await block(BOB, "handle", "carol");
    await link(ALICE, "alice", CAROL, "carol");
    await block(CAROL, "handle", "dave");
    await t.db.query("delete from auth.users where id = $1", [DAVE]);
    expect(await count("contacts")).toBe(1);
    expect(await count("contact_requests")).toBe(0);
    expect((await blocked(BOB)).map((b) => b.handle)).toEqual(["carol"]);
    expect(await blocked(CAROL)).toEqual([]);
    expect((await t.db.query("select * from public.rate_limits where user_id = $1", [DAVE])).rows).toEqual([]);
    await t.addUsers(DAVE);
  });

  it("delete_my_account() (session ouverte par mot de passe) supprime un compte qui a contacts, demandes et blocages", async () => {
    const session = "d5d5d5d5-0000-4000-8000-000000000004";
    await t.db.exec(
      "create table if not exists auth.sessions (id uuid primary key, user_id uuid not null references auth.users (id) on delete cascade)",
    );
    await t.db.query("insert into auth.sessions (id, user_id) values ($1, $2)", [session, DAVE]);
    expect(await profile(DAVE, "dave")).toBe("created");
    await link(DAVE, "dave", BOB, "bob");
    await send(DAVE, "carol");
    expect(await send(ALICE, "dave")).toBe("sent");
    await block(DAVE, "handle", "alice");
    await block(CAROL, "contact", await link(CAROL, "carol", ALICE, "alice"));
    expect(await block(BOB, "contact", (await contacts(BOB))[0].id)).toBe("blocked");

    const claims = {
      sub: DAVE,
      role: "authenticated",
      session_id: session,
      amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 2 }],
    };
    expect(await t.asClaims(claims, "select public.delete_my_account() as deleted")).toEqual([{ deleted: true }]);
    const rowsOf = async (sql: string) => (await t.db.query(sql, [DAVE])).rows;
    expect(await rowsOf("select 1 from public.contacts where $1 in (user_low, user_high)")).toEqual([]);
    expect(await rowsOf("select 1 from public.contact_requests where $1 in (sender_id, recipient_id)")).toEqual([]);
    expect(await rowsOf("select 1 from public.contact_blocks where $1 in (blocker_id, blocked_id)")).toEqual([]);
    // Les relations des autres comptes entre eux ne bougent pas.
    expect((await blocked(CAROL)).map((b) => b.handle)).toEqual(["alice"]);
    expect(await requests(CAROL)).toEqual([]);
    await t.addUsers(DAVE);
  });
});
