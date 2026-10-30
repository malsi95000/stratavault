// Profils dans la base (supabase/migrations/20261017120000_rate_limits.sql et
// 20261017120100_profiles.sql), sur un vrai PostgreSQL (PGlite) avec les droits de l'API : RLS,
// aucune écriture directe, fonctions d'écriture (essais d'identifiant comptés), contraintes (les mêmes
// décisions que l'application), déclencheur, recherche par identifiant exact, limites anti-abus,
// suppression en cascade.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS, MIGRATION_FILES, migrationsUpTo, openTestDb, type TestDb } from "@/test/pglite";
import { RESERVED_HANDLES, RESERVED_HANDLE_WORDS, foldHandle, isHandleFormatOk, isReservedHandle } from "./handle";
import {
  DISPLAY_NAME_CONFUSABLES,
  RESERVED_DISPLAY_NAME_JOINED,
  RESERVED_DISPLAY_NAME_WORDS,
  bioProblem,
  displayNameComparable,
  displayNameProblem,
  isReservedDisplayName,
} from "./text";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let t: TestDb;

type Found = { handle: string; display_name: string; bio: string; avatar_id: string | null; is_self: boolean };
type Fields = { name?: string; bio?: string; visibility?: string };

const args = (handle: string, extra: Fields) => [handle, extra.name ?? "Nom", extra.bio ?? "", extra.visibility ?? "members"];
/** Création par la fonction de la base ; renvoie son statut (« created » ou « handle-taken »). */
const create = async (userId: string | null, handle: string, extra: Fields = {}) =>
  (await t.as<{ status: string }>(userId, "select public.create_my_profile($1, $2, $3, $4) as status", args(handle, extra)))[0]
    .status;
const update = async (userId: string, handle: string, extra: Fields = {}) =>
  (await t.as<{ status: string }>(userId, "select public.update_my_profile($1, $2, $3, $4) as status", args(handle, extra)))[0]
    .status;
const find = (userId: string | null, handle: string) =>
  t.as<Found>(userId, "select * from public.profile_by_handle($1)", [handle]);
/** Ligne d'un compte, lue par le propriétaire de la base (hors RLS). */
const row = async (userId: string) =>
  (await t.db.query<Record<string, unknown>>("select * from public.profiles where user_id = $1", [userId])).rows[0];
const hits = async (userId: string, action: string) =>
  (await t.db.query<{ hits: number }>("select hits from public.rate_limits where user_id = $1 and action = $2", [userId, action]))
    .rows[0]?.hits ?? 0;
/** Contrôle pur de la base, appelé par son propriétaire (il n'est plus ouvert à l'API). */
const check = async (fn: string, value: string) =>
  (await t.db.query<{ ok: boolean }>(`select public.${fn}($1) as ok`, [value])).rows[0].ok;

/** Remet les profils et les compteurs à zéro (propriétaire de la base, hors RLS). */
async function reset() {
  await t.db.exec("delete from public.profiles; delete from public.rate_limits;");
}

beforeAll(async () => {
  t = await openTestDb();
  await t.addUsers(ALICE, BOB, CAROL);
}, 60_000);

beforeEach(reset);

afterAll(async () => {
  await t?.db.close();
});

describe("migrations des profils", () => {
  it("s'appliquent après celles de la bêta 2.1 (étape 1), sans rien changer aux cartes", async () => {
    const first = MIGRATION_FILES.indexOf("20261017120000_rate_limits.sql");
    expect(first).toBeGreaterThan(MIGRATION_FILES.indexOf("20261014120100_maps_cover.sql"));
    expect(MIGRATION_FILES.slice(first, first + 3)).toEqual([
      "20261017120000_rate_limits.sql",
      "20261017120100_profiles.sql",
      "20261017120200_avatars.sql",
    ]);
    // Aucune ne touche public.maps ni les fonctions existantes (les contacts, qui suivent, sont testés à part).
    for (const sql of MIGRATIONS.slice(first, first + 3)) {
      expect(sql).not.toMatch(/public\.maps\b|create or replace|drop |alter table public\.maps|delete_my_account\(\)\s*returns/i);
    }
    // Une base au niveau de l'étape 1 reçoit les nouvelles migrations sans erreur.
    const old = await openTestDb(migrationsUpTo("20261014120100_maps_cover.sql"));
    for (const sql of MIGRATIONS.slice(first, first + 3)) await old.db.exec(sql);
    await old.db.close();
  }, 60_000);
});

