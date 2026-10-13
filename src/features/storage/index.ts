export type { MapBank, MapEntry, MapRepository, StoredMapEntry, SyncBase } from "./types";
export { MAX_MAP_NAME_LENGTH, MapConflictError } from "./types";
export { createIndexedDbRepository } from "./indexeddb";
export { withBank } from "./withBank";
export { RemoteBankError, createRemoteBank } from "./remote";
export type { RemoteFailure, RemoteMapsApi } from "./remote";
export {
  DEMO_MODE,
  USER_DB_PREFIX,
  createRepositoryFor,
  localDbName,
  otherUsersDatabases,
  storageKey,
  storageModeOf,
} from "./mode";
export type { Account, StorageMode } from "./mode";
export { purgeAccountCopies } from "./purge";
export type { PurgeDeps, PurgeOptions } from "./purge";
