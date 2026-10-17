import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteAccountSchema } from "./schemas";
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_NOTE,
  EXPORT_FIRST_READ_TIMEOUT_MS,
  EXPORT_IDLE_TIMEOUT_MS,
  ExportStalledError,
  accountExportFileName,
  createAccountExportStream,
  exportHead,
  exportMapEntry,
} from "./exportData";
import {
  EXPORT_SLOT_TTL_MS,
  MAX_EXPORTS_PER_IP,
  acquireExportSlot,
  exportSlotCount,
  resetExportSlots,
} from "./exportSlots";
import { formatAccountDate } from "./format";
import { PROCESSINGS } from "@/features/legal/processing";
import {
  ACCOUNT_DELETED,
  DEMO_DATA_CLEARED,
  EXPORT_IN_PROGRESS,
  EXPORT_RATE_LIMITED,
  EXPORT_SERVER_BUSY,
  EXPORT_UNAVAILABLE,
  passwordChangeRequested,
} from "./messages";
import {
  ACCOUNT_DELETED_PATH,
  DEMO_CLEARED_PATH,
  EXPORT_IN_PROGRESS_PATH,
  EXPORT_RATE_LIMITED_PATH,
  EXPORT_SERVER_BUSY_PATH,
  EXPORT_UNAVAILABLE_PATH,
  exportError,
  homeNotice,
  spaceNotice,
} from "./notices";

const query = (path: string) => Object.fromEntries(new URL(path, "http://x.invalid").searchParams);

describe("messages passés par l'adresse", () => {
  it("chaque chemin produit son message", () => {
    expect(homeNotice(query(ACCOUNT_DELETED_PATH))).toBe(ACCOUNT_DELETED);
    expect(spaceNotice(query(DEMO_CLEARED_PATH))).toBe(DEMO_DATA_CLEARED);
    expect(exportError(query(EXPORT_RATE_LIMITED_PATH))).toBe(EXPORT_RATE_LIMITED);
    expect(exportError(query(EXPORT_UNAVAILABLE_PATH))).toBe(EXPORT_UNAVAILABLE);
    expect(exportError(query(EXPORT_IN_PROGRESS_PATH))).toBe(EXPORT_IN_PROGRESS);
    expect(exportError(query(EXPORT_SERVER_BUSY_PATH))).toBe(EXPORT_SERVER_BUSY);
  });

  it("ignore toute autre valeur (liste fermée)", () => {
    expect(homeNotice({})).toBeUndefined();
    expect(homeNotice({ compte: ["supprime", "supprime"] })).toBeUndefined();
    expect(spaceNotice({ donnees: "autre" })).toBeUndefined();
    for (const erreur of ["__proto__", "constructor", "<script>"]) expect(exportError({ erreur })).toBeUndefined();
  });
});