describe("public.profiles : RLS et droits", () => {
  it("chaque compte crée son profil (user_id = auth.uid()) et ne lit directement que le sien", async () => {
    expect(await create(ALICE, "alice")).toBe("created");
    expect(await create(BOB, "bob")).toBe("created");
    expect(await t.as(ALICE, "select handle from public.profiles")).toEqual([{ handle: "alice" }]);
    expect(await t.as(BOB, "select handle, user_id from public.profiles")).toEqual([{ handle: "bob", user_id: BOB }]);
    // Aucune liste des membres, même des profils « members ».
    expect(await t.as(ALICE, "select count(*)::int as n from public.profiles where user_id = $1", [BOB])).toEqual([{ n: 0 }]);
  });

  it("aucune écriture directe : ni création, ni modification, d'aucune colonne", async () => {
    await expect(
      t.as(ALICE, "insert into public.profiles (handle, display_name) values ('alice', 'X')"),
    ).rejects.toThrow(/permission denied/);
    await create(ALICE, "alice");
    for (const column of ["handle", "display_name", "bio", "visibility", "user_id", "avatar_id", "created_at", "updated_at", "handle_changed_at"]) {
      await expect(t.as(ALICE, `update public.profiles set ${column} = null`), column).rejects.toThrow(/permission denied/);
    }
  });

  it("un seul profil par compte ; chaque compte ne modifie et ne supprime que le sien", async () => {
    await create(ALICE, "alice");
    await create(BOB, "bob");
    await expect(create(ALICE, "alice2")).rejects.toThrow(/profiles_exists/);
    expect(await t.as(ALICE, "delete from public.profiles where user_id = $1 returning 1", [BOB])).toEqual([]);
    expect(await update(ALICE, "alice", { bio: "Moi" })).toBe("saved");
    expect((await row(ALICE)).bio).toBe("Moi");
    expect(await row(BOB)).toMatchObject({ bio: "", display_name: "Nom" });
    expect(await t.as(ALICE, "delete from public.profiles returning handle")).toEqual([{ handle: "alice" }]);
    await expect(update(ALICE, "alice")).rejects.toThrow(/profiles_not_found/);
  });

  it("rien pour le rôle anonyme ni sans auth.uid()", async () => {
    await create(ALICE, "alice");
    await expect(t.as(null, "select * from public.profiles")).rejects.toThrow(/permission denied/);
    await expect(find(null, "alice")).rejects.toThrow(/permission denied/);
    await expect(create(null, "zed")).rejects.toThrow(/permission denied/);
    await expect(find("", "alice")).rejects.toThrow(/profiles_not_authenticated/);
    expect(await t.as("", "select * from public.profiles")).toEqual([]);
    await expect(create("", "zed")).rejects.toThrow(/profiles_not_authenticated/);
    await expect(t.as("", "select public.update_my_profile('zed', 'Z', '', 'members')")).rejects.toThrow(
      /profiles_not_authenticated/,
    );
  });

  it("entrées des fonctions d'écriture bornées en texte avant toute transformation", async () => {
    await expect(create(ALICE, "a".repeat(100_000))).rejects.toThrow(/profiles_invalid/);
    await expect(create(ALICE, "alice", { name: "a".repeat(100_000) })).rejects.toThrow(/profiles_invalid/);
    await expect(create(ALICE, "alice", { bio: "a".repeat(100_000) })).rejects.toThrow(/profiles_invalid/);
    await expect(create(ALICE, "alice", { visibility: "m".repeat(100) })).rejects.toThrow(/profiles_invalid/);
    await expect(
      t.as(ALICE, "select public.create_my_profile(null, 'Nom', '', 'members')"),
    ).rejects.toThrow(/profiles_invalid/);
    expect(await row(ALICE)).toBeUndefined();
  });

  it("la table des compteurs n'est accessible à personne par l'API ; chacun relit seulement les siens", async () => {
    await create(ALICE, "alice");
    await create(BOB, "bob");
    for (const role of [ALICE, null]) {
      await expect(t.as(role, "select * from public.rate_limits")).rejects.toThrow(/permission denied/);
      await expect(t.as(role, "delete from public.rate_limits")).rejects.toThrow(/permission denied/);
      await expect(
        t.as(role, "select public.rate_limit_take($1, 'profile_lookup', 1000, interval '1 day')", [ALICE]),
      ).rejects.toThrow(/permission denied/);
    }
    const own = await t.as<{ action: string; hits: number }>(ALICE, "select action, hits from public.my_rate_limits()");
    expect(own).toEqual([
      { action: "handle_attempt", hits: 1 },
      { action: "profile_create", hits: 1 },
    ]);
    expect(await t.as("", "select * from public.my_rate_limits()")).toEqual([]);
    await expect(t.as(null, "select * from public.my_rate_limits()")).rejects.toThrow(/permission denied/);
    // Les contrôles internes ne sont pas appelables.
    for (const sql of [
      "select public.profiles_visible_to($1, 'members', $1)",
      "select public.profiles_before_write()",
      "select public.profiles_display_name_ok('x')",
      "select public.profiles_handle_reserved('x')",
      "select public.profiles_handle_fold('x')",
      "select public.profiles_display_name_reserved('x')",
      "select public.profiles_display_name_comparable('x')",
      "select public.profiles_inputs_bounded('a', 'b', 'c', 'd')",
    ]) {
      await expect(t.as(ALICE, sql, sql.includes("$1") ? [ALICE] : []), sql).rejects.toThrow(/permission denied/);
    }
  });
});

