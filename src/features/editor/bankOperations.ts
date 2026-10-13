// Actions explicites de l'éditeur sur la banque : enregistrer, ouvrir une carte, nouvelle carte,
// importer, renommer, supprimer. Elles passent par la file d'écriture de la sauvegarde automatique
// (autoSave.ts), pour ne jamais s'appliquer dans le désordre avec elle.
import { hasContent } from "@/features/map-doc/ops";
import { blankDoc, parseMapDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import type { MapEntry } from "@/features/storage";
import type { AutoSave } from "./autoSave";
import { bankCreated, bankUpdated, cleanMapName } from "./persistenceApi";
import type { Persistence } from "./persistenceApi";
import { MAP_CONFLICT, UNTITLED_MAP } from "./saveStatus";

type BankOperations = Pick<
  Persistence,
  "needsBankPrompt" | "saveToBank" | "openMap" | "newMap" | "importDoc" | "listMaps" | "renameMap" | "deleteMap"
>;

/** Résultat de la mise à jour de la carte active, dans la file des écritures. */
type ActiveUpdate =
  | { kind: "updated"; entry: MapEntry }
  | { kind: "recreated"; entry: MapEntry }
  | { kind: "conflict" }
  | { kind: "stale" };

export function createBankOperations(core: AutoSave): BankOperations {
  const { repo, store, remote } = core;

  const needsBankPrompt = () => {
    const { activeMapId, doc } = store.getState();
    return activeMapId === null && hasContent(doc);
  };

  /**
   * Écrit les modifications en attente avant de remplacer le document. false s'il ne peut pas être
   * remplacé sans perte : écriture échouée, ou (banque distante) carte active détachée pendant
   * l'envoi parce qu'elle a été supprimée ou modifiée ailleurs : sa version n'est alors plus que dans
   * l'éditeur, il faut proposer de l'enregistrer (comme ensureSynced dans la bêta).
   */
  const flushBeforeReplacing = async (): Promise<boolean> => {
    const before = store.getState().activeMapId;
    const saved = await core.flush();
    return saved && !(remote && before !== null && needsBankPrompt());
  };

  /** Nouvelle carte de la banque avec ce document : elle devient la carte active. */
  const becomeActive = async (entry: MapEntry, doc: MapDoc) => {
    core.adopt(entry, doc);
    // Action explicite : la carte est à l'abri dans la banque et la sauvegarde automatique reprend
    // (même après un échec de lecture). Le brouillon devient la copie de cette carte avant qu'elle
    // ne soit rattachée comme carte active (voir autoSave, write).
    store.getState().setActiveMapId(entry.id);
    if (await core.switchTo()) core.setStatus(bankCreated(entry.name));
  };

  /** « Mettre à jour la banque » : envoie le document de la carte active, dans la file des écritures. */
  const updateActive = (activeMapId: string, doc: MapDoc): Promise<ActiveUpdate> =>
    core.enqueue(async (): Promise<ActiveUpdate> => {
      // Une écriture passée avant dans la file a pu détacher la carte (conflit, carte supprimée
      // ailleurs : son statut est déjà affiché), ou la session a changé de carte : rien n'est
      // envoyé ni recréé.
      if (core.isDisposed() || core.isDetached(activeMapId) || store.getState().activeMapId !== activeMapId) {
        return { kind: "stale" };
      }
      const sent = await core.send(activeMapId, doc);
      if (sent === "conflict") {
        await core.detach(activeMapId);
        return { kind: "conflict" };
      }
      // Carte supprimée ailleurs : l'utilisateur demande explicitement à l'enregistrer. Elle est
      // recréée sous un nouvel identifiant, choisi par la banque : jamais l'ancien, qu'une copie
      // périmée de la carte supprimée (autre appareil) pourrait encore viser.
      if (sent === null) return { kind: "recreated", entry: await repo.create(UNTITLED_MAP, doc) };
      await core.accepted(activeMapId, doc, sent);
      // La banque a reçu le document courant : plus rien à renvoyer.
      await core.markSent(doc);
      return { kind: "updated", entry: sent };
    });

  return {
    needsBankPrompt,

    async saveToBank(name) {
      await core.hydrate();
      const { doc, activeMapId } = store.getState();
      try {
        if (activeMapId) {
          const result = await updateActive(activeMapId, doc);
          if (result.kind === "conflict") core.setStatus(MAP_CONFLICT);
          if (result.kind === "conflict" || result.kind === "stale") return "failed";
          if (result.kind === "recreated") {
            await becomeActive(result.entry, doc);
            return "created";
          }
          core.setStatus(bankUpdated(result.entry.name));
          return "updated";
        }
        const trimmed = cleanMapName(name ?? "");
        if (!trimmed) return "needs-name";
        await becomeActive(await repo.create(trimmed, doc), doc);
        return "created";
      } catch (error) {
        if (!remote) {
          core.setStatus(core.messages.failed);
          return "failed";
        }
        const { status, retry } = remote.describeError(error);
        if (retry && activeMapId) {
          // Mise à jour de la carte active : la sauvegarde automatique la renvoie réellement.
          core.retrySoon();
          core.setStatus(status);
        } else {
          // Création : rien n'est réessayé (le nom saisi n'est pas gardé), l'utilisateur doit recommencer.
          core.setStatus(retry ? remote.bankOffline : status);
        }
        return "failed";
      }
    },

    async openMap(id, { discard = false } = {}) {
      await core.hydrate();
      // Écrire d'abord, puis relire : rouvrir la carte active doit rendre la version qui vient d'être écrite.
      const saved = await flushBeforeReplacing();
      const entry = await repo.get(id);
      const doc = entry ? parseMapDoc(entry.data) : null;
      if (!doc) return "unavailable";
      if (!saved && !discard) return "unsaved";
      // La carte est renvoyée telle quelle à la banque (sans être marquée « connue ») : sa date de mise
      // à jour change et elle remonte en tête de la liste, comme dans la bêta et le mode démo. Son
      // contenu ne change pas, donc sa version non plus : aucun conflit sur les autres appareils.
      store.getState().replaceDoc(doc, id);
      if (entry) core.rebase(id, entry);
      await core.switchTo();
      return "opened";
    },

    async newMap({ discard = false } = {}) {
      await core.hydrate();
      if (!(await flushBeforeReplacing()) && !discard) return "unsaved";
      core.clearBase();
      store.getState().replaceDoc(blankDoc(), null);
      await core.switchTo();
      return "done";
    },

    async importDoc(doc) {
      await core.hydrate();
      core.resume();
      store.getState().replaceDoc(doc);
    },

    listMaps() {
      return repo.list();
    },

    async renameMap(id, name) {
      const trimmed = cleanMapName(name);
      if (!trimmed) return false;
      return (await repo.rename(id, trimmed)) !== null;
    },

    async deleteMap(id) {
      await core.hydrate();
      await repo.remove(id);
      if (store.getState().activeMapId === id) {
        // Détacher la carte supprimée est toujours sûr : inutile d'attendre l'écriture du brouillon.
        store.getState().setActiveMapId(null);
        await core.forgetActive();
      }
    },
  };
}
