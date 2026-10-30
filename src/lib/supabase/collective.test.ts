// Accès à la carte collective (collective.ts) : appels des fonctions de la base, statuts attendus,
// classement des erreurs (jamais le message brut), contenus relus revalidés. Client simulé.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CollectiveDataError,
  classifyCollectiveError,
  blockAuthor,
  createItem,
  deleteItem,
  getCollectiveState,
  getModerationLog,
  getModerationQueue,
  listHiddenItems,
  listNotices,
  listOwnItems,
  loadCollectiveItems,
  moderateItem,
  reportItem,
  updateItem,
} from "./collective";

type Reply = { data: unknown; error: { code?: string; message?: string } | null };

const calls: { fn: string; args: unknown }[] = [];
let replies: Record<string, Reply> = {};

const db = {
  rpc: async (fn: string, args?: unknown) => {
    calls.push({ fn, args });
    return replies[fn] ?? { data: null, error: { code: "XX000" } };
  },
} as unknown as Parameters<typeof createItem>[0];

const reply = (fn: string, data: unknown, error: Reply["error"] = null) => {
  replies[fn] = { data, error };
};
const ping = { kind: "ping" as const, id: "p1", data: { ll: [2, 48] as [number, number], type: "crise" as const, title: "T", note: "" } };

beforeEach(() => {
  calls.length = 0;
  replies = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("classifyCollectiveError", () => {
  it("classe les erreurs levées par la base et les refus d'accès", () => {
    expect(classifyCollectiveError({ code: "P0001", message: "collective_no_profile" })).toBe("no-profile");
    expect(classifyCollectiveError({ code: "P0001", message: "collective_rate_limited" })).toBe("rate-limited");
    expect(classifyCollectiveError({ code: "P0001", message: "collective_invalid" })).toBe("invalid");
    expect(classifyCollectiveError({ code: "P0001", message: "autre" })).toBe("unavailable");
    expect(classifyCollectiveError({ code: "42501", message: "collective_forbidden" })).toBe("forbidden");
    expect(classifyCollectiveError({ code: "42501", message: "collective_not_authenticated" })).toBe("unauthorized");
    expect(classifyCollectiveError({ code: "PGRST301" })).toBe("unauthorized");
    expect(classifyCollectiveError({ code: "23514" })).toBe("invalid");
    expect(classifyCollectiveError({ code: "08006" })).toBe("unavailable");
  });
});

describe("carte", () => {
  it("état du compte", async () => {
    reply("collective_map_state", [{ revision: "12", is_moderator: true, has_profile: false, unread_notices: 2, my_items: 3, suspended_until: null }]);
    expect(await getCollectiveState(db)).toEqual({
      revision: 12,
      isModerator: true,
      hasProfile: false,
      unreadNotices: 2,
      myItems: 3,
      suspendedUntil: null,
    });
    reply("collective_map_state", [
      { revision: 1, is_moderator: false, has_profile: true, unread_notices: 0, my_items: 0, suspended_until: "2026-11-26 10:00:00+00" },
    ]);
    expect((await getCollectiveState(db)).suspendedUntil).toBe("2026-11-26T10:00:00.000Z");
  });

  it("éléments relus revalidés : un contenu qui ne passe plus la validation est omis", async () => {
    reply("collective_map", [
      {
        id: "p1",
        kind: "ping",
        data: ping.data,
        author_name: "Alice",
        author_handle: "alice",
        mine: false,
        created_at: "2026-10-27 10:00:00+00",
        updated_at: "2026-10-27 10:00:00+00",
      },
      { id: "p2", kind: "ping", data: { ...ping.data, type: "inconnu" }, author_name: null, mine: true, created_at: "x", updated_at: "x" },
      { id: "p3", kind: "virus", data: {}, author_name: null, mine: true, created_at: "x", updated_at: "x" },
    ]);
    expect(await loadCollectiveItems(db)).toEqual([
      {
        ...ping,
        authorName: "Alice",
        authorHandle: "alice",
        mine: false,
        createdAt: "2026-10-27T10:00:00.000Z",
        updatedAt: "2026-10-27T10:00:00.000Z",
      },
    ]);
  });

  it("écritures : contenu envoyé en JSON canonique, statuts prévus seulement", async () => {
    reply("create_collective_item", [
      { status: "created", author_name: "Alice", created_at: "2026-10-27T10:00:00Z", revision_from: "41", revision_to: "42" },
    ]);
    expect(await createItem(db, ping)).toEqual({
      status: "created",
      authorName: "Alice",
      createdAt: "2026-10-27T10:00:00.000Z",
      step: { from: 41, to: 42 },
    });
    expect(calls[0]).toEqual({
      fn: "create_collective_item",
      args: { p_id: "p1", p_kind: "ping", p_data: '{"ll":[2,48],"type":"crise","title":"T","note":""}' },
    });
    reply("update_collective_item", [{ status: "not-found", revision_from: 7, revision_to: 7 }]);
    expect(await updateItem(db, ping)).toEqual({ status: "not-found", step: { from: 7, to: 7 } });
    reply("update_collective_item", [{ status: "suspended", revision_from: null, revision_to: null }]);
    expect(await updateItem(db, ping)).toEqual({ status: "suspended", step: null });
    reply("delete_collective_item", [{ status: "deleted", revision_from: 7, revision_to: 9 }]);
    expect(await deleteItem(db, "p1")).toEqual({ status: "deleted", step: { from: 7, to: 9 } });
    // Versions incohérentes : ignorées (la session relira la carte).
    reply("delete_collective_item", [{ status: "deleted", revision_from: 9, revision_to: 7 }]);
    expect(await deleteItem(db, "p1")).toEqual({ status: "deleted", step: null });
    reply("block_collective_author", "blocked");
    expect(await blockAuthor(db, "p1")).toBe("blocked");
    expect(calls.at(-1)).toEqual({ fn: "block_collective_author", args: { p_id: "p1" } });
    reply("block_collective_author", "piraté");
    await expect(blockAuthor(db, "p1")).rejects.toBeInstanceOf(CollectiveDataError);
    reply("report_collective_item", "already-reported");
    expect(await reportItem(db, "p1", "spam", "", false)).toBe("already-reported");
    expect(calls.at(-1)).toEqual({ fn: "report_collective_item", args: { p_id: "p1", p_reason: "spam", p_details: "", p_good_faith: false } });
    reply("update_collective_item", [{ status: "piraté", revision_from: 1, revision_to: 1 }]);
    await expect(updateItem(db, ping)).rejects.toBeInstanceOf(CollectiveDataError);
  });

  it("erreurs : classées, jamais le message brut", async () => {
    reply("create_collective_item", null, { code: "P0001", message: "collective_no_profile" });
    await expect(createItem(db, ping)).rejects.toMatchObject({ kind: "no-profile" });
    reply("moderate_collective_item", null, { code: "42501", message: "collective_forbidden" });
    await expect(moderateItem(db, "p1", "hide", "Motif", false)).rejects.toMatchObject({ kind: "forbidden" });
  });
});

describe("modération et droit d'accès", () => {
  it("décision avec suspension : demandée à la base telle quelle", async () => {
    reply("moderate_collective_item", "hidden");
    expect(await moderateItem(db, "p1", "hide", "Motif", true)).toBe("hidden");
    expect(calls.at(-1)).toEqual({
      fn: "moderate_collective_item",
      args: { p_id: "p1", p_action: "hide", p_reason: "Motif", p_suspend: true },
    });
  });

  it("journal : retraits par l'auteur et suspensions lus ; actions inconnues écartées", async () => {
    const row = {
      id: "d1", item_id: "p1", item_kind: "ping", item_title: "T", reason: "Retiré par son auteur.", reports: 1,
      moderator_name: null, author_handle: "alice", author_name: "Alice", created_at: "2026-10-27T10:00:00Z",
    };
    reply("collective_moderation_log", [
      { ...row, action: "withdraw", suspended_until: null },
      { ...row, id: "d2", action: "hide", suspended_until: "2026-11-26T10:00:00Z" },
      { ...row, id: "d3", action: "purge", suspended_until: null },
    ]);
    const log = await getModerationLog(db);
    expect(log.map((d) => [d.action, d.suspendedUntil])).toEqual([
      ["withdraw", null],
      ["hide", "2026-11-26T10:00:00.000Z"],
    ]);
  });

  it("file de modération : lignes inattendues écartées, motifs filtrés", async () => {
    reply("collective_moderation_queue", [
      {
        id: "p1", kind: "ping", data: ping.data, status: "visible", author_handle: "alice", author_name: "Alice",
        created_at: "2026-10-27T10:00:00Z", updated_at: "2026-10-27T10:00:00Z", open_reports: 2,
        reasons: ["spam", "inconnu"], details: ["Détail"], last_report_at: "2026-10-27T11:00:00Z",
        reported_data: [{ ...ping.data, title: "Avant" }], total: 230,
      },
      { id: "p2", kind: "ping", data: {}, status: "supprimé", reasons: [], details: [] },
      // Retiré par son auteur : sans dates, contenu signalé non copié.
      {
        id: "p3", kind: "ping", data: null, status: "withdrawn", author_handle: "alice", author_name: "Alice",
        created_at: null, updated_at: null, open_reports: 1, reasons: ["hate"], details: [], last_report_at: "2026-10-27T11:00:00Z",
        reported_data: [],
      },
    ]);
    const { items: queue, total } = await getModerationQueue(db, 2);
    expect(calls.at(-1)).toEqual({ fn: "collective_moderation_queue", args: { p_page: 2 } });
    expect(total).toBe(230);
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({ id: "p1", reasons: ["spam"], details: ["Détail"], openReports: 2, authorHandle: "alice" });
    expect(queue[0].reportedData).toEqual([{ ...ping.data, title: "Avant" }]);
    expect(queue[1]).toMatchObject({ id: "p3", status: "withdrawn", data: null, createdAt: null, updatedAt: null, openReports: 1 });
  });

  it("avis et éléments du compte : base d'avant la carte collective traitée comme vide pour l'export", async () => {
    reply("my_collective_notices", null, { code: "PGRST202" });
    expect(await listNotices(db, { missingAsEmpty: true })).toEqual([]);
    await expect(listNotices(db)).rejects.toBeInstanceOf(CollectiveDataError);
    reply("my_collective_items", null, { code: "PGRST202" });
    expect(await listOwnItems(db, { missingAsEmpty: true })).toEqual([]);
  });

  it("éléments masqués du compte : sorte inconnue écartée, titre borné, erreurs classées", async () => {
    reply("my_hidden_collective_items", [
      { id: "p1", kind: "ping", title: "Port", updated_at: "2026-10-01T10:00:00+00:00" },
      { id: "x1", kind: "inconnue", title: "", updated_at: "2026-10-01T10:00:00+00:00" },
      { id: "f1", kind: "flux", title: "a".repeat(300), updated_at: "2026-10-02T10:00:00+00:00" },
    ]);
    const items = await listHiddenItems(db);
    expect(calls.at(-1)).toEqual({ fn: "my_hidden_collective_items", args: undefined });
    expect(items.map((i) => i.id)).toEqual(["p1", "f1"]);
    expect(items[0]).toEqual({ id: "p1", kind: "ping", title: "Port", updatedAt: "2026-10-01T10:00:00.000Z" });
    expect(items[1].title).toHaveLength(200);
    reply("my_hidden_collective_items", null, { code: "P0001", message: "collective_rate_limited" });
    await expect(listHiddenItems(db)).rejects.toMatchObject({ kind: "rate-limited" });
  });
});