describe("essais d'identifiant : comptés avant de savoir si l'identifiant est pris", () => {
  it("identifiant pris (même d'un profil masqué) : réponse « handle-taken » sans erreur, essai compté", async () => {
    await create(CAROL, "carol", { visibility: "contacts" });
    await create(BOB, "bob");
    expect(await find(BOB, "carol")).toEqual([]);
    expect(await update(BOB, "CAROL")).toBe("handle-taken");
    expect(await hits(BOB, "handle_attempt")).toBe(2);
    // Rien n'a changé (ni l'identifiant, ni les autres champs), aucun changement réussi compté.
    expect(await row(BOB)).toMatchObject({ handle: "bob" });
    expect(await hits(BOB, "profile_handle")).toBe(0);
    expect(await create(ALICE, "carol")).toBe("handle-taken");
    expect(await row(ALICE)).toBeUndefined();
    expect(await hits(ALICE, "handle_attempt")).toBe(1);
    // L'essai refusé ne consomme pas le quota de créations.
    expect(await hits(ALICE, "profile_create")).toBe(0);
  });

  it("30 essais par jour au plus, réussis ou non ; garder son identifiant ne compte pas", async () => {
    await create(CAROL, "carol");
    await create(BOB, "bob");
    for (let i = 1; i < 30; i += 1) expect(await update(BOB, "carol")).toBe("handle-taken");
    await expect(update(BOB, "carol")).rejects.toThrow(/profiles_rate_limited/);
    await expect(update(BOB, "bobby")).rejects.toThrow(/profiles_rate_limited/);
    expect(await update(BOB, "BOB", { bio: "Toujours possible" })).toBe("saved");
    expect((await row(BOB)).bio).toBe("Toujours possible");
  });

  it("50 changements de nom affiché par jour : réponse sans erreur, rien n'est modifié, le refus reste compté", async () => {
    await create(BOB, "bob", { name: "Bob" });
    for (let i = 1; i <= 3; i += 1) expect(await update(BOB, "bob", { name: `Bob ${i}` })).toBe("saved");
    expect(await hits(BOB, "profile_change")).toBe(3);
    await t.db.query("update public.rate_limits set hits = 50 where user_id = $1 and action = 'profile_change'", [BOB]);
    expect(await update(BOB, "bob", { name: "Bob 51", bio: "Pas enregistré" })).toBe("rate-limited");
    expect(await hits(BOB, "profile_change")).toBe(51);
    expect(await row(BOB)).toMatchObject({ display_name: "Bob 3", bio: "" });
    // Le même nom reste enregistrable, les autres champs aussi.
    expect(await update(BOB, "bob", { name: "Bob 3", bio: "Toujours possible" })).toBe("saved");
    expect((await row(BOB)).bio).toBe("Toujours possible");
    // Fenêtre échue : le compteur repart.
    await t.db.query("update public.rate_limits set window_start = now() - interval '2 days' where user_id = $1", [BOB]);
    expect(await update(BOB, "bob", { name: "Bob neuf" })).toBe("saved");
    expect(await hits(BOB, "profile_change")).toBe(1);
  });

  it("seuls les vrais changements de nom comptent : ni un enregistrement sans changement, ni un identifiant pris", async () => {
    await create(CAROL, "carol");
    await create(BOB, "bob", { name: "Bob" });
    for (let i = 0; i < 3; i += 1) expect(await update(BOB, "bob", { name: "Bob", bio: `Bio ${i}` })).toBe("saved");
    expect(await hits(BOB, "profile_change")).toBe(0);
    expect(await update(BOB, "carol", { name: "Autre" })).toBe("handle-taken");
    expect(await hits(BOB, "profile_change")).toBe(0);
    expect((await row(BOB)).display_name).toBe("Bob");
  });

  it("un format refusé ou un identifiant réservé ne dit rien de l'existence d'un identifiant", async () => {
    await create(BOB, "bob");
    await expect(create(ALICE, "bob", { name: "" })).rejects.toThrow(/profiles_display_name/);
    await expect(create(ALICE, "support")).rejects.toThrow(/profiles_handle_reserved/);
    await expect(create(ALICE, "_x")).rejects.toThrow(/profiles_handle_format/);
  });
});

