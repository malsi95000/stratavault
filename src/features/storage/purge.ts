// Effacement des copies locales des comptes (navigateur uniquement) : une base `stratavault-u-<id>`
// ne doit pas rester dans ce navigateur après la fin de la session de ce compte.
import { deleteDB } from "idb";
import { isDisposableCopy } from "./indexeddb";
import { DEMO_MODE, otherUsersDatabases } from "./mode";
import type { StorageMode } from "./mode";

export type PurgeDeps = {
  listDatabases: () => Promise<string[]>;
  isDisposableCopy: (name: string) => Promise<boolean>;
  deleteDatabase: (name: string) => Promise<void>;
};

const browserDeps = (): PurgeDeps | null =>
  typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function"
    ? null
    : {
        listDatabases: async () => (await indexedDB.databases()).flatMap((db) => (db.name ? [db.name] : [])),
        isDisposableCopy,
        deleteDatabase: (name) => deleteDB(name),
      };

export type PurgeOptions = {
  /** Base ouverte par la session de cet onglet entre-temps : jamais effacée. */
  inUse?: (name: string) => boolean;
  deps?: PurgeDeps | null;
};

/**
 * Efface les copies locales des comptes autres que `mode` (session expirée, déconnexion sans
 * JavaScript, réponse du serveur perdue…). Quand un compte s'ouvre, celles des autres comptes sont
 * toutes effacées. Sinon (démo, page de connexion sans session), seules les copies effaçables sans
 * perte le sont : une carte jamais envoyée reste pour la prochaine connexion de son compte.
 * Nettoyage au mieux : rien ne dépend de son succès. Renvoie les bases effacées.
 */
export async function purgeAccountCopies(
  mode: StorageMode = DEMO_MODE,
  { inUse = () => false, deps = browserDeps() }: PurgeOptions = {},
): Promise<string[]> {
  if (!deps) return [];
  const everything = mode.kind === "account";
  const purged: string[] = [];
  try {
    await Promise.all(
      otherUsersDatabases(await deps.listDatabases(), mode).map(async (name) => {
        if (!everything && !(await deps.isDisposableCopy(name))) return;
        if (inUse(name)) return;
        await deps.deleteDatabase(name);
        purged.push(name);
      }),
    );
  } catch {
    // Une base gardée ouverte ailleurs, ou une lecture impossible : elle sera effacée une autre fois.
  }
  return purged.sort();
}
