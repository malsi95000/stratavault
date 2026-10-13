// Lecture de l'état de l'éditeur au chargement : brouillon, carte active et, avec une banque
// distante, modifications pas encore envoyées. Une donnée illisible n'est jamais écrasée.
import { blankDoc, parseMapDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import type { MapRepository, StoredMapEntry, SyncBase } from "@/features/storage";
import { LOAD_UNREADABLE } from "./saveStatus";
import type { PersistenceMessages, RemoteOptions } from "./saveStatus";

export type LoadedEditorState = {
  doc: MapDoc;
  activeId: string | null;
  /** Statut à afficher (null : aucun). */
  status: string | null;
  /** Lecture impossible : rien n'est rattaché à la banque et rien ne doit être écrit automatiquement. */
  failed: boolean;
  /** Le brouillon local contient des modifications pas encore envoyées à la banque distante. */
  pendingSync: boolean;
  /** Ces modifications l'emportent et sont à renvoyer tout de suite. */
  resend: boolean;
  /** Banque distante : document de la carte active tel que la banque vient de le renvoyer. */
  synced: { id: string; doc: MapDoc } | null;
  /** Banque distante : version de la carte active dont dérive le document (null : inconnue). */
  base: SyncBase | null;
};

/**
 * Banque distante : la version reçue devient la copie locale de la carte active. Sinon, un chargement
 * hors ligne afficherait l'ancien brouillon, et la modification suivante écraserait dans la banque la
 * version plus récente déjà reçue. Au mieux : un échec laisse l'ancien brouillon, sans bloquer le chargement.
 * Le brouillon est écrit avant sa version : si la page se ferme entre les deux, l'ancienne version
 * attendue provoque au pire un conflit (rien n'est écrasé), jamais l'inverse.
 */
async function keepLocalCopy(repo: MapRepository, doc: MapDoc, base: SyncBase | null) {
  try {
    await repo.setDraft(doc);
    await repo.setSyncBase(base);
  } catch {
    // Copie locale non rafraîchie : la banque reste la référence tant que le serveur répond.
  }
}

export async function loadEditorState(
  repo: MapRepository,
  { messages, remote }: { messages: PersistenceMessages; remote?: RemoteOptions },
): Promise<LoadedEditorState> {
  const loaded: LoadedEditorState = {
    doc: blankDoc(),
    activeId: null,
    status: null,
    failed: false,
    pendingSync: false,
    resend: false,
    synced: null,
    base: null,
  };
  let fromDraft: MapDoc | null = null;
  try {
    const [draft, id, pending, storedBase] = await Promise.all([
      repo.getDraft(),
      repo.getActiveId(),
      remote ? repo.getPendingSync() : false,
      remote ? repo.getSyncBase() : null,
    ]);
    fromDraft = draft === null ? null : parseMapDoc(draft);
    loaded.pendingSync = pending;
    // Version dont dérive le brouillon local de la carte active.
    const localBase = storedBase && storedBase.id === id ? storedBase : null;
    if (remote && pending && fromDraft && id) {
      // Modifications jamais arrivées dans la banque distante : elles l'emportent et sont renvoyées,
      // avec leur version de référence (une version plus récente, venue d'ailleurs, n'est pas écrasée).
      return { ...loaded, doc: fromDraft, activeId: id, resend: true, base: localBase };
    }
    let entry: StoredMapEntry | null = null;
    try {
      entry = id ? await repo.get(id) : null;
    } catch (error) {
      // Banque distante injoignable : si la copie locale de la carte active se lit (le brouillon lui
      // est toujours rattaché), elle reste affichée et sauvegardée ici ; la prochaine modification
      // part dans la banque dès que le serveur répond, avec sa version de référence.
      if (!remote || !remote.describeError(error).retry || !fromDraft || !id) throw error;
      return { ...loaded, doc: fromDraft, activeId: id, status: remote.loadOffline, base: localBase };
    }
    // La carte active n'est gardée que si elle se relit : sinon la sauvegarde automatique l'écraserait.
    const fromEntry = entry ? parseMapDoc(entry.data) : null;
    if (fromEntry && id) {
      loaded.activeId = id;
      if (remote) {
        loaded.synced = { id, doc: fromEntry };
        loaded.base = entry?.version ? { id, version: entry.version } : null;
      }
    }
    // En démo, sans brouillon lisible, la carte active fait foi (le brouillon en est normalement la
    // copie). Avec une banque distante, la carte a pu changer depuis un autre appareil : la banque
    // fait foi, le brouillon n'est qu'une copie locale déjà envoyée.
    loaded.doc = (remote ? (fromEntry ?? fromDraft) : (fromDraft ?? fromEntry)) ?? blankDoc();
    if (draft !== null && !fromDraft) await repo.setAsideDraft();
    if (id && !loaded.activeId) await repo.setActiveId(null);
    if (remote && fromEntry && loaded.activeId && !pending) await keepLocalCopy(repo, fromEntry, loaded.base);
    if ((draft !== null && !fromDraft) || (entry && !fromEntry)) loaded.status = LOAD_UNREADABLE;
    return loaded;
  } catch {
    // Lecture incomplète : on garde le brouillon s'il a été lu, on ne rattache rien à la banque et on
    // n'écrit plus rien automatiquement (le brouillon et la carte active restent intacts dans la base).
    return { ...loaded, doc: fromDraft ?? blankDoc(), activeId: null, status: messages.loadFailed, failed: true };
  }
}
