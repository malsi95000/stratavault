import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COUNTRIES } from "@/data/countries";
import { addPing } from "@/features/map-doc/ops";
import { V2_EXPORT } from "@/features/map-doc/fixtures";
import { blankDoc, parseMapDoc } from "@/features/map-doc/schema";
import { portableDoc } from "@/features/map-doc/schemaV2";
import type { MapDoc } from "@/features/map-doc/types";
import { classifyDbError } from "@/lib/supabase/maps";
import { createFakeDb } from "@/test/fakeSupabase";
import type { FakeDb } from "@/test/fakeSupabase";
import * as actions from "./actions";
import { MAX_MAP_BYTES, jsonByteLength } from "./limits";

// Utilisateur vérifié (getUser, auprès de l'API Auth) et client Supabase simulés.
const mocks = vi.hoisted(() => ({
  user: { value: null as { id: string; email: string | null } | null },
  // Vérification de session impossible (Supabase injoignable).
  authDown: { value: false },
  db: { value: null as FakeDb | null },
}));

vi.mock("@/lib/supabase/user", () => ({
  checkActiveUser: async () => {
    if (mocks.authDown.value) return { status: "unavailable" };
    return mocks.user.value ? { status: "signed-in", user: mocks.user.value } : { status: "signed-out" };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => (mocks.user.value && mocks.db.value ? mocks.db.value.clientFor(mocks.user.value.id) : null),
}));

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const signIn = (id: string) => {
  mocks.user.value = { id, email: `${id.slice(0, 4)}@exemple.fr` };
};

// Les actions, appelées pour le compte de l'utilisateur connecté (celui pour lequel la page a été ouverte).
const me = () => mocks.user.value?.id ?? ALICE;
const listMaps = () => actions.listMaps(me());
const getMap = (id: string) => actions.getMap(me(), id);
const createMap = (name: string, doc: MapDoc) => actions.createMap(me(), name, doc);
const updateMap = (id: string, doc: MapDoc, revision = 1) => actions.updateMap(me(), id, doc, revision);
const renameMap = (id: string, name: string) => actions.renameMap(me(), id, name);
const deleteMap = (id: string) => actions.deleteMap(me(), id);

const withPing = (): MapDoc => addPing(blankDoc(), [2.35, 48.85], "crise", "p1")!.doc;
/** Contenu tel qu'il est enregistré : sans les clés v2 vides (format v1 si rien de nouveau). */
const stored = (doc: MapDoc) => portableDoc(doc);

let db: FakeDb;
beforeEach(() => {
  db = createFakeDb();
  mocks.db.value = db;
  signIn(ALICE);
});
afterEach(() => {
  mocks.user.value = null;
  mocks.authDown.value = false;
  vi.restoreAllMocks();
});

const created = async (name = "Sahel", doc: MapDoc = withPing()) => {
  const result = await createMap(name, doc);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("Server Actions des cartes", () => {
  it("refusent tout sans utilisateur connecté, sans toucher à la base", async () => {
    mocks.user.value = null;
    const results = await Promise.all([
      listMaps(),
      getMap(ALICE),
      createMap("Sahel", withPing()),
      updateMap(ALICE, withPing()),
      renameMap(ALICE, "Nom"),
      deleteMap(ALICE),
    ]);
    for (const result of results) expect(result).toEqual({ ok: false, error: "unauthorized" });
    expect(db.rows).toEqual([]);
  });

  it("Supabase injoignable à la vérification : erreur passagère (« unavailable »), pas « session expirée »", async () => {
    mocks.authDown.value = true;
    expect(await listMaps()).toEqual({ ok: false, error: "unavailable" });
    expect(await updateMap(ALICE, withPing())).toEqual({ ok: false, error: "unavailable" });
    expect(db.rows).toEqual([]);
  });

  it("refusent tout si la session appartient à un autre compte que celui de la page", async () => {
    const alice = await created("Carte d'Alice");
    // Alice s'est déconnectée dans un autre onglet, Bob s'y est connecté : l'onglet d'Alice appelle encore.
    signIn(BOB);
    const results = await Promise.all([
      actions.listMaps(ALICE),
      actions.getMap(ALICE, alice.id),
      actions.createMap(ALICE, "Carte d'Alice", withPing()),
      actions.updateMap(ALICE, alice.id, blankDoc(), alice.revision),
      actions.renameMap(ALICE, alice.id, "Nom"),
      actions.deleteMap(ALICE, alice.id),
      actions.listMaps(undefined as unknown as string),
    ]);
    for (const result of results) expect(result).toEqual({ ok: false, error: "unauthorized" });
    expect(db.rows.map((row) => row.user_id)).toEqual([ALICE]);
    expect(db.rows[0].data).toEqual(stored(withPing()));
  });

  it("créent, listent, relisent, renomment, mettent à jour et suppriment une carte", async () => {
    const info = await created("  Sahel  ");
    expect(info).toEqual({ id: expect.any(String), name: "Sahel", updated: expect.any(String), revision: 1 });
    // Aucune colonne inutile : ni user_id, ni created_at, ni contenu.
    expect(Object.keys(info).sort()).toEqual(["id", "name", "revision", "updated"]);
    expect(new Date(info.updated).toISOString()).toBe(info.updated);

    const list = await listMaps();
    expect(list).toEqual({
      ok: true,
      value: [{ ...info, stats: "0 pays annotés · 0 liens · 1 balises · 0 zones · 0 textes", cover: null }],
    });

    expect(await getMap(info.id)).toEqual({ ok: true, value: { ...info, data: stored(withPing()) } });

    const renamed = await renameMap(info.id, "Sahel 2026");
    expect(renamed.ok && renamed.value?.name).toBe("Sahel 2026");
    // Renommer ne change pas la date (comme la bêta).
    expect(renamed.ok && renamed.value?.updated).toBe(info.updated);

    const updated = await updateMap(info.id, blankDoc());
    expect(updated.ok && updated.value).toMatchObject({ id: info.id, name: "Sahel 2026" });
    expect(updated.ok && updated.value!.updated > info.updated).toBe(true);
    expect(updated.ok && updated.value!.revision).toBe(2);
    expect(db.rows[0].data).toEqual(stored(blankDoc()));
    const relisted = await listMaps();
    expect(relisted.ok && relisted.value[0].stats).toBe("0 pays annotés · 0 liens · 0 balises · 0 zones · 0 textes");

    expect(await deleteMap(info.id)).toEqual({ ok: true, value: null });
    expect(db.rows).toEqual([]);
  });

  it("ne remplacent pas un contenu modifié depuis la version attendue (autre appareil) : « conflict »", async () => {
    const info = await created();
    // L'appareil B enregistre une nouvelle version (révision 2).
    expect((await actions.updateMap(ALICE, info.id, blankDoc(), 1)).ok).toBe(true);
    // L'appareil A, resté sur la révision 1, ne l'écrase pas.
    expect(await actions.updateMap(ALICE, info.id, withPing(), 1)).toEqual({ ok: false, error: "conflict" });
    expect(db.rows[0]).toMatchObject({ data: stored(blankDoc()), revision: 2 });
    // À la bonne version, l'écriture passe.
    const next = await actions.updateMap(ALICE, info.id, withPing(), 2);
    expect(next.ok && next.value?.revision).toBe(3);
    // Version absente ou mal formée : conflit, jamais une écriture sans contrôle de version.
    for (const revision of [undefined, null, 0, -1, 1.5, "3", Number.MAX_SAFE_INTEGER + 2]) {
      expect(await actions.updateMap(ALICE, info.id, blankDoc(), revision as number)).toEqual({
        ok: false,
        error: "conflict",
      });
    }
    expect(db.rows[0]).toMatchObject({ data: stored(withPing()), revision: 3 });
    // Carte supprimée : null (pas un conflit).
    await deleteMap(info.id);
    expect(await actions.updateMap(ALICE, info.id, withPing(), 3)).toEqual({ ok: true, value: null });
  });

  it("isolent les cartes par user_id, même sans RLS", async () => {
    const alice = await created("Carte d'Alice");
    signIn(BOB);
    const bob = await created("Carte de Bob");

    const list = await listMaps();
    expect(list.ok && list.value.map((m) => m.name)).toEqual(["Carte de Bob"]);
    expect(await getMap(alice.id)).toEqual({ ok: true, value: null });
    expect(await updateMap(alice.id, blankDoc())).toEqual({ ok: true, value: null });
    expect(await renameMap(alice.id, "Volée")).toEqual({ ok: true, value: null });
    await deleteMap(alice.id);

    const aliceRow = db.rows.find((row) => row.id === alice.id)!;
    expect(aliceRow).toMatchObject({ user_id: ALICE, name: "Carte d'Alice", data: stored(withPing()) });
    expect(db.rows.find((row) => row.id === bob.id)?.user_id).toBe(BOB);
  });

  it("n'écrivent jamais user_id : la base le fixe (auth.uid())", async () => {
    const info = await created();
    await updateMap(info.id, withPing());
    await renameMap(info.id, "Autre");
    for (const write of [...db.writes, ...db.calls.map((call) => call.args)]) {
      expect(Object.keys(write)).not.toContain("user_id");
      expect(Object.keys(write)).not.toContain("stats");
    }
    expect(db.rows.map((row) => row.user_id)).toEqual([ALICE]);
  });

  it("écrivent le contenu par les fonctions de la base, en texte (JSON compact de la carte normalisée)", async () => {
    const info = await created("Sahel", withPing());
    await updateMap(info.id, blankDoc());
    expect(db.calls).toEqual([
      { fn: "create_map", args: { p_name: "Sahel", p_data: JSON.stringify(portableDoc(parseMapDoc(withPing())!)) } },
      { fn: "update_map_data", args: { p_id: info.id, p_data: JSON.stringify(portableDoc(blankDoc())), p_expected_revision: 1 } },
    ]);
    // Aucune écriture directe du contenu (la base les refuse) ; seul le nom s'écrit directement.
    await renameMap(info.id, "Autre");
    expect(db.writes).toEqual([{ name: "Autre" }]);
  });

  it("une carte sans ajout du format v2 part au format v1 (9 clés, accepté aussi par la base d'avant la bêta 2.1)", async () => {
    const V1_KEYS = ["notes", "dates", "links", "pings", "points", "zones", "texts", "flux", "fluxFiches"];
    const info = await created("Sahel", withPing());
    const sent = JSON.parse(String(db.calls[0].args.p_data));
    expect(Object.keys(sent).sort()).toEqual([...V1_KEYS].sort());
    // Une carte qui utilise le format v2 garde ses ajouts.
    const v2 = parseMapDoc(V2_EXPORT)!;
    await updateMap(info.id, v2);
    expect(JSON.parse(String(db.calls[1].args.p_data))).toEqual(JSON.parse(JSON.stringify(portableDoc(v2))));
    expect(Object.keys(JSON.parse(String(db.calls[1].args.p_data)))).toEqual(expect.arrayContaining(["fiches"]));
  });

  it("l'identifiant d'une nouvelle carte est toujours choisi par la base, jamais par le navigateur", async () => {
    // Un ancien navigateur (ou un appel forgé) qui proposerait l'identifiant d'une carte supprimée.
    const proposed = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const createWithId = actions.createMap as unknown as (...args: unknown[]) => ReturnType<typeof actions.createMap>;
    const result = await createWithId(ALICE, "Sahel", withPing(), proposed);
    expect(result.ok && result.value.id).not.toBe(proposed);
    expect(Object.keys(db.calls[0].args).sort()).toEqual(["p_data", "p_name"]);
  });

  it("listent sans lire le contenu des cartes ; une carte qui n'a pas la forme d'une carte est signalée", async () => {
    const info = await created();
    // Le contenu n'est pas relu : seules comptent les statistiques tenues par la base.
    db.rows[0].data = "contenu jamais lu";
    expect(await listMaps()).toEqual({
      ok: true,
      value: [{ ...info, stats: "0 pays annotés · 0 liens · 1 balises · 0 zones · 0 textes", cover: null }],
    });
    db.rows[0].stats = null;
    expect(await listMaps()).toEqual({ ok: true, value: [{ ...info, stats: null, cover: null }] });
    db.rows[0].stats = { notes: -1 };
    expect(await listMaps()).toEqual({ ok: true, value: [{ ...info, stats: null, cover: null }] });
  });

  it("valident les identifiants et les noms", async () => {
    for (const id of ["1", "../maps", "", "p1"]) {
      expect(await getMap(id)).toEqual({ ok: false, error: "invalid" });
      expect(await deleteMap(id)).toEqual({ ok: false, error: "invalid" });
    }
    expect(await getMap(42 as unknown as string)).toEqual({ ok: false, error: "invalid" });
    expect(await createMap("   ", withPing())).toEqual({ ok: false, error: "invalid" });
    expect(await createMap("x".repeat(121), withPing())).toEqual({ ok: false, error: "invalid" });
    const info = await created();
    expect(await renameMap(info.id, "")).toEqual({ ok: false, error: "invalid" });
    expect(await renameMap(info.id, { name: "x" } as unknown as string)).toEqual({ ok: false, error: "invalid" });
  });

  it("valident les cartes avec parseMapDoc et enregistrent la version normalisée", async () => {
    const bad = [null, "carte", [], { notes: "x" }, { ...blankDoc(), pings: [{ id: "<script>", ll: [0, 0] }] }];
    for (const doc of bad) {
      expect(await createMap("Sahel", doc as unknown as MapDoc)).toEqual({ ok: false, error: "invalid" });
    }
    const info = await created();
    expect(await updateMap(info.id, { notes: 1 } as unknown as MapDoc)).toEqual({ ok: false, error: "invalid" });

    // Ancien lien « FRA » de la bêta : normalisé en « c:FRA ».
    const legacy = {
      ...blankDoc(),
      links: [{ id: "l1", a: "FRA", b: "DEU", title: "", note: "" }],
    } as unknown as MapDoc;
    const saved = await created("Bêta", legacy);
    const row = db.rows.find((r) => r.id === saved.id)!;
    expect((row.data as MapDoc).links[0]).toMatchObject({ a: "c:FRA", b: "c:DEU" });
  });

  it("refusent une carte trop volumineuse", async () => {
    // 30 notes de 99 000 « é » (2 octets chacun) : environ 6 Mo, au-delà de la limite.
    const notes = Object.fromEntries(COUNTRIES.slice(0, 30).map((c) => [c.code, "é".repeat(99_000)]));
    const big: MapDoc = { ...blankDoc(), notes };
    expect(jsonByteLength(big)).toBeGreaterThan(MAX_MAP_BYTES);
    expect(await createMap("Sahel", big)).toEqual({ ok: false, error: "too-large" });
    const info = await created();
    expect(await updateMap(info.id, big)).toEqual({ ok: false, error: "too-large" });
    expect(db.rows[0].data).toEqual(stored(withPing()));
  });

  it("renvoient des erreurs génériques, sans message de la base", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    db.failNext = { code: "08006", message: "connexion perdue : secret interne" };
    const result = await listMaps();
    expect(result).toEqual({ ok: false, error: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(error.mock.calls.flat().join(" ")).not.toContain("secret");

    db.failNext = { code: "P0001", message: "maps_quota_exceeded" };
    expect(await createMap("Sahel", withPing())).toEqual({ ok: false, error: "quota" });
    const info = await created();
    db.failNext = { code: "P0001", message: "maps_quota_exceeded" };
    expect(await updateMap(info.id, blankDoc())).toEqual({ ok: false, error: "quota" });
  });
});

describe("classifyDbError", () => {
  it("classe les erreurs de PostgreSQL et de PostgREST", () => {
    expect(classifyDbError({ code: "P0001", message: "maps_quota_exceeded" })).toBe("quota");
    expect(classifyDbError({ code: "P0001", message: "maps_too_large" })).toBe("too-large");
    expect(classifyDbError({ code: "P0001", message: "maps_invalid" })).toBe("invalid");
    expect(classifyDbError({ code: "P0001", message: "maps_conflict" })).toBe("conflict");
    expect(classifyDbError({ code: "P0001", message: "autre" })).toBe("unavailable");
    expect(classifyDbError({ code: "P0001", message: "toString" })).toBe("unavailable");
    // Fonction appelée sans utilisateur (auth.uid() nul).
    expect(classifyDbError({ code: "42501", message: "maps_not_authenticated" })).toBe("unauthorized");
    // Fonction absente (migration pas encore appliquée) : passager, pas « session expirée ».
    expect(classifyDbError({ code: "PGRST202", message: "Could not find the function" })).toBe("unavailable");
    expect(classifyDbError({ code: "23514", message: 'violates check constraint "maps_data_size"' })).toBe("too-large");
    expect(classifyDbError({ code: "23514", message: 'violates check constraint "maps_name_length"' })).toBe("invalid");
    expect(classifyDbError({ code: "23505" })).toBe("invalid");
    expect(classifyDbError({ code: "42501" })).toBe("unauthorized");
    expect(classifyDbError({ code: "PGRST301" })).toBe("unauthorized");
    expect(classifyDbError({})).toBe("unavailable");
  });
});

describe("Server Action du logo d'une carte (setMapCover)", () => {
  const icon = { kind: "icon" as const, icon: "anchor" as const, color: "corail" as const };
  const setCover = (id: string, cover: unknown) => actions.setMapCover(me(), id, cover as never);

  it("écrit le logo par la fonction de la base, sans changer la date ni la version, et le liste", async () => {
    const info = await created();
    expect(await setCover(info.id, { ...icon, color: "#ABCDEF" })).toEqual({ ok: true, value: true });
    // Couleur normalisée, envoyée en texte (JSON compact).
    expect(db.calls.at(-1)).toEqual({
      fn: "set_map_cover",
      args: { p_id: info.id, p_cover: JSON.stringify({ ...icon, color: "#abcdef" }) },
    });
    const list = await listMaps();
    expect(list.ok && list.value[0]).toMatchObject({ updated: info.updated, revision: info.revision });
    expect(list.ok && list.value[0].cover).toEqual({ ...icon, color: "#abcdef" });

    expect(await setCover(info.id, null)).toEqual({ ok: true, value: true });
    expect(db.calls.at(-1)?.args.p_cover).toBeNull();
    const cleared = await listMaps();
    expect(cleared.ok && cleared.value[0].cover).toBeNull();
  });

  it("ne touche pas la carte d'un autre compte et refuse sans utilisateur connecté", async () => {
    const alice = await created();
    signIn(BOB);
    expect(await setCover(alice.id, icon)).toEqual({ ok: true, value: false });
    expect(db.rows[0].cover).toBeUndefined();
    mocks.user.value = null;
    expect(await setCover(alice.id, icon)).toEqual({ ok: false, error: "unauthorized" });
  });

  it("refuse un logo ou un identifiant invalides, sans appeler la base", async () => {
    const info = await created();
    const calls = db.calls.length;
    for (const cover of [
      { ...icon, icon: "inconnue" },
      { ...icon, color: "red" },
      { kind: "preview", svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' },
      { kind: "autre" },
      "logo",
      undefined,
    ]) {
      expect(await setCover(info.id, cover)).toEqual({ ok: false, error: "invalid" });
    }
    expect(await setCover("pas-un-uuid", icon)).toEqual({ ok: false, error: "invalid" });
    expect(db.calls.length).toBe(calls);
  });

  it("une carte dont le logo stocké est illisible est listée sans logo", async () => {
    const info = await created();
    db.rows[0].cover = { kind: "icon", icon: "anchor", color: "url(#x)" };
    const list = await listMaps();
    expect(list.ok && list.value[0]).toMatchObject({ id: info.id, cover: null });
  });
});
