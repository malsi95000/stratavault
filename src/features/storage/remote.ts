// Banque distante (mode compte) : les cartes passent par les Server Actions de src/features/maps
// (actions.ts), qui interrogent Supabase via src/lib/supabase/maps.ts.
// Le contenu n'est jamais renvoyé par le serveur après une écriture : l'entrée est recomposée ici.
import { MAX_MAP_BYTES, jsonByteLength } from "@/features/maps/limits";
import type { MapActionError, MapActionResult, RemoteMap, RemoteMapInfo, RemoteMapSummary } from "@/features/maps/types";
import type { MapDoc } from "@/features/map-doc/types";
import { MapConflictError } from "./types";
import type { MapBank, MapEntry, StoredMapEntry } from "./types";

/**
 * Server Actions des cartes (injectées pour les tests). Chacune reçoit d'abord le compte attendu :
 * le serveur refuse la requête si la session appartient à un autre compte.
 */
export type RemoteMapsApi = {
  listMaps: (userId: string) => Promise<MapActionResult<RemoteMapSummary[]>>;
  getMap: (userId: string, id: string) => Promise<MapActionResult<RemoteMap | null>>;
  createMap: (userId: string, name: string, doc: MapDoc) => Promise<MapActionResult<RemoteMapInfo>>;
  updateMap: (
    userId: string,
    id: string,
    doc: MapDoc,
    expectedRevision: number,
  ) => Promise<MapActionResult<RemoteMapInfo | null>>;
  renameMap: (userId: string, id: string, name: string) => Promise<MapActionResult<RemoteMapInfo | null>>;
  deleteMap: (userId: string, id: string) => Promise<MapActionResult<null>>;
};

/** « network » : le serveur n'a pas répondu (hors ligne, nouvelle version déployée…). */
export type RemoteFailure = MapActionError | "network";

export class RemoteBankError extends Error {
  constructor(readonly reason: RemoteFailure) {
    super(`Banque distante : ${reason}`);
    this.name = "RemoteBankError";
  }
}

async function call<T>(request: () => Promise<MapActionResult<T>>): Promise<T> {
  let result: MapActionResult<T>;
  try {
    result = await request();
  } catch {
    throw new RemoteBankError("network");
  }
  if (!result.ok) {
    // Contenu modifié ailleurs : même erreur que pour toute banque (voir MapRepository.update).
    if (result.error === "conflict") throw new MapConflictError();
    throw new RemoteBankError(result.error);
  }
  return result.value;
}

/** Refuse avant l'envoi une carte que le serveur refuserait (et que la requête ne pourrait pas porter). */
function checkSize(doc: MapDoc) {
  if (jsonByteLength(doc) > MAX_MAP_BYTES) throw new RemoteBankError("too-large");
}

/** La version de la banque générique est le numéro de révision de la base, en texte. */
const infoOf = ({ id, name, updated, revision }: RemoteMapInfo) => ({ id, name, updated, version: String(revision) });
const entryOf = (info: RemoteMapInfo, data: MapDoc): MapEntry => ({ ...infoOf(info), data });
const revisionOf = (version: string | undefined) => {
  const revision = Number(version);
  return version !== undefined && Number.isSafeInteger(revision) && revision > 0 ? revision : undefined;
};

/** Banque du compte `userId` (celui pour lequel la page a été ouverte). */
export function createRemoteBank(api: RemoteMapsApi, userId: string): MapBank {
  return {
    async list() {
      const maps = await call(() => api.listMaps(userId));
      return maps.map((map): StoredMapEntry => ({ ...infoOf(map), stats: map.stats, data: null }));
    },

    async get(id) {
      const map = await call(() => api.getMap(userId, id));
      return map && { ...infoOf(map), data: map.data };
    },

    // L'identifiant est toujours choisi par le serveur : celui que proposerait l'appelant est ignoré.
    async create(name, data) {
      checkSize(data);
      return entryOf(await call(() => api.createMap(userId, name, data)), data);
    },

    async update(id, data, expectedVersion) {
      checkSize(data);
      const expected = revisionOf(expectedVersion);
      // Version attendue absente ou illisible (base locale altérée…) : conflit, jamais une écriture
      // sans contrôle de version.
      if (expected === undefined) throw new MapConflictError();
      const info = await call(() => api.updateMap(userId, id, data, expected));
      return info && entryOf(info, data);
    },

    async rename(id, name) {
      const info = await call(() => api.renameMap(userId, id, name));
      return info && { ...infoOf(info), data: null };
    },

    async remove(id) {
      await call(() => api.deleteMap(userId, id));
    },
  };
}