describe("fichier « Télécharger mes données »", () => {
  const now = new Date("2026-10-09T21:30:00Z");
  const account = {
    id: "u1",
    email: "a@exemple.fr",
    createdAt: "2026-09-01T08:00:00Z",
    emailConfirmedAt: null,
    lastSignInAt: "2026-10-08T20:00:00Z",
  };

  const map = (id: string, name: string) => ({ id, name, created_at: "c", updated_at: "u", revision: 2 });

  it("contient la fiche du compte et chaque carte avec son contenu, en JSON compact", () => {
    const cover = '{"kind": "icon", "icon": "anchor", "color": "vert"}';
    const entries = [
      exportMapEntry(map("m1", "Sahel"), { dataText: '{"notes": {}}', coverText: cover }),
      exportMapEntry(map("m2", "Arctique"), { dataText: "{}", coverText: null }),
    ];
    const text = `${exportHead(account, now)}${entries.join(",")}]}`;
    expect(text).not.toMatch(/\n/);
    const data = JSON.parse(text);
    expect(data).toMatchObject({ format: ACCOUNT_EXPORT_FORMAT, version: 1, exportedAt: "2026-10-09T21:30:00.000Z" });
    expect(data.account).toEqual(account);
    // Logo ou aperçu compris (droits d'accès et à la portabilité) : null quand la carte n'en a pas.
    expect(data.maps).toEqual([
      {
        id: "m1",
        name: "Sahel",
        createdAt: "c",
        updatedAt: "u",
        revision: 2,
        cover: { kind: "icon", icon: "anchor", color: "vert" },
        data: { notes: {} },
      },
      { id: "m2", name: "Arctique", createdAt: "c", updatedAt: "u", revision: 2, cover: null, data: {} },
    ]);
    expect(ACCOUNT_EXPORT_NOTE).toContain("« cover »");
  });

  it("flux : une carte lue à la fois, fin signalée une seule fois", async () => {
    const reads: string[] = [];
    let ends = 0;
    const stream = createAccountExportStream({
      account,
      maps: [map("m1", "Sahel"), map("m2", "Supprimée"), map("m3", "Arctique")],
      now,
      readData: async (id) => (reads.push(id), id === "m2" ? null : { dataText: `{"id": "${id}"}`, coverText: null }),
      onEnd: () => (ends += 1),
    });
    expect(reads).toEqual([]);
    const data = JSON.parse(await new Response(stream).text());
    expect(reads).toEqual(["m1", "m2", "m3"]);
    expect(data.maps.map((m: { name: string }) => m.name)).toEqual(["Sahel", "Arctique"]);
    expect(data.maps[1].data).toEqual({ id: "m3" });
    expect(ends).toBe(1);
  });

  it("flux : une lecture en échec interrompt le fichier et libère la place", async () => {
    let ends = 0;
    const stream = createAccountExportStream({
      account,
      maps: [map("m1", "Sahel")],
      now,
      readData: async () => {
        throw new Error("base");
      },
      onEnd: () => (ends += 1),
    });
    await expect(new Response(stream).text()).rejects.toThrow("base");
    expect(ends).toBe(1);
  });

  it("flux jamais lu (requête HEAD, connexion perdue) : interrompu et place libérée après le premier délai", async () => {
    let ends = 0;
    const stream = createAccountExportStream({
      account,
      maps: [map("m1", "Sahel")],
      now,
      readData: async () => ({ dataText: "{}", coverText: null }),
      onEnd: () => (ends += 1),
      timeouts: { firstReadMs: 20, idleMs: 1_000 },
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(ends).toBe(1);
    await expect(new Response(stream).text()).rejects.toBeInstanceOf(ExportStalledError);
    expect(ends).toBe(1);
  });

  it("flux qui n'est plus lu : interrompu et place libérée ; aucun délai pendant la lecture d'une carte", async () => {
    let ends = 0;
    const stream = createAccountExportStream({
      account,
      maps: [map("m1", "Sahel"), map("m2", "Arctique")],
      now,
      // Lecture de la base plus longue que le délai entre deux lectures du navigateur.
      readData: (id) =>
        new Promise((resolve) => setTimeout(() => resolve({ dataText: `{"id": "${id}"}`, coverText: null }), 60)),
      onEnd: () => (ends += 1),
      timeouts: { firstReadMs: 1_000, idleMs: 30 },
    });
    const reader = stream.getReader();
    await reader.read(); // tête
    expect((await reader.read()).done).toBe(false); // m1 : 60 ms de lecture, sans interruption
    expect(ends).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(ends).toBe(1);
    await expect(reader.read()).rejects.toBeInstanceOf(ExportStalledError);
    expect(ends).toBe(1);
  });

  it("flux lu jusqu'au bout : aucune minuterie ne reste", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let ends = 0;
      const stream = createAccountExportStream({ account, maps: [], now, readData: async () => null, onEnd: () => (ends += 1) });
      expect(vi.getTimerCount()).toBe(1);
      expect(JSON.parse(await new Response(stream).text()).maps).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      expect(ends).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aucune carte : liste vide", async () => {
    const stream = createAccountExportStream({ account, maps: [], now, readData: async () => null, onEnd: () => {} });
    expect(JSON.parse(await new Response(stream).text()).maps).toEqual([]);
  });

  it("nom de fichier daté, sans donnée personnelle", () => {
    expect(accountExportFileName(now)).toBe("stratavault-donnees-2026-10-09.json");
  });
});

describe("téléchargements simultanés", () => {
  afterEach(() => {
    resetExportSlots();
    vi.useRealTimers();
  });

  it("un par compte ; une place ne reste jamais prise indéfiniment", () => {
    resetExportSlots();
    let time = 0;
    const clock = () => time;
    const first = acquireExportSlot("a", "ip-1", clock);
    expect(first.status).toBe("acquired");
    expect(acquireExportSlot("a", "ip-2", clock).status).toBe("account-busy");
    expect(acquireExportSlot("b", "ip-2", clock).status).toBe("acquired");
    time = EXPORT_SLOT_TTL_MS;
    const again = acquireExportSlot("a", "ip-1", clock);
    expect(again.status).toBe("acquired");
    // L'ancienne place, expirée, ne libère pas la nouvelle.
    if (first.status === "acquired") first.release();
    expect(acquireExportSlot("a", "ip-1", clock).status).toBe("account-busy");
    if (again.status === "acquired") again.release();
    expect(acquireExportSlot("a", "ip-1", clock).status).toBe("acquired");
  });

  it("au plus deux par adresse IP, même avec plusieurs comptes", () => {
    resetExportSlots();
    for (let i = 0; i < MAX_EXPORTS_PER_IP; i += 1) expect(acquireExportSlot(`compte-${i}`, "ip-1").status).toBe("acquired");
    expect(acquireExportSlot("autre", "ip-1").status).toBe("ip-busy");
    expect(acquireExportSlot("autre", "ip-2").status).toBe("acquired");
  });

  it("durées annoncées sur /confidentialite conformes au code", () => {
    const retention = PROCESSINGS.find((p) => p.id === "securite")!.retention;
    expect(retention).toContain(`${EXPORT_FIRST_READ_TIMEOUT_MS / 1000} secondes sans première lecture`);
    expect(retention).toContain(`${EXPORT_IDLE_TIMEOUT_MS / 60_000} minutes entre deux lectures`);
    expect(retention).toContain(`au plus tard ${EXPORT_SLOT_TTL_MS / 60_000} minutes après son début`);
  });

  it("entrée effacée de la mémoire au plus tard 15 minutes après le début, sans autre téléchargement", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    resetExportSlots();
    acquireExportSlot("a", "ip-1");
    const b = acquireExportSlot("b", "ip-2");
    if (b.status === "acquired") b.release();
    // Place libérée : sa minuterie disparaît avec elle.
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(EXPORT_SLOT_TTL_MS - 1);
    expect(exportSlotCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(exportSlotCount()).toBe(0);
    expect(acquireExportSlot("a", "ip-1").status).toBe("acquired");
  });
});

describe("confirmation de la suppression", () => {
  it("exige SUPPRIMER (espaces autour tolérés) et un mot de passe", () => {
    expect(deleteAccountSchema.safeParse({ password: "x", confirm: " SUPPRIMER " }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ password: "x", confirm: "Supprimer" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "", confirm: "SUPPRIMER" }).success).toBe(false);
  });
});

describe("dates du compte", () => {
  it("en français, à l'heure de Paris", () => {
    expect(formatAccountDate("2026-10-08T23:30:00Z")).toBe("9 octobre 2026");
    expect(formatAccountDate(null)).toBe("inconnue");
    expect(formatAccountDate("pas une date")).toBe("inconnue");
  });
});

describe("« Changer mon mot de passe »", () => {
  it("message propre à la page : l'adresse du compte, sans formule anti-énumération", () => {
    const message = passwordChangeRequested("alice@exemple.fr");
    expect(message).toContain("alice@exemple.fr");
    expect(message).not.toContain("Si un compte existe");
    expect(message).toContain("réessayez dans une heure");
  });
});
