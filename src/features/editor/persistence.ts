// Persistance de l'éditeur : hydratation depuis le dépôt, sauvegarde automatique (autoSave.ts) et
// actions explicites sur la banque (bankOperations.ts). Voir l'interface Persistence (persistenceApi.ts).
import type { MapRepository } from "@/features/storage";
import type { StoreApi } from "zustand/vanilla";
import { createAutoSave } from "./autoSave";
import { createBankOperations } from "./bankOperations";
import type { Persistence } from "./persistenceApi";
import type { PersistenceOptions } from "./saveStatus";
import type { EditorState } from "./store";

export {
  DEMO_MESSAGES,
  LOAD_FAILED,
  MAP_CONFLICT,
  LOAD_UNREADABLE,
  MAP_GONE,
  SAVE_DELAY_MS,
  SAVE_FAILED,
  SAVE_OK,
  UNTITLED_MAP,
} from "./saveStatus";
export type { PersistenceMessages, PersistenceOptions, RemoteOptions } from "./saveStatus";
export { MAP_NAME_PROMPT, bankCreated, bankUpdated, cleanMapName, defaultMapName } from "./persistenceApi";
export type { BankSaveResult, NewMapResult, OpenMapResult, Persistence, SwitchOptions } from "./persistenceApi";

export function createPersistence(
  repo: MapRepository,
  store: StoreApi<EditorState>,
  options: PersistenceOptions = {},
): Persistence {
  const core = createAutoSave(repo, store, options);
  return {
    ...createBankOperations(core),
    hydrate: core.hydrate,
    flush: core.flush,
    loadFailed: core.loadFailed,
    isRemote: () => core.remote !== undefined,
    keptLocally: core.keptLocally,
    hasUnsentChanges: core.hasUnsentChanges,
    dispose: core.dispose,
  };
}
