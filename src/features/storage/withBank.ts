import type { MapBank, MapRepository } from "./types";

/**
 * Point d'extension pour un dépôt distant (comptes) : les cartes viennent de `bank`, tandis que le
 * brouillon courant et l'id de la carte active restent dans le dépôt local de `local`.
 */
export function withBank(local: MapRepository, bank: MapBank): MapRepository {
  return {
    list: () => bank.list(),
    get: (id) => bank.get(id),
    create: (name, data, id) => bank.create(name, data, id),
    update: (id, data, expectedVersion) => bank.update(id, data, expectedVersion),
    rename: (id, name) => bank.rename(id, name),
    setCover: (id, cover) => bank.setCover(id, cover),
    remove: (id) => bank.remove(id),
    getDraft: () => local.getDraft(),
    setDraft: (data) => local.setDraft(data),
    setAsideDraft: () => local.setAsideDraft(),
    getActiveId: () => local.getActiveId(),
    setActiveId: (id) => local.setActiveId(id),
    getPendingSync: () => local.getPendingSync(),
    setPendingSync: (pending) => local.setPendingSync(pending),
    getSyncBase: () => local.getSyncBase(),
    setSyncBase: (base) => local.setSyncBase(base),
  };
}