describe("contraintes : mêmes décisions que l'application", () => {
  it("identifiant : format, minuscules, unicité sans tenir compte de la casse", async () => {
    expect(await create(ALICE, "Alice_42")).toBe("created");
    expect((await row(ALICE)).handle).toBe("alice_42");
    expect(await create(BOB, "ALICE_42")).toBe("handle-taken");
    const samples = ["ab", "a".repeat(31), "_alice", "alice_", "123", "al ice", "alicé", "al-ice", "al.ice", "x".repeat(30)];
    for (const handle of samples) {
      const accepted = isHandleFormatOk(handle.toLowerCase());
      const result = create(BOB, handle).then(
        () => true,
        (error: Error) => (expect(error.message).toMatch(/profiles_handle_format/), false),
      );
      expect(await result, handle).toBe(accepted);
      await t.db.exec("delete from public.profiles where user_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; delete from public.rate_limits;");
    }
  });

  it("identifiants réservés : les mêmes listes et la même forme repliée que l'application", async () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/20261017120100_profiles.sql", import.meta.url), "utf8");
    const start = sql.indexOf("create function public.profiles_handle_reserved");
    const body = sql.slice(start, sql.indexOf("$$;", start));
    const arrays = [...body.matchAll(/array\[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((w) => w[1]));
    expect(arrays).toHaveLength(2);
    expect(arrays[0].toSorted()).toEqual([...RESERVED_HANDLES].toSorted());
    expect(arrays[1].toSorted()).toEqual([...RESERVED_HANDLE_WORDS].toSorted());
    for (const handle of ["stratavau1t", "a_d_m_1_n", "0134578_l", "hello_world", "abc", "adrnin", "r_n", "rnn", "vvv", "vvebmaster", "a1ice", "burn"]) {
      const { rows } = await t.db.query<{ folded: string }>("select public.profiles_handle_fold($1) as folded", [handle]);
      expect(rows[0].folded, handle).toBe(foldHandle(handle));
    }
    const samples = [
      "support", "admin_42", "moderateur", "stratavault_fr", "officiel", "root", "r00t", "equipe_stratavault",
      "la_moderation", "stratavau1t", "adm1n", "5upport", "team_admin", "x_officiel", "rootkit_fan", "helper", "alice",
      "adrnin", "rnoderateur", "rnodo", "vvebmaster",
    ];
    for (const handle of samples) {
      expect(await check("profiles_handle_reserved", handle), handle).toBe(isReservedHandle(handle));
    }
    for (const handle of ["equipe_stratavault", "la_moderation", "adm1n", "5upport", "adrnin", "rnoderateur", "vvebmaster"]) {
      await expect(create(BOB, handle), handle).rejects.toThrow(/profiles_handle_reserved/);
    }
    expect(await create(BOB, "rootkit_fan")).toBe("created");
  });

  it("identifiant unique sous sa forme repliée : aucune imitation d'un autre membre", async () => {
    expect(await create(ALICE, "alice")).toBe("created");
    expect(await create(BOB, "bob")).toBe("created");
    for (const lookalike of ["a1ice", "al_ice", "aiice", "a_l_i_c_e", "AL1CE"]) {
      expect(await update(BOB, lookalike, { name: "Alice" }), lookalike).toBe("handle-taken");
    }
    expect(await row(BOB)).toMatchObject({ handle: "bob", display_name: "Nom" });
    // Chaque essai est compté (et aucun changement réussi).
    expect(await hits(BOB, "handle_attempt")).toBe(6);
    expect(await hits(BOB, "profile_handle")).toBe(0);
    expect(await create(CAROL, "a1ice")).toBe("handle-taken");
    expect(await row(CAROL)).toBeUndefined();
    expect(await hits(CAROL, "profile_create")).toBe(0);
    // Son propre identifiant sous une autre forme repliée identique : permis (même ligne).
    expect(await update(ALICE, "a1ice")).toBe("saved");
    expect((await row(ALICE)).handle).toBe("a1ice");
    const { rows } = await t.db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where schemaname = 'public' and indexname = 'profiles_handle_fold_key'",
    );
    expect(rows[0]?.indexdef).toMatch(/UNIQUE INDEX .*profiles_handle_fold\(handle\)/);
  });

  it("nom affiché : refuse un nom qui laisse croire à un compte de l'équipe, comme l'application", async () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/20261017120100_profiles.sql", import.meta.url), "utf8");
    const start = sql.indexOf("create function public.profiles_display_name_reserved");
    const body = sql.slice(start, sql.indexOf("$$;", start));
    const [words] = [...body.matchAll(/array\[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'([a-z]+)'/g)].map((w) => w[1]));
    expect(words.toSorted()).toEqual([...RESERVED_DISPLAY_NAME_WORDS].toSorted());
    // Mot cherché aussi dans le nom entier, sans ses espaces.
    expect(body).toContain(`public.profiles_handle_fold('${RESERVED_DISPLAY_NAME_JOINED}')`);
    const bold = (text: string) =>
      [...text].map((c) => String.fromCodePoint((c >= "a" ? 0x1d41a - 0x61 : 0x1d400 - 0x41) + c.charCodeAt(0))).join("");
    const fullwidth = (text: string) => [...text].map((c) => String.fromCodePoint(c.charCodeAt(0) + 0xfee0)).join("");
    const names = [
      "Équipe Stratavault — Modération", "Admin", "L’administrateur", "Modérateur", "Strata-vault", "STRATAVAULT officiel",
      "Official", "Adrnin", "Adm1n du site", bold("Admin"), fullwidth("Admin"), "Ad min", "Alice", "Émile Zola", "Conrad Mint",
      "Mohammad Mina", "Supporter du PSG", "Équipe de Lyon", `Ali${String.fromCodePoint(0x3000)}ce`, "İstanbul",
      `Mod${String.fromCodePoint(0x1680)}érateur`, "Ｏｆｆｉｃｉｅｌ",
      // Confusables cyrilliques, grecs ou petites capitales, et « Strata Vault » en deux mots.
      `${String.fromCodePoint(0x405)}tratavault`, `${String.fromCodePoint(0x410)}dmin`, `${String.fromCodePoint(0x391)}dministrateur`,
      `Stratavau${String.fromCodePoint(0x4cf)}t`, [0x1d00, 0x1d05, 0x1d0d, 0x26a, 0x274].map((c) => String.fromCodePoint(c)).join(""),
      "Strata Vault", `Strata${String.fromCodePoint(0x1680)}Vault`, "Strat ava ult", "Александр Пушкин", "Σοφία Παπαδοπούλου",
    ];
    for (const name of names) {
      expect(await check("profiles_display_name_reserved", name), name).toBe(isReservedDisplayName(name));
      expect(await check("profiles_display_name_ok", name), name).toBe(displayNameProblem(name) === null);
    }
    expect(isReservedDisplayName("Équipe Stratavault — Modération")).toBe(true);
    // Même table de confusables et même forme comparable que l'application, lettre par lettre.
    const confusables = DISPLAY_NAME_CONFUSABLES.map(([from]) => from).join("");
    for (const value of [confusables, `ABC xyz ${confusables} Éé-1_2${String.fromCodePoint(0x1680)}Ω`]) {
      const { rows } = await t.db.query<{ comparable: string }>(
        "select public.profiles_display_name_comparable($1) as comparable",
        [value],
      );
      expect(rows[0].comparable).toBe(displayNameComparable(value));
    }
    expect(displayNameComparable(confusables)).toBe(DISPLAY_NAME_CONFUSABLES.map(([, to]) => to).join(""));
    await expect(create(ALICE, "jean123", { name: "Équipe Stratavault — Modération" })).rejects.toThrow(
      /profiles_display_name/,
    );
    expect(await create(ALICE, "jean123", { name: "Jean" })).toBe("created");
  });

  it("nom affiché et présentation : longueurs, lignes, caractères de contrôle, invisibles ou de remplissage", async () => {
    const char = (code: number) => String.fromCodePoint(code);
    const rlo = char(0x202e);
    const zeroWidth = char(0x200b);
    const blanks = [
      0x3164, 0x2800, 0xffa0, 0x115f, 0x1160, 0x034f, 0xfe0f, 0x180b, 0x17b4, 0x206a, 0xfff9, 0xe0041, 0xe0100, 0x1d173,
      // Reste de la propriété Default_Ignorable_Code_Point (dont des points de code non attribués).
      0xfff0, 0xfff8, 0x16fe4, 0x1bca0, 0x1bca3, 0xe0080, 0xe00ff, 0xe01f0, 0xe0fff,
    ].map(char);
    const spaces = [0xa0, 0x3000, 0x2003, 0x202f, 0x1680].map(char);
    const names = [
      "Alice", "Émile Zola", "", " Alice", "Alice ", "a".repeat(50), "a".repeat(51), `Ali${rlo}ce`, `Ali${zeroWidth}ce`,
      "A\tB", "A\nB", "Ålice 🌍", `Ale${char(0x301)}`, char(0x301), `${char(0x20d0)}x`,
      ...blanks, ...blanks.map((b) => `Alice${b}`),
      ...spaces.flatMap((s) => [`Alice${s}`, `${s}Alice`, `Ali${s}ce`]),
    ];
    for (const name of names) {
      const accepted = displayNameProblem(name) === null;
      expect(await check("profiles_display_name_ok", name), JSON.stringify(name)).toBe(accepted);
    }
    // Les cas « vides à l'écran » sont bien refusés (pas seulement concordants).
    for (const name of [...blanks, char(0x301), ...spaces.map((s) => `Alice${s}`)]) {
      expect(await check("profiles_display_name_ok", name), JSON.stringify(name)).toBe(false);
    }
    const bios = ["", "Ligne 1\nLigne 2", "a".repeat(280), "a".repeat(281), "1\n2\n3\n4\n5\n6", "1\n2\n3\n4\n5\n6\n7", `x${rlo}y`, "a\tb", "\nx", "x ", ...blanks.map((b) => `x${b}y`)];
    for (const bio of bios) {
      const normalized = bio.replace(/^[ \n]+|[ \n]+$/g, "") === bio;
      const accepted = normalized && bioProblem(bio) === null;
      expect(await check("profiles_bio_ok", bio), JSON.stringify(bio)).toBe(accepted);
    }
    await expect(create(ALICE, "alice", { name: `X${rlo}` })).rejects.toThrow(/profiles_display_name/);
    await expect(create(ALICE, "alice", { name: char(0x3164) })).rejects.toThrow(/profiles_display_name/);
    await expect(create(ALICE, "alice", { bio: "a".repeat(281) })).rejects.toThrow(/profiles_bio/);
    await expect(create(ALICE, "alice", { visibility: "public" })).rejects.toThrow(/profiles_visibility/);
  });

  it("dates tenues par la base ; un changement d'identifiant est daté", async () => {
    await create(ALICE, "alice");
    const before = await row(ALICE);
    await update(ALICE, "alice", { bio: "Nouvelle" });
    const same = await row(ALICE);
    expect([same.created_at, same.handle_changed_at]).toEqual([before.created_at, before.handle_changed_at]);
    expect(await update(ALICE, "ALICIA")).toBe("saved");
    expect((await row(ALICE)).handle).toBe("alicia");
  });
});

