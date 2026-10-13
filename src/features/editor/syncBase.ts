// Banque distante (mode compte) : version de la carte active dont dérive le document de l'éditeur.
// Elle accompagne chaque envoi (contrôle optimiste) : une version plus récente, enregistrée depuis un
// autre appareil ou un autre onglet de ce compte, n'est jamais écrasée. Elle est aussi gardée dans la
// base locale, pour que les modifications renvoyées après un rechargement soient contrôlées de la
// même façon.
// Mode démo : aucun suivi. Deux onglets ouverts sur la même carte s'écrasent (la dernière écriture
// l'emporte), comme dans la bêta ; chaque onglet de l'éditeur en est averti (otherTabs.ts).
import type { MapRepository, SyncBase } from "@/features/storage";

export type SyncBaseTracker = {
  /** Version attendue par la banque pour la carte `id` (undefined : inconnue, écriture sans contrôle). */
  expected: (id: string) => string | undefined;
  /** Le document de la carte `id` dérive désormais de cette version de la banque. */
  rebase: (id: string, entry: { version?: string }) => void;
  /** Plus aucune version connue (carte détachée, nouvelle carte). */
  clear: () => void;
  /** Reprend la version lue au chargement (déjà enregistrée dans la base locale, ou à y écrire). */
  restore: (base: SyncBase | null) => void;
  /** Enregistre la version courante dans la base locale, si elle a changé. */
  persist: () => Promise<void>;
  /** La valeur de la base locale est inconnue (un autre onglet a pu l'écrire) : le prochain persist() l'écrit. */
  forget: () => void;
};

const same = (a: SyncBase | null, b: SyncBase | null) => a?.id === b?.id && a?.version === b?.version;

/** Sans banque distante (démo), rien n'est suivi ni écrit. */
export function createSyncBaseTracker(repo: MapRepository, enabled: boolean): SyncBaseTracker {
  let base: SyncBase | null = null;
  // Valeur enregistrée dans la base locale (undefined : inconnue, à réécrire au prochain envoi).
  let persisted: SyncBase | null | undefined = undefined;
  return {
    expected: (id) => (enabled && base?.id === id ? base.version : undefined),
    rebase(id, entry) {
      if (enabled) base = entry.version ? { id, version: entry.version } : null;
    },
    clear() {
      base = null;
    },
    restore(loaded) {
      base = enabled ? loaded : null;
      persisted = undefined;
    },
    async persist() {
      if (!enabled || (persisted !== undefined && same(persisted, base))) return;
      const next = base;
      await repo.setSyncBase(next);
      persisted = next;
    },
    forget() {
      persisted = undefined;
    },
  };
}
