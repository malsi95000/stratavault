// Dépôt IndexedDB : une entrée par carte (plus de réécriture de toute la banque à chaque frappe,
// plus de limite de 5 Mo du localStorage de la bêta).
import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import { hasContent, uid } from "@/features/map-doc/ops";
import { parseMapDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import { MapConflictError } from "./types";
import type { MapEntry, MapRepository, StoredMapEntry, SyncBase } from "./types";

export const DB_NAME = "stratavault";
// 2 : répare une base « stratavault » vide en version 1, sans tables (créée par un simple
// indexedDB.open sans version, depuis les outils du navigateur ou un autre script de la même origine).
const DB_VERSION = 2;
const DRAFT_KEY = "draft";
const ACTIVE_KEY = "activeMapId";
const PENDING_SYNC_KEY = "pendingSync";
const SYNC_BASE_KEY = "syncBase";
/** Préfixe des brouillons illisibles mis de côté (suivi de la date). */
export const UNREADABLE_DRAFT_PREFIX = "draft-illisible:";

interface StratavaultDB extends DBSchema {
  maps: { key: string; value: StoredMapEntry; indexes: { updated: string } };
  meta: { key: string; value: unknown };
}

type Options = {
  dbName?: string;
  now?: () => Date;
  /**
   * Appelé quand un autre onglet efface ou met à jour la base. Si cette option est donnée, la base
   * reste ensuite fermée (toute lecture ou écriture échoue) au lieu d'être rouverte, donc recréée.
   */
  onVersionChange?: () => void;
};

/** La base a été effacée ou mise à jour ailleurs : rechargez la page. */
export class LocalDatabaseClosedError extends Error {
  constructor() {
    super("Base locale fermée par un autre onglet.");
    this.name = "LocalDatabaseClosedError";
  }
}

export function createIndexedDbRepository({
  dbName = DB_NAME,
  now = () => new Date(),
  onVersionChange,
}: Options = {}): MapRepository {
  let dbPromise: Promise<IDBPDatabase<StratavaultDB>> | null = null;
  let closed = false;

  const db = () => {
    if (closed) return Promise.reject(new LocalDatabaseClosedError());
    dbPromise ??= openDB<StratavaultDB>(dbName, DB_VERSION, {
      // Idempotent : ne crée que les tables absentes (les données d'une base en version 1 sont gardées).
      upgrade(database) {
        if (!database.objectStoreNames.contains("maps")) {
          const maps = database.createObjectStore("maps", { keyPath: "id" });
          maps.createIndex("updated", "updated");
        }
        if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta");
      },
      // Une autre ouverture (nouvel onglet avec une version plus récente) ou un effacement : on libère la base.
      blocking() {
        void dbPromise?.then((d) => d.close());
        dbPromise = null;
        if (onVersionChange) {
          closed = true;
          onVersionChange();
        }
      },
      terminated() {
        dbPromise = null;
      },
    }).catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
    return dbPromise;
  };

  const stamp = () => now().toISOString();
  // Version du contenu : un compteur, incrémenté à chaque modification du contenu.
  const nextVersion = (entry: StoredMapEntry) => String((Number(entry.version) || 0) + 1);

  return {
    async list() {
      const entries = await (await db()).getAll("maps");
      // String() : une entrée corrompue ne doit pas faire échouer toute la liste.
      return entries.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    },

    async get(id) {
      return (await (await db()).get("maps", id)) ?? null;
    },

    async create(name, data, id = uid()) {
      const entry: MapEntry = { id, name, updated: stamp(), version: "1", data };
      await (await db()).put("maps", entry);
      return entry;
    },

    async update(id, data, expectedVersion) {
      const tx = (await db()).transaction("maps", "readwrite");
      const current = await tx.store.get(id);
      if (!current) {
        await tx.done;
        return null;
      }
      if (expectedVersion !== undefined && current.version !== expectedVersion) {
        await tx.done;
        throw new MapConflictError();
      }
      const entry: MapEntry = { ...current, data, updated: stamp(), version: nextVersion(current) };
      await Promise.all([tx.store.put(entry), tx.done]);
      return entry;
    },

    async rename(id, name) {
      const tx = (await db()).transaction("maps", "readwrite");
      const current = await tx.store.get(id);
      if (!current) {
        await tx.done;
        return null;
      }
      const entry: StoredMapEntry = { ...current, name };
      await Promise.all([tx.store.put(entry), tx.done]);
      return entry;
    },

    async remove(id) {
      await (await db()).delete("maps", id);
    },

    async getDraft() {
      return (await (await db()).get("meta", DRAFT_KEY)) ?? null;
    },

    async setDraft(data: MapDoc) {
      await (await db()).put("meta", data, DRAFT_KEY);
    },

    async setAsideDraft() {
      const tx = (await db()).transaction("meta", "readwrite");
      const draft = await tx.store.get(DRAFT_KEY);
      if (draft !== undefined) {
        await tx.store.put(draft, UNREADABLE_DRAFT_PREFIX + stamp());
        await tx.store.delete(DRAFT_KEY);
      }
      await tx.done;
    },

    async getActiveId() {
      const id = await (await db()).get("meta", ACTIVE_KEY);
      return typeof id === "string" ? id : null;
    },

    async setActiveId(id) {
      const database = await db();
      if (id === null) await database.delete("meta", ACTIVE_KEY);
      else await database.put("meta", id, ACTIVE_KEY);
    },

    async getPendingSync() {
      return (await (await db()).get("meta", PENDING_SYNC_KEY)) === true;
    },

    async setPendingSync(pending) {
      const database = await db();
      if (pending) await database.put("meta", true, PENDING_SYNC_KEY);
      else await database.delete("meta", PENDING_SYNC_KEY);
    },

    async getSyncBase() {
      const base = await (await db()).get("meta", SYNC_BASE_KEY);
      return isSyncBase(base) ? base : null;
    },

    async setSyncBase(base) {
      const database = await db();
      if (base) await database.put("meta", { id: base.id, version: base.version }, SYNC_BASE_KEY);
      else await database.delete("meta", SYNC_BASE_KEY);
    },
  };
}

function isSyncBase(value: unknown): value is SyncBase {
  if (typeof value !== "object" || value === null) return false;
  const { id, version } = value as Record<string, unknown>;
  return typeof id === "string" && typeof version === "string";
}

/**
 * Une base locale de compte n'est-elle qu'une copie de la banque distante, effaçable sans rien
 * perdre ? Non si des modifications n'ont jamais été envoyées, ou si le brouillon a du contenu sans
 * être rattaché à une carte de la banque. Dans le doute (lecture impossible), non.
 */
export async function isDisposableCopy(dbName: string): Promise<boolean> {
  let database: IDBPDatabase<StratavaultDB> | undefined;
  try {
    // Sans version : ouvre la base telle quelle, sans la mettre à jour.
    database = await openDB<StratavaultDB>(dbName);
    if (!database.objectStoreNames.contains("meta")) return true;
    const [pending, activeId, draft] = await Promise.all([
      database.get("meta", PENDING_SYNC_KEY),
      database.get("meta", ACTIVE_KEY),
      database.get("meta", DRAFT_KEY),
    ]);
    if (pending === true) return false;
    if (typeof activeId === "string" || draft === undefined) return true;
    const doc = parseMapDoc(draft);
    return doc !== null && !hasContent(doc);
  } catch {
    return false;
  } finally {
    database?.close();
  }
}
