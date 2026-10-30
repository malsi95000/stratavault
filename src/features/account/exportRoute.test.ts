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

type Row = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  revision: number;
  cover: unknown;
  data: unknown;
};

const row = (id: string, userId: string, name: string): Row => ({
  id,
  user_id: userId,
  name,
  created_at: "2026-10-01T10:00:00+00:00",
  updated_at: "2026-10-02T10:00:00+00:00",
  revision: 3,
  cover: null,
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
  /** Profils (table profiles simulée, SANS RLS : la route filtre sur user_id) et fichiers d'avatar. */
  profiles: [] as Record<string, unknown>[],
  profileFilters: [] as [string, unknown][][],
  avatars: new Map<string, Uint8Array>(),
  /** Compteurs anti-abus du compte (réponse de my_rate_limits) ; erreur de Storage simulée. */
  counters: [] as { action: string; window_start: string; hits: number }[],
  /** Fichiers du compte dans le compartiment (my_avatar_files) et autorisations (my_avatar_read_grants). */
  ownFiles: [] as string[],
  grants: [] as { avatar_id: string; expires_at: string }[],
  /** Jeton d'envoi d'avatar (my_avatar_upload_ticket). */
  tickets: [] as { avatar_id: string; expires_at: string }[],
  /** Contacts, demandes et blocages (my_contacts, my_contact_requests, my_blocked_members). */
  contacts: [] as unknown[],
  contactRequests: [] as unknown[],
  blocks: [] as unknown[],
  /** Partages de cartes (maps_shared_with_me, my_map_invitations, my_map_shares, my_map_locks, my_map_link_uses). */
  sharedMaps: [] as unknown[],
  mapInvitations: [] as unknown[],
  mapShares: [] as unknown[],
  mapLocks: [] as unknown[],
  mapLinkUses: [] as unknown[],
  /** Carte collective (my_collective_items, my_collective_reports, my_collective_notices, my_collective_decisions, my_moderation_decisions). */
  collectiveItems: [] as unknown[],
  collectiveReports: [] as unknown[],
  collectiveNotices: [] as unknown[],
  collectiveDecisions: [] as unknown[],
  moderationDecisions: [] as unknown[],
  /** Situation du compte et identifiants utilisés (my_collective_account, my_collective_item_ids). */
  collectiveAccount: [] as unknown[],
  collectiveItemIds: [] as unknown[],
  /** Échec simulé d'une fonction de la base (code PostgreSQL ou PostgREST). */
  rpcError: { value: null as string | null, code: "57014" },
  storageDown: { value: false },
}));

/** Table profiles simulée : une ligne choisie par les filtres (maybeSingle). */
function profilesTable() {
  const filters: [string, unknown][] = [];
  mocks.profileFilters.push(filters);
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => (filters.push([column, value]), builder),
    maybeSingle: async () => ({
      data: mocks.profiles.find((r) => filters.every(([column, value]) => r[column] === value)) ?? null,
      error: null,
    }),
  };
  return builder;
}