describe("public.profile_by_handle : identifiant exact, visibilité, anti-énumération", () => {
  it("trouve un profil « members » par son identifiant exact (casse et @ ignorés côté application)", async () => {
    await create(BOB, "bob_le_bricoleur", { name: "Bob", bio: "Cartographe" });
    expect(await find(ALICE, "BOB_le_bricoleur")).toEqual([
      { handle: "bob_le_bricoleur", display_name: "Bob", bio: "Cartographe", avatar_id: null, is_self: false },
    ]);
    // Jamais par début d'identifiant, motif ou nom affiché.
    for (const guess of ["bob", "bob%", "bob_le_bricoleu_", "Bob", "%", "", "   "]) expect(await find(ALICE, guess), guess).toEqual([]);
  });

  it("profil « contacts » : invisible pour un membre sans relation, même réponse qu'un identifiant inconnu", async () => {
    await create(BOB, "bob", { visibility: "contacts" });
    expect(await find(ALICE, "bob")).toEqual([]);
    expect(await find(ALICE, "inconnu")).toEqual([]);
    expect(await find(BOB, "bob")).toEqual([{ handle: "bob", display_name: "Nom", bio: "", avatar_id: null, is_self: true }]);
  });

  it("ne renvoie jamais l'identifiant du compte ; entrée bornée avant toute transformation", async () => {
    await create(BOB, "bob");
    const [found] = await find(ALICE, "bob");
    expect(Object.keys(found).toSorted()).toEqual(["avatar_id", "bio", "display_name", "handle", "is_self"]);
    expect(JSON.stringify(found)).not.toContain(BOB);
    expect(await find(ALICE, "b".repeat(100_000))).toEqual([]);
  });

  it("300 consultations par heure et par compte au plus", async () => {
    await create(BOB, "bob");
    await t.db.query(
      "insert into public.rate_limits (user_id, action, window_start, hits) values ($1, 'profile_lookup', now(), 300)",
      [ALICE],
    );
    await expect(find(ALICE, "bob")).rejects.toThrow(/profiles_rate_limited/);
    // Un identifiant mal formé ne compte pas (aucune requête) ; les autres comptes ne sont pas touchés.
    expect(await find(ALICE, "x")).toEqual([]);
    expect(await find(CAROL, "bob")).toHaveLength(1);
    // Fenêtre échue : le compteur repart.
    await t.db.query("update public.rate_limits set window_start = now() - interval '2 hours' where user_id = $1", [ALICE]);
    expect(await find(ALICE, "bob")).toHaveLength(1);
    expect(await hits(ALICE, "profile_lookup")).toBe(1);
  });
});

