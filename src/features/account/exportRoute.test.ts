// GET /compte/export (src/app/compte/export/route.ts) : réservé à l'utilisateur vérifié, en-têtes
// du téléchargement, refus des requêtes venues d'un autre site, limites de fréquence et de
// simultanéité, fichier produit carte par carte. Client Supabase et en-têtes de Next simulés.
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "@/app/compte/export/route";
import { resetAuthRateLimits } from "@/features/auth/rateLimit";
import { ACCOUNT_EXPORT_FORMAT, EXPORT_FIRST_READ_TIMEOUT_MS, EXPORT_IDLE_TIMEOUT_MS } from "./exportData";
import { MAX_CONCURRENT_EXPORTS, MAX_EXPORTS_PER_IP, exportSlotCount, resetExportSlots } from "./exportSlots";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Row = { id: string; user_id: string; name: string; created_at: string; updated_at: string; revision: number; data: unknown };

const row = (id: string, userId: string, name: string): Row => ({
  id,
  user_id: userId,
  name,
  created_at: "2026-10-01T10:00:00+00:00",
  updated_at: "2026-10-02T10:00:00+00:00",
  revision: 3,
  data: { notes: { FRA: name } },
});

const mocks = vi.hoisted(() => ({
  configured: { value: true },
  ip: { value: "203.0.113.7" },
  getUser: vi.fn(),
  /** Table maps simulée, SANS RLS : la route doit filtrer elle-même sur user_id. */
  rows: [] as unknown[],
  dbError: { value: null as { code: string } | null },
  queries: [] as { columns: string; filters: [string, unknown][] }[],
  /** Échec de la lecture du contenu d'une carte (après le début du fichier). */
  dataError: { value: null as { code: string } | null },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (!mocks.configured.value) return null;
    return {
      auth: { getUser: mocks.getUser },
      from: (table: string) => {
        expect(table).toBe("maps");
        const query = { columns: "", filters: [] as [string, unknown][] };
        mocks.queries.push(query);
        const builder = {
          select: (columns: string) => ((query.columns = columns), builder),
          eq: (column: string, value: unknown) => (query.filters.push([column, value]), builder),
          order: () => builder,
          limit: () => builder,
          /** Contenu d'une carte : `data::text`, comme PostgREST (texte JSON de la base). */
          maybeSingle: async () => {
            expect(query.columns).toBe("data::text");
            if (mocks.dataError.value) return { data: null, error: mocks.dataError.value };
            const [found] = matching();
            return { data: found ? { data: JSON.stringify(found.data) } : null, error: null };
          },
          then: (resolve: (result: unknown) => unknown) => {
            // Liste des cartes : jamais leur contenu.
            const columns = query.columns.split(",").map((c) => c.trim());
            const data = matching().map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])));
            return Promise.resolve(resolve(mocks.dbError.value ? { data: null, error: mocks.dbError.value } : { data, error: null }));
          },
        };
        const matching = () =>
          (mocks.rows as Record<string, unknown>[]).filter((r) =>
            query.filters.every(([column, value]) => r[column] === value),
          );
        return builder;
      },
    };
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": mocks.ip.value }),
  cookies: async () => ({ getAll: () => [], set: () => {}, delete: () => {} }),
}));

const signedInAs = (id: string) =>
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id,
        email: "alice@exemple.fr",
        created_at: "2026-09-01T08:00:00Z",
        email_confirmed_at: "2026-09-01T08:05:00Z",
        last_sign_in_at: "2026-10-08T20:00:00Z",
      },
    },
    error: null,
  });

beforeEach(() => {
  mocks.configured.value = true;
  mocks.ip.value = "203.0.113.7";
  mocks.rows = [row("11111111-1111-4111-8111-111111111111", ALICE, "Sahel"), row("22222222-2222-4222-8222-222222222222", BOB, "Secret de Bob")];
  mocks.dbError.value = null;
  mocks.dataError.value = null;
  mocks.queries.length = 0;
  resetExportSlots();
  mocks.getUser.mockReset();
  signedInAs(ALICE);
  resetAuthRateLimits();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetExportSlots();
});