/** Compartiment « avatars » simulé. */
const storage = {
  from: (bucket: string) => {
    expect(bucket).toBe("avatars");
    return {
      download: async (path: string) => {
        if (mocks.storageDown.value) return { data: null, error: { status: 503, statusCode: "503", message: "down" } };
        const bytes = mocks.avatars.get(path);
        return bytes
          ? { data: new Blob([bytes as BlobPart]), error: null }
          : { data: null, error: { status: 400, statusCode: "404", message: "Object not found" } };
      },
    };
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (!mocks.configured.value) return null;
    return {
      auth: { getUser: mocks.getUser },
      storage,
      rpc: async (fn: string) => {
        if (fn === mocks.rpcError.value) return { data: null, error: { code: mocks.rpcError.code, message: "erreur" } };
        const results: Record<string, unknown> = {
          my_rate_limits: mocks.counters,
          my_avatar_files: mocks.ownFiles,
          my_avatar_read_grants: mocks.grants,
          my_avatar_upload_ticket: mocks.tickets,
          my_contacts: mocks.contacts,
          my_contact_requests: mocks.contactRequests,
          my_blocked_members: mocks.blocks,
          maps_shared_with_me: mocks.sharedMaps,
          my_map_invitations: mocks.mapInvitations,
          my_map_shares: mocks.mapShares,
          my_map_locks: mocks.mapLocks,
          my_map_link_uses: mocks.mapLinkUses,
          my_collective_items: mocks.collectiveItems,
          my_collective_reports: mocks.collectiveReports,
          my_collective_notices: mocks.collectiveNotices,
          my_collective_decisions: mocks.collectiveDecisions,
          my_moderation_decisions: mocks.moderationDecisions,
          my_collective_account: mocks.collectiveAccount,
          my_collective_item_ids: mocks.collectiveItemIds,
        };
        expect(Object.keys(results)).toContain(fn);
        return { data: results[fn], error: null };
      },
      from: (table: string) => {
        if (table === "profiles") return profilesTable();
        expect(table).toBe("maps");
        const query = { columns: "", filters: [] as [string, unknown][] };
        mocks.queries.push(query);
        const builder = {
          select: (columns: string) => ((query.columns = columns), builder),
          eq: (column: string, value: unknown) => (query.filters.push([column, value]), builder),
          order: () => builder,
          limit: () => builder,
          /** Contenu et logo d'une carte : `data::text, cover::text`, comme PostgREST (texte JSON de la base). */
          maybeSingle: async () => {
            expect(query.columns).toBe("data::text, cover::text");
            if (mocks.dataError.value) return { data: null, error: mocks.dataError.value };
            const [found] = matching();
            const text = (value: unknown) => (value === null ? null : JSON.stringify(value));
            return { data: found ? { data: text(found.data), cover: text(found.cover) } : null, error: null };
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
  mocks.profiles = [];
  mocks.profileFilters.length = 0;
  mocks.avatars.clear();
  mocks.counters = [];
  mocks.ownFiles = [];
  mocks.grants = [];
  mocks.tickets = [];
  mocks.contacts = [];
  mocks.contactRequests = [];
  mocks.blocks = [];
  mocks.sharedMaps = [];
  mocks.mapInvitations = [];
  mocks.mapShares = [];
  mocks.mapLocks = [];
  mocks.mapLinkUses = [];
  mocks.collectiveItems = [];
  mocks.collectiveReports = [];
  mocks.collectiveNotices = [];
  mocks.collectiveDecisions = [];
  mocks.moderationDecisions = [];
  mocks.collectiveAccount = [];
  mocks.collectiveItemIds = [];
  mocks.rpcError.value = null;
  mocks.rpcError.code = "57014";
  mocks.storageDown.value = false;
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
  it("télécharge le compte et toutes ses cartes (logo compris), sans cache", async () => {
    (mocks.rows[0] as Row).cover = { kind: "icon", icon: "anchor", color: "vert" };
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
        cover: { kind: "icon", icon: "anchor", color: "vert" },
        data: { notes: { FRA: "Sahel" } },
      },
    ]);
  });

  it("inclut le profil du compte vérifié et l'image de son avatar ; null sans profil", async () => {
    expect((await (await GET(get())).json()).profile).toBeNull();
    const avatarId = "99999999-9999-4999-8999-999999999999";
    const webp = new Uint8Array([...Buffer.from("RIFF"), 4, 0, 0, 0, ...Buffer.from("WEBPVP8 "), 1, 2]);
    mocks.avatars.set(avatarId, webp);
    const profileRow = (userId: string, handle: string) => ({
      user_id: userId,
      handle,
      display_name: handle,
      bio: "Bio",
      visibility: "members",
      avatar_id: userId === ALICE ? avatarId : null,
      handle_changed_at: "2026-10-10T11:00:00+00:00",
      created_at: "2026-10-10T10:00:00+00:00",
      updated_at: "2026-10-11T10:00:00+00:00",
    });
    mocks.profiles = [profileRow(BOB, "bob"), profileRow(ALICE, "alice")];
    resetAuthRateLimits();
    resetExportSlots();
    const body = await (await GET(get())).json();
    expect(body.version).toBe(2);
    expect(body.profile).toEqual({
      handle: "alice",
      displayName: "alice",
      bio: "Bio",
      visibility: "members",
      handleChangedAt: "2026-10-10T11:00:00+00:00",
      createdAt: "2026-10-10T10:00:00+00:00",
      updatedAt: "2026-10-11T10:00:00+00:00",
      avatar: { contentType: "image/webp", base64: Buffer.from(webp).toString("base64") },
    });
    // Lu sur la ligne du compte vérifié seulement.
    expect(mocks.profileFilters.at(-1)).toEqual([["user_id", ALICE]]);

    // Storage injoignable : l'export échoue (jamais d'avatar omis sans le dire) ; fichier absent : null.
    mocks.storageDown.value = true;
    resetAuthRateLimits();
    resetExportSlots();
    const failed = await GET(get());
    expect(failed.status).toBe(303);
    expect(failed.headers.get("Location")).toContain("erreur=indisponible");
    mocks.storageDown.value = false;
    mocks.avatars.clear();
    resetAuthRateLimits();
    resetExportSlots();
    expect((await (await GET(get())).json()).profile.avatar).toBeNull();
  });

  it("inclut les compteurs anti-abus du compte tenus par la base", async () => {
    mocks.counters = [{ action: "profile_lookup", window_start: "2026-10-12T08:00:00+00:00", hits: 4 }];
    const body = await (await GET(get())).json();
    expect(body.securityCounters).toEqual([{ action: "profile_lookup", windowStart: "2026-10-12T08:00:00+00:00", hits: 4 }]);
    expect(Object.keys(body)).toEqual([
      "format",
      "version",
      "note",
      "exportedAt",
      "account",
      "profile",
      "otherAvatarFiles",
      "avatarReadGrants",
      "avatarUploadTicket",
      "contacts",
      "contactRequests",
      "blockedMembers",
      "sharedWithMe",
      "mapInvitations",
      "mapShares",
      "mapLocks",
      "mapLinkUses",
      "collectiveItems",
      "collectiveReports",
      "collectiveNotices",
      "collectiveDecisions",
      "collectiveAccount",
      "collectiveItemIds",
      "moderationDecisions",
      "securityCounters",
      "maps",
    ]);
  });

  it("inclut les autres fichiers d'avatar du compte et ses autorisations d'affichage d'avatars", async () => {
    const current = "99999999-9999-4999-8999-999999999999";
    const leftover = "88888888-8888-4888-8888-888888888888";
    const gone = "77777777-7777-4777-8777-777777777777";
    mocks.profiles = [
      {
        user_id: ALICE,
        handle: "alice",
        display_name: "Alice",
        bio: "",
        visibility: "members",
        avatar_id: current,
        handle_changed_at: "2026-10-10T11:00:00+00:00",
        created_at: "2026-10-10T10:00:00+00:00",
        updated_at: "2026-10-11T10:00:00+00:00",
      },
    ];
    mocks.avatars.set(current, new Uint8Array([1, 2, 3]));
    mocks.avatars.set(leftover, new Uint8Array([4, 5]));
    // Fichier listé mais effacé avant sa lecture : omis.
    mocks.ownFiles = [current, gone, leftover];
    mocks.grants = [{ avatar_id: "66666666-6666-4666-8666-666666666666", expires_at: "2026-10-12T08:01:00+00:00" }];
    mocks.tickets = [{ avatar_id: "55555555-5555-4555-8555-555555555555", expires_at: "2026-10-12T08:05:00+00:00" }];
    const body = await (await GET(get())).json();
    expect(body.profile.avatar.base64).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(body.otherAvatarFiles).toEqual([{ contentType: "image/webp", base64: Buffer.from([4, 5]).toString("base64") }]);
    expect(body.avatarReadGrants).toEqual([
      { avatarId: "66666666-6666-4666-8666-666666666666", expiresAt: "2026-10-12T08:01:00+00:00" },
    ]);
    expect(body.avatarUploadTicket).toEqual({
      avatarId: "55555555-5555-4555-8555-555555555555",
      expiresAt: "2026-10-12T08:05:00+00:00",
    });

    // Liste des fichiers, des autorisations ou du jeton illisible : l'export échoue, rien n'est omis
    // sans le dire.
    for (const fn of ["my_avatar_files", "my_avatar_read_grants", "my_avatar_upload_ticket"]) {
      mocks.rpcError.value = fn;
      resetAuthRateLimits();
      resetExportSlots();
      const failed = await GET(get());
      expect(failed.headers.get("Location"), fn).toContain("erreur=indisponible");
    }
  });

  it("inclut les contacts, les demandes en cours et les blocages, sans identifiant de compte", async () => {
    mocks.contacts = [{ id: "c1", handle: "bob", display_name: "Bob", avatar_id: null, created_at: "2026-10-12T08:00:00+00:00" }];
    mocks.contactRequests = [
      { id: "r1", direction: "incoming", handle: "carol", display_name: "Carol", avatar_id: null, created_at: "2026-10-13T08:00:00+00:00" },
      { id: "r2", direction: "outgoing", handle: "dave", display_name: null, avatar_id: null, created_at: "2026-10-14T08:00:00+00:00" },
    ];
    mocks.blocks = [
      { id: "b1", handle: "eve", created_at: "2026-10-16T08:00:00+00:00" },
      { id: "b2", handle: null, created_at: "2026-10-15T08:00:00+00:00" },
    ];
    const body = await (await GET(get())).json();
    expect(body.contacts).toEqual([{ handle: "bob", displayName: "Bob", since: "2026-10-12T08:00:00+00:00" }]);
    expect(body.contactRequests).toEqual([
      { direction: "incoming", handle: "carol", displayName: "Carol", createdAt: "2026-10-13T08:00:00+00:00" },
      { direction: "outgoing", handle: "dave", displayName: null, createdAt: "2026-10-14T08:00:00+00:00" },
    ]);
    expect(body.blockedMembers).toEqual([
      { handle: "eve", blockedAt: "2026-10-16T08:00:00+00:00" },
      { handle: null, blockedAt: "2026-10-15T08:00:00+00:00" },
    ]);

    // Liste illisible : l'export échoue ; base d'avant les contacts (fonction absente) : listes vides.
    for (const fn of ["my_contacts", "my_contact_requests", "my_blocked_members"]) {
      mocks.rpcError.value = fn;
      mocks.rpcError.code = "57014";
      resetAuthRateLimits();
      resetExportSlots();
      expect((await GET(get())).headers.get("Location"), fn).toContain("erreur=indisponible");
      mocks.rpcError.code = "PGRST202";
      resetAuthRateLimits();
      resetExportSlots();
      const response = await GET(get());
      expect(response.status, fn).toBe(200);
      await response.text();
    }
  });

  it("inclut les partages de cartes, sans identifiant de compte ni jeton de lien", async () => {
    const map = "12345678-1234-4234-8234-123456789abc";
    mocks.sharedMaps = [
      { id: map, name: "Sahel", role: "reader", updated_at: "2026-10-20T08:00:00+00:00", stats: null, owner_handle: "bob", owner_display_name: "Bob", joined_at: "2026-10-19T08:00:00+00:00" },
    ];
    mocks.mapInvitations = [
      { id: "i1", map_name: "Arctique", role: "editor", owner_handle: "carol", owner_display_name: "Carol", created_at: "2026-10-18T08:00:00+00:00", expires_at: "2026-11-17T08:00:00+00:00" },
    ];
    mocks.mapShares = [
      { map_id: map, kind: "link", id: "l1", handle: null, display_name: null, role: "reader", uses: 1, max_uses: 5, created_at: "t1", expires_at: "t2" },
    ];
    mocks.mapLocks = [{ map_id: map, acquired_at: "t3", expires_at: "t4" }];
    mocks.mapLinkUses = [{ map_id: map, used_at: "t5" }];
    const body = await (await GET(get())).json();
    expect(body.sharedWithMe).toEqual([
      { mapId: map, name: "Sahel", role: "reader", ownerHandle: "bob", ownerName: "Bob", joinedAt: "2026-10-19T08:00:00+00:00" },
    ]);
    expect(body.mapInvitations).toEqual([
      { mapName: "Arctique", role: "editor", ownerHandle: "carol", ownerName: "Carol", createdAt: "2026-10-18T08:00:00+00:00", expiresAt: "2026-11-17T08:00:00+00:00" },
    ]);
    expect(body.mapShares).toEqual([
      { mapId: map, kind: "link", handle: null, displayName: null, role: "reader", uses: 1, maxUses: 5, createdAt: "t1", expiresAt: "t2" },
    ]);
    expect(body.mapLocks).toEqual([{ mapId: map, acquiredAt: "t3", expiresAt: "t4" }]);
    expect(body.mapLinkUses).toEqual([{ mapId: map, usedAt: "t5" }]);

    // Liste illisible : l'export échoue ; base d'avant le partage (fonction absente) : listes vides.
    for (const fn of ["maps_shared_with_me", "my_map_invitations", "my_map_shares", "my_map_locks", "my_map_link_uses"]) {
      mocks.rpcError.value = fn;
      mocks.rpcError.code = "57014";
      resetAuthRateLimits();
      resetExportSlots();
      expect((await GET(get())).headers.get("Location"), fn).toContain("erreur=indisponible");
      mocks.rpcError.code = "PGRST202";
      resetAuthRateLimits();
      resetExportSlots();
      const response = await GET(get());
      expect(response.status, fn).toBe(200);
      await response.text();
    }
  });

  it("inclut la carte collective du compte : éléments, signalements, avis, situation, identifiants, décisions", async () => {
    const data = { ll: [2, 48], type: "crise", title: "T", note: "" };
    mocks.collectiveItems = [{ id: "p1", kind: "ping", data, status: "hidden", created_at: "t1", updated_at: "t2" }];
    mocks.collectiveReports = [{ item_id: "x1", reason: "spam", details: "", status: "open", created_at: "t3", resolved_at: null }];
    mocks.collectiveNotices = [
      { id: "n1", role: "author", action: "hide", item_id: "p1", item_kind: "ping", item_title: "T", reason: "Motif", reports: 2, suspended_until: "2026-11-26T10:00:00Z", item_hidden: true, created_at: "2026-10-27T10:00:00Z", read_at: null },
    ];
    mocks.moderationDecisions = [
      { id: "d1", action: "delete", item_id: "y1", item_kind: "point", item_title: "", reason: "Illicite", reports: 2, suspended_until: null, created_at: "t4" },
    ];
    mocks.collectiveDecisions = [
      { id: "d2", action: "withdraw", item_id: "p3", item_kind: "ping", item_title: "Masqué", reason: "Retiré par son auteur.", reports: 0, suspended_until: null, created_at: "t5" },
    ];
    mocks.collectiveAccount = [{ moderator_since: null, suspended_until: "2026-11-26T10:00:00Z", suspended_at: "2026-10-27T10:00:00Z" }];
    mocks.collectiveItemIds = [
      { item_id: "p1", moderated: true },
      { item_id: "p2", moderated: false },
    ];
    let body = await (await GET(get())).json();
    expect(body.collectiveAccount).toEqual({
      moderatorSince: null,
      suspension: { until: "2026-11-26T10:00:00.000Z", createdAt: "2026-10-27T10:00:00.000Z" },
    });
    expect(body.collectiveItemIds).toEqual([
      { itemId: "p1", moderated: true },
      { itemId: "p2", moderated: false },
    ]);
    expect(body.collectiveItems).toEqual([{ id: "p1", kind: "ping", data, status: "hidden", createdAt: "t1", updatedAt: "t2" }]);
    expect(body.collectiveReports).toEqual([{ itemId: "x1", reason: "spam", details: "", status: "open", createdAt: "t3", resolvedAt: null }]);
    expect(body.collectiveNotices).toEqual([
      { role: "author", action: "hide", itemId: "p1", itemKind: "ping", itemTitle: "T", reason: "Motif", reports: 2, suspendedUntil: "2026-11-26T10:00:00.000Z", createdAt: "2026-10-27T10:00:00.000Z", readAt: null },
    ]);
    expect(body.moderationDecisions).toEqual([
      { action: "delete", itemId: "y1", itemKind: "point", itemTitle: "", reason: "Illicite", reports: 2, suspendedUntil: null, createdAt: "t4" },
    ]);
    expect(body.collectiveDecisions).toEqual([
      { action: "withdraw", itemId: "p3", itemKind: "ping", itemTitle: "Masqué", reason: "Retiré par son auteur.", reports: 0, suspendedUntil: null, createdAt: "t5" },
    ]);

    // Modérateur sans suspension.
    mocks.collectiveAccount = [{ moderator_since: "2026-10-20T10:00:00Z", suspended_until: null, suspended_at: null }];
    resetAuthRateLimits();
    resetExportSlots();
    body = await (await GET(get())).json();
    expect(body.collectiveAccount).toEqual({ moderatorSince: "2026-10-20T10:00:00.000Z", suspension: null });

    // Liste illisible : l'export échoue ; base d'avant la carte collective (fonction absente) : listes vides.
    for (const fn of [
      "my_collective_items",
      "my_collective_reports",
      "my_collective_notices",
      "my_collective_decisions",
      "my_moderation_decisions",
      "my_collective_account",
      "my_collective_item_ids",
    ]) {
      mocks.rpcError.value = fn;
      mocks.rpcError.code = "57014";
      resetAuthRateLimits();
      resetExportSlots();
      expect((await GET(get())).headers.get("Location"), fn).toContain("erreur=indisponible");
      mocks.rpcError.code = "PGRST202";
      resetAuthRateLimits();
      resetExportSlots();
      const response = await GET(get());
      expect(response.status, fn).toBe(200);
      await response.text();
    }
  });

  it("ne lit que les cartes de l'utilisateur vérifié (filtre user_id, en plus de la RLS)", async () => {
    await download();
    // Liste sans contenu, puis le contenu de chaque carte, toujours filtré sur user_id.
    expect(mocks.queries).toHaveLength(2);
    expect(mocks.queries[0].filters).toEqual([["user_id", ALICE]]);
    expect(mocks.queries[0].columns).not.toContain("data");
    // Ni les logos : lus carte par carte avec le contenu (mémoire du serveur bornée).
    expect(mocks.queries[0].columns).not.toContain("cover");
    expect(mocks.queries[1]).toEqual({
      columns: "data::text, cover::text",
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