describe("limites anti-abus des écritures réussies", () => {
  it("5 changements d'identifiant par jour", async () => {
    await create(ALICE, "alice");
    for (let i = 1; i <= 5; i += 1) expect(await update(ALICE, `alice_${i}`)).toBe("saved");
    await expect(update(ALICE, "alice_6")).rejects.toThrow(/profiles_rate_limited/);
    // Les autres champs restent modifiables ; garder le même identifiant ne compte pas.
    expect(await update(ALICE, "alice_5", { bio: "ok" })).toBe("saved");
    expect((await row(ALICE)).bio).toBe("ok");
  });

  it("5 créations de profil par jour (supprimer puis recréer pour accaparer des identifiants)", async () => {
    for (let i = 1; i <= 5; i += 1) {
      expect(await create(ALICE, `alice_${i}`)).toBe("created");
      await t.as(ALICE, "delete from public.profiles");
    }
    await expect(create(ALICE, "alice_6")).rejects.toThrow(/profiles_rate_limited/);
  });
});

describe("suppression du compte", () => {
  it("le profil et les compteurs du compte sont supprimés en cascade, pas ceux des autres", async () => {
    const DAVE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await t.addUsers(DAVE);
    await create(DAVE, "dave");
    await create(BOB, "bob");
    await find(DAVE, "bob");
    await t.db.query("delete from auth.users where id = $1", [DAVE]);
    const left = await t.db.query<{ user_id: string }>("select user_id from public.profiles");
    expect(left.rows).toEqual([{ user_id: BOB }]);
    expect((await t.db.query("select * from public.rate_limits where user_id = $1", [DAVE])).rows).toEqual([]);
  });

  it("les fonctions SECURITY DEFINER s'exécutent avec un search_path vide", async () => {
    const { rows } = await t.db.query<{ name: string; config: string[] | null }>(
      "select proname as name, proconfig as config from pg_proc where prosecdef and pronamespace = 'public'::regnamespace",
    );
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (const fn of rows) expect(fn.config, fn.name).toEqual(['search_path=""']);
  });
});
