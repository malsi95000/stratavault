// Choix du dépôt selon la session : démo locale, ou compte (banque distante + copie locale cloisonnée).
import { DB_NAME, createIndexedDbRepository } from "./indexeddb";
import { createRemoteBank } from "./remote";
import type { RemoteMapsApi } from "./remote";
import type { MapRepository } from "./types";
import { withBank } from "./withBank";

/** Compte connecté, transmis par le Server Component de la page (session vérifiée par l'API Auth, getUser). */
export type Account = { userId: string; email: string | null };

/**
 * demo : tout reste dans la base IndexedDB historique (« stratavault »), comme avant les comptes.
 * account : cartes dans Supabase ; brouillon et carte active dans une base propre à l'utilisateur.
 */
export type StorageMode = { kind: "demo" } | { kind: "account"; userId: string };

export const DEMO_MODE: StorageMode = { kind: "demo" };

export const storageModeOf = (account: Account | null): StorageMode =>
  account ? { kind: "account", userId: account.userId } : DEMO_MODE;

/** Préfixe des bases locales des comptes. */
export const USER_DB_PREFIX = `${DB_NAME}-u-`;

/** Nom de la base locale d'un mode : la démo garde la base existante (aucune migration à faire). */
export function localDbName(mode: StorageMode): string {
  return mode.kind === "demo" ? DB_NAME : USER_DB_PREFIX + mode.userId;
}

/** Clé d'identité d'un mode : deux modes de même clé partagent dépôt et persistance. */
export const storageKey = (mode: StorageMode) => localDbName(mode);

/** Bases locales laissées par d'autres comptes de ce navigateur (à effacer). */
export function otherUsersDatabases(names: readonly string[], mode: StorageMode): string[] {
  const own = localDbName(mode);
  return names.filter((name) => name.startsWith(USER_DB_PREFIX) && name !== own);
}

export type RepositoryDeps = {
  /** Server Actions des cartes (mode compte). */
  remote: RemoteMapsApi;
  /**
   * Mode compte : la base locale a été effacée ou mise à jour par un autre onglet (déconnexion…).
   * Elle reste alors fermée : rien ne la recrée en arrière-plan.
   */
  onLocalDatabaseClosed?: () => void;
};

export function createRepositoryFor(mode: StorageMode, deps: RepositoryDeps): MapRepository {
  if (mode.kind === "demo") return createIndexedDbRepository({ dbName: localDbName(mode) });
  const local = createIndexedDbRepository({
    dbName: localDbName(mode),
    onVersionChange: deps.onLocalDatabaseClosed ?? (() => {}),
  });
  return withBank(local, createRemoteBank(deps.remote, mode.userId));
}