/** Requête du lien de /compte (même origine) ; `site` : valeur de Sec-Fetch-Site, ou null pour aucune. */
const get = (site: string | null = "same-origin") =>
  new Request("http://localhost:3000/compte/export", { headers: site === null ? {} : { "sec-fetch-site": site } });

/** Télécharge le fichier en entier (le corps est un flux). */
const download = async () => {
  const response = await GET(get());
  expect(response.status).toBe(200);
  await response.text();
};

const expectRedirect = (response: Response, location: string) => {
  expect(response.status).toBe(303);
  expect(response.headers.get("Location")).toBe(location);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
};

describe("GET /compte/export", () => {
  it("télécharge le compte et toutes ses cartes, sans cache", async () => {
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="stratavault-donnees-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    const body = await response.json();
    expect(body.format).toBe(ACCOUNT_EXPORT_FORMAT);
    expect(body.account).toEqual({
      id: ALICE,
      email: "alice@exemple.fr",
      createdAt: "2026-09-01T08:00:00Z",
      emailConfirmedAt: "2026-09-01T08:05:00Z",
      lastSignInAt: "2026-10-08T20:00:00Z",
    });
    expect(body.maps).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Sahel",
        createdAt: "2026-10-01T10:00:00+00:00",
        updatedAt: "2026-10-02T10:00:00+00:00",
        revision: 3,
        data: { notes: { FRA: "Sahel" } },
      },
    ]);
  });

  it("ne lit que les cartes de l'utilisateur vérifié (filtre user_id, en plus de la RLS)", async () => {
    await download();
    // Liste sans contenu, puis le contenu de chaque carte, toujours filtré sur user_id.
    expect(mocks.queries).toHaveLength(2);
    expect(mocks.queries[0].filters).toEqual([["user_id", ALICE]]);
    expect(mocks.queries[0].columns).not.toContain("data");
    expect(mocks.queries[1]).toEqual({
      columns: "data::text",
      filters: [
        ["user_id", ALICE],
        ["id", "11111111-1111-4111-8111-111111111111"],
      ],
    });
    signedInAs(BOB);
    const body = await (await GET(get())).json();
    expect(body.maps.map((m: { name: string }) => m.name)).toEqual(["Secret de Bob"]);
  });

  it("JSON compact, produit carte par carte ; une carte supprimée pendant l'export est omise", async () => {
    mocks.rows.push(
      row("33333333-3333-4333-8333-333333333333", ALICE, "Arctique"),
      row("44444444-4444-4444-8444-444444444444", ALICE, "Pacifique"),
    );
    const response = await GET(get());
    // Rien n'est lu avant que le navigateur ne lise le fichier : seule la liste a été demandée.
    expect(mocks.queries).toHaveLength(1);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = decoder.decode((await reader.read()).value);
    expect(text.endsWith('"maps":[')).toBe(true);
    expect(mocks.queries).toHaveLength(1);
    text += decoder.decode((await reader.read()).value);
    expect(mocks.queries).toHaveLength(2);
    // « Arctique » supprimée entre la liste et la lecture de son contenu.
    mocks.rows = mocks.rows.filter((r) => (r as { name: string }).name !== "Arctique");
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) text += decoder.decode(chunk.value);
    expect(text).not.toContain("\n");
    const body = JSON.parse(text);
    expect(body.maps.map((m: { name: string }) => m.name)).toEqual(["Sahel", "Pacifique"]);
    expect(body.maps[1].data).toEqual({ notes: { FRA: "Pacifique" } });
  });

  it("refuse une requête venue d'un autre site, sans rien lire ni consommer le quota", async () => {
    for (const site of ["cross-site", "same-site"]) {
      expectRedirect(await GET(get(site)), "/compte");
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.queries).toHaveLength(0);
    // Adresse tapée ou favori (none), navigateur sans l'en-tête : acceptés.
    for (const site of ["none", null]) {
      const response = await GET(get(site));
      expect(response.status).toBe(200);
      await response.text();
    }
  });

  it("un seul téléchargement à la fois par compte, sans consommer le quota", async () => {
    const first = await GET(get());
    expect(first.status).toBe(200);
    for (let i = 0; i < 12; i += 1) expectRedirect(await GET(get()), "/compte?erreur=en-cours");
    // Le premier terminé, un nouveau téléchargement est possible (le quota de 10 n'a pas bougé).
    await first.text();
    await download();
  });

  it("place libérée si le téléchargement est abandonné ou échoue en cours de route", async () => {
    const abandoned = await GET(get());
    await abandoned.body!.cancel();
    const failing = await GET(get());
    expect(failing.status).toBe(200);
    mocks.dataError.value = { code: "XX000" };
    await expect(failing.text()).rejects.toThrow();
    mocks.dataError.value = null;
    await download();
  });

  it("plafond de téléchargements simultanés pour tout le serveur", async () => {
    const running: Response[] = [];
    for (let i = 0; i < MAX_CONCURRENT_EXPORTS; i += 1) {
      mocks.ip.value = `198.51.100.${i + 1}`;
      signedInAs(`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`);
      running.push(await GET(get()));
    }
    mocks.ip.value = "203.0.113.7";
    signedInAs(ALICE);
    expectRedirect(await GET(get()), "/compte?erreur=occupe");
    await running[0].text();
    await download();
  });

  it("au plus deux téléchargements simultanés par IP, même avec plusieurs comptes", async () => {
    const running: Response[] = [];
    for (let i = 0; i < MAX_EXPORTS_PER_IP; i += 1) {
      signedInAs(`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`);
      running.push(await GET(get()));
      expect(running[i].status).toBe(200);
    }
    signedInAs(ALICE);
    expectRedirect(await GET(get()), "/compte?erreur=occupe");
    // Depuis une autre adresse, le téléchargement reste possible.
    mocks.ip.value = "198.51.100.9";
    await download();
  });

  it("HEAD : refusé sans lire la session, réserver de place ni consommer le quota", async () => {
    for (let i = 0; i < 30; i += 1) {
      const response = HEAD();
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.body).toBeNull();
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(exportSlotCount()).toBe(0);
    // Quota par compte (10) et par IP (20) intacts.
    for (let i = 0; i < 10; i += 1) await download();
  });

  it("réponse jamais lue : place libérée après un court délai", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const unread = await GET(get());
    expect(unread.status).toBe(200);
    expectRedirect(await GET(get()), "/compte?erreur=en-cours");
    vi.advanceTimersByTime(EXPORT_FIRST_READ_TIMEOUT_MS);
    expect(exportSlotCount()).toBe(0);
    await expect(unread.text()).rejects.toThrow();
    vi.useRealTimers();
    await download();
  });

  it("réponse qui n'est plus lue : place libérée après le délai d'inactivité", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const stalled = await GET(get());
    const reader = stalled.body!.getReader();
    await reader.read(); // tête du fichier, puis plus rien
    vi.advanceTimersByTime(EXPORT_IDLE_TIMEOUT_MS - 1);
    expect(exportSlotCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(exportSlotCount()).toBe(0);
    await expect(reader.read()).rejects.toThrow();
  });

  it("sans session vérifiée : renvoie à la connexion sans rien lire", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Session not found", 403, "session_not_found"),
    });
    expectRedirect(await GET(get()), "/connexion");
    expect(mocks.queries).toHaveLength(0);
  });

  it("Supabase injoignable ou base en erreur : retour à /compte avec un message", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    expectRedirect(await GET(get()), "/compte?erreur=indisponible");
    signedInAs(ALICE);
    mocks.dbError.value = { code: "XX000" };
    expectRedirect(await GET(get()), "/compte?erreur=indisponible");
  });

  it("limite la fréquence par compte", async () => {
    for (let i = 0; i < 10; i += 1) {
      mocks.ip.value = `198.51.100.${i + 1}`;
      await download();
    }
    mocks.ip.value = "198.51.100.200";
    expectRedirect(await GET(get()), "/compte?erreur=trop");
  });

  it("limite la fréquence par IP, avant tout appel à Supabase", async () => {
    for (let i = 0; i < 20; i += 1) {
      signedInAs(`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`);
      await download();
    }
    mocks.getUser.mockClear();
    expectRedirect(await GET(get()), "/compte?erreur=trop");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("comptes non configurés : renvoie à /compte", async () => {
    mocks.configured.value = false;
    expectRedirect(await GET(get()), "/compte");
  });
});
