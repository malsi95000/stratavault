// Coût borné des écritures par les fonctions public.create_map / public.update_map_data, et quotas
// par compte, sur un vrai PostgreSQL (PGlite, compilé en WebAssembly : plus lent qu'un serveur).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BLANK_DOC, openTestDb, type TestDb } from "@/test/pglite";
import { MAX_MAP_BYTES } from "./limits";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DAVE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ERIN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

let t: TestDb;
const create = (userId: string, data: string, name = "Carte") =>
  t.as<{ id: string; revision: string }>(userId, "select id, revision::text from public.create_map($1, $2)", [name, data]);
const update = (userId: string, id: string, data: string, revision: string) =>
  t.as<{ id: string }>(userId, "select id from public.update_map_data($1, $2, $3)", [id, data, revision]);

/** Durée d'une promesse (ms), qu'elle réussisse ou échoue. */
async function timed(run: () => Promise<unknown>): Promise<{ ms: number; error: unknown }> {
  const start = performance.now();
  let error: unknown = null;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  return { ms: performance.now() - start, error };
}

/**
 * Remplit l'unique « [[]] » de `shell` de nombres « 1 » (2 octets chacun) jusqu'à `bytes` octets :
 * le contenu le plus fragmenté possible pour cette taille.
 */
function fragmented(shell: object, bytes: number): string {
  const text = JSON.stringify(shell);
  const count = Math.floor((bytes - text.length + 1) / 2);
  return text.replace("[[]]", `[[${new Array(count).fill("1").join(",")}]]`);
}

/** Ce que la forme d'une carte laisse passer : un seul sommet de zone, rempli de nombres. */
const ZONE_SHELL = { ...BLANK_DOC, zones: [{ id: "z1", ring: [[]], title: "", note: "" }] };
/** Même volume sous une clé inconnue (l'attaque d'origine) : refusé après lecture. */
const PAD_SHELL = { ...BLANK_DOC, pad: [[]] };

beforeAll(async () => {
  t = await openTestDb();
  await t.addUsers(ALICE, DAVE, ERIN);
}, 60_000);

afterAll(async () => {
  await t?.db.close();
});

describe("coût d'une écriture", () => {
  it("contenu fragmenté au maximum autorisé (≈ 2 millions de nombres) : traité en un temps raisonnable", async () => {
    const data = fragmented(ZONE_SHELL, MAX_MAP_BYTES);
    expect(data.length).toBeLessThanOrEqual(MAX_MAP_BYTES);
    expect(data.length).toBeGreaterThan(MAX_MAP_BYTES - 10);
    const created = await timed(() => create(ALICE, data));
    expect(created.error).toBeNull();
    // Environ une seconde ici (WebAssembly) ; l'attaque d'origine (8 Mo) prenait plus de 100 s.
    expect(created.ms).toBeLessThan(10_000);
    // Même contenu sous une clé inconnue : refusé après lecture, dans le même ordre de temps.
    const refused = await timed(() => create(ALICE, fragmented(PAD_SHELL, MAX_MAP_BYTES)));
    expect(String(refused.error)).toMatch(/maps_invalid/);
    expect(refused.ms).toBeLessThan(10_000);
  }, 60_000);

  it("contenu trop gros (8 Mo, 4 millions de nombres) : refusé tout de suite, sans être lu", async () => {
    const data = `[${new Array(4_000_000).fill("1").join(",")}]`;
    const [map] = await create(ALICE, JSON.stringify(BLANK_DOC));
    const created = await timed(() => create(ALICE, data));
    expect(String(created.error)).toMatch(/maps_too_large/);
    const updated = await timed(() => update(ALICE, map.id, data, map.revision));
    expect(String(updated.error)).toMatch(/maps_too_large/);
    // Le temps de transmettre la valeur à la base (aucune conversion en jsonb).
    expect(Math.max(created.ms, updated.ms)).toBeLessThan(1_000);
  }, 60_000);
});

describe("quotas par compte (déclencheur maps_enforce_quota)", () => {
  it("limite le nombre de cartes par compte", async () => {
    await t.db.query(
      "insert into public.maps (user_id, name, data) select $1, 'm' || i, '{}' from generate_series(1, 500) i",
      [DAVE],
    );
    await expect(create(DAVE, JSON.stringify(BLANK_DOC), "Une de trop")).rejects.toThrow(/maps_quota_exceeded/);
  });

  it("limite le volume total des cartes d'un compte (50 Mo), sans empêcher d'alléger une carte", async () => {
    // Sept cartes de 7,1 Mo (49,7 Mo au total), écrites avant les fonctions d'écriture.
    await t.db.query(
      "insert into public.maps (user_id, name, data) select $1, 'gros ' || i, jsonb_build_object('n', repeat('x', 7100000)) from generate_series(1, 7) i",
      [ERIN],
    );
    const big = JSON.stringify({ ...BLANK_DOC, notes: { FRA: "x".repeat(3_900_000) } });
    const small = JSON.stringify(BLANK_DOC);
    await expect(create(ERIN, big)).rejects.toThrow(/maps_quota_exceeded/);
    // Agrandir une carte au-delà de la limite est refusé.
    const [mine] = await create(ERIN, small, "Petite");
    await expect(update(ERIN, mine.id, big, mine.revision)).rejects.toThrow(/maps_quota_exceeded/);
    // Alléger une carte reste possible, et libère la place.
    const { rows } = await t.db.query<{ id: string; revision: string }>(
      "select id, revision::text from public.maps where user_id = $1 and name = 'gros 1'",
      [ERIN],
    );
    expect(await update(ERIN, rows[0].id, small, rows[0].revision)).toHaveLength(1);
    expect(await create(ERIN, big, "À nouveau")).toHaveLength(1);
    // Le volume est tenu par la base : le client ne peut pas l'écrire.
    await expect(t.as(ERIN, "update public.maps set data_bytes = 0 where id = $1", [mine.id])).rejects.toThrow(
      /permission denied/,
    );
  }, 60_000);
});
