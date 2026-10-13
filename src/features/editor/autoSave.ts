// Sauvegarde automatique de l'éditeur (debounce 250 ms en démo, comme la bêta) : chaque modification
// du document écrit le brouillon, et la carte active de la banque si elle existe. Avec une banque
// distante (mode compte), le brouillon local est écrit d'abord : une erreur réseau ne perd rien, et
// les modifications non envoyées sont renvoyées au chargement suivant. Chaque envoi porte la version
// de la banque dont dérive le document : une version plus récente (autre appareil) n'est jamais
// écrasée, la carte est alors détachée et reste dans l'éditeur.
// Les actions explicites (banque, nouvelle carte…) sont dans bankOperations.ts.
import type { MapEntry, MapRepository } from "@/features/storage";
import { MapConflictError } from "@/features/storage";
import type { MapDoc } from "@/features/map-doc/types";
import type { StoreApi } from "zustand/vanilla";
import { loadEditorState } from "./loadEditorState";
import { DEMO_MESSAGES, MAP_CONFLICT, MAP_GONE, SAVE_DELAY_MS } from "./saveStatus";
import type { PersistenceMessages, PersistenceOptions, RemoteOptions } from "./saveStatus";
import type { EditorState } from "./store";
import { createSyncBaseTracker } from "./syncBase";

/** Moteur de sauvegarde, partagé avec les opérations de la banque (bankOperations.ts). */
export type AutoSave = {
  repo: MapRepository;
  store: StoreApi<EditorState>;
  messages: PersistenceMessages;
  /** Banque distante (mode compte) ; undefined en démo. */
  remote: RemoteOptions | undefined;
  hydrate: () => Promise<void>;
  /** Écrit tout de suite la sauvegarde en attente ; false si des modifications ne sont pas enregistrées. */
  flush: () => Promise<boolean>;
  /** Reprend la sauvegarde automatique après une action explicite ; les modifications en attente sont abandonnées. */
  resume: () => void;
  /** Change de carte active : elle est enregistrée avec le brouillon par l'écriture qui suit. */
  switchTo: () => Promise<boolean>;
  /** Ajoute une tâche à la file des écritures (jamais deux envois de la même carte en même temps). */
  enqueue: <T>(task: () => Promise<T>) => Promise<T>;
  /** Envoie le document de la carte active ; null si elle n'existe plus, « conflict » si elle a changé ailleurs. */
  send: (id: string, doc: MapDoc) => Promise<MapEntry | null | "conflict">;
  /** Détache la carte active (supprimée ou modifiée ailleurs) : son contenu reste dans l'éditeur. */
  detach: (id: string) => Promise<void>;
  /** Prend acte d'un envoi réussi : document connu de la banque, nouvelle version de référence. */
  accepted: (id: string, doc: MapDoc, entry: MapEntry) => Promise<void>;
  /** Carte qui vient d'être créée avec ce document : il est connu de la banque, à sa version. */
  adopt: (entry: MapEntry, doc: MapDoc) => void;
  /** Le document de la carte `id` dérive désormais de cette version de la banque. */
  rebase: (id: string, entry: { version?: string }) => void;
  /** Plus aucune version de référence (nouvelle carte). */
  clearBase: () => void;
  /** La banque a reçu `doc` : plus rien à renvoyer s'il est toujours le document courant. */
  markSent: (doc: MapDoc) => Promise<void>;
  /** Des modifications restent à envoyer : nouvel essai automatique plus tard. */
  retrySoon: () => void;
  /** La carte active n'est plus enregistrée comme telle dans la base locale (carte supprimée). */
  forgetActive: () => Promise<void>;
  setStatus: (status: string) => void;
  isDetached: (id: string) => boolean;
  isDisposed: () => boolean;
  loadFailed: () => boolean;
  keptLocally: () => boolean;
  hasUnsentChanges: () => boolean;
  dispose: () => void;
};

export function createAutoSave(
  repo: MapRepository,
  store: StoreApi<EditorState>,
  { delay = SAVE_DELAY_MS, messages = DEMO_MESSAGES, remote }: PersistenceOptions = {},
): AutoSave {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  // Les écritures sont enchaînées pour ne jamais s'appliquer dans le désordre.
  let chain: Promise<boolean> = Promise.resolve(true);
  let hydrating: Promise<void> | null = null;
  // Vrai après un échec de lecture au chargement : aucune écriture automatique, pour ne rien écraser.
  let suspended = false;
  // Numéro de la dernière écriture lancée : seul l'échec de la plus récente laisse le document à réécrire.
  let writes = 0;
  // Carte active enregistrée dans la base (undefined : inconnue, après un échec de lecture).
  let persistedActive: string | null | undefined = undefined;
  // Banque distante : le brouillon local contient des modifications pas encore envoyées.
  let pendingSync = false;
  // Banque distante : dernier document connu de la banque pour la carte active (inutile de le renvoyer).
  let synced: { id: string; doc: MapDoc } | null = null;
  // Banque distante : version de la banque dont dérive le document de la carte active.
  const base = createSyncBaseTracker(repo, remote !== undefined);
  // Banque distante : carte détachée (supprimée ou modifiée ailleurs). Une écriture lancée avant le
  // détachement ne doit pas la rattacher ni l'envoyer sans contrôle.
  let detachedId: string | null = null;
  // Banque distante : la dernière écriture n'a échoué qu'à l'envoi (le brouillon local est à jour).
  let keptLocally = false;
  // Vrai après dispose() : la session est fermée (déconnexion, autre compte). Plus rien n'est lu ni
  // écrit dans le store, qui appartient désormais à la session suivante.
  let disposed = false;
  const setStatus = (status: string) => {
    if (!disposed) store.getState().setSaveStatus(status);
  };
  // Seule une banque distante en a besoin (en démo, chaque écriture met à jour la carte active).
  const remember = (id: string, doc: MapDoc) => {
    if (remote) synced = { id, doc };
  };
  const inBank = (id: string, doc: MapDoc) => synced?.id === id && synced.doc === doc;

  const attach = async (activeMapId: string | null) => {
    if (persistedActive === activeMapId) return;
    await repo.setActiveId(activeMapId);
    persistedActive = activeMapId;
  };

  const markPending = async (pending: boolean) => {
    if (!remote || pendingSync === pending) return;
    await repo.setPendingSync(pending);
    pendingSync = pending;
  };

  // Banque distante : la base locale est partagée par les onglets de ce navigateur ouverts sur ce
  // compte. Un autre onglet a pu y détacher la carte active (conflit) ou en rattacher une autre : avant
  // chaque écriture, ce qui y est enregistré est relu, au lieu de se fier à ce que cet onglet y a écrit
  // la dernière fois. Sinon, la carte active, enregistrée ici, resterait détachée au rechargement.
  const refreshShared = async () => {
    if (!remote) return;
    const [active, pending] = await Promise.all([repo.getActiveId(), repo.getPendingSync()]);
    persistedActive = active;
    pendingSync = pending;
    base.forget();
  };

  const retryLater = () => {
    if (!remote || timer || suspended || disposed) return;
    timer = setTimeout(() => void write(), remote.retryDelay);
  };

  const detach = async (id: string) => {
    detachedId = id;
    base.clear();
    if (!disposed && store.getState().activeMapId === id) store.getState().setActiveMapId(null);
    await markPending(false);
    await attach(null);
    await base.persist();
  };

  const send = async (id: string, doc: MapDoc): Promise<MapEntry | null | "conflict"> => {
    const expected = base.expected(id);
    // Banque distante : jamais d'envoi sans version de référence (il écraserait sans contrôle une
    // version plus récente). Version inconnue (carte détachée entre-temps, copie locale sans version) :
    // traité comme un conflit, le document reste ici.
    if (remote && expected === undefined) return "conflict";
    try {
      return await repo.update(id, doc, expected);
    } catch (error) {
      if (error instanceof MapConflictError) return "conflict";
      throw error;
    }
  };

  const accepted = async (id: string, doc: MapDoc, entry: MapEntry) => {
    remember(id, doc);
    base.rebase(id, entry);
    await base.persist();
  };

  const write = (): Promise<boolean> => {
    timer = null;
    // Le store appartient peut-être déjà à une autre session : rien n'en est recopié dans cette base.
    if (disposed) return Promise.resolve(false);
    dirty = false;
    const attempt = ++writes;
    const { doc } = store.getState();
    const current = store.getState().activeMapId;
    chain = chain.then(async () => {
      // Carte détachée depuis l'appel : le document est écrit comme brouillon, hors banque.
      const activeMapId = current !== null && current === detachedId ? null : current;
      let sending = false;
      const toSend = activeMapId !== null && !inBank(activeMapId, doc);
      try {
        await refreshShared();
        // Le brouillon et la carte active sont toujours cohérents dans la base : quand la carte active
        // change, elle est d'abord détachée, puis rattachée seulement une fois le brouillon écrit.
        // Sinon, après un échec, un brouillon périmé s'afficherait au rechargement sous le nom de la
        // nouvelle carte et l'écraserait.
        if (persistedActive !== activeMapId && persistedActive !== null) await attach(null);
        // Banque distante : la version de référence et la marque « à envoyer » sont écrites AVANT le
        // brouillon (transactions distinctes). Si la page se ferme entre les deux, l'ancien brouillon
        // est renvoyé (une version déjà connue) ; dans l'ordre inverse, le nouveau brouillon serait
        // ignoré au chargement. Pour une carte pas encore rattachée, elles restent sans effet tant que
        // la carte active n'est pas enregistrée (aucune en ce moment dans la base). Sans effet en démo.
        if (activeMapId && toSend) {
          await base.persist();
          await markPending(true);
        }
        await repo.setDraft(doc);
        // Banque distante : le brouillon, déjà écrit, est la copie la plus récente de la carte active.
        // Il lui est rattaché avant l'envoi, qui peut échouer (réseau).
        if (remote) await attach(activeMapId);
        if (activeMapId && toSend) {
          sending = true;
          const sent = await send(activeMapId, doc);
          sending = false;
          if (sent === "conflict") {
            // Rien n'est écrasé : la version de ce navigateur reste dans le brouillon, hors banque.
            await detach(activeMapId);
            setStatus(MAP_CONFLICT);
            if (attempt === writes) keptLocally = true;
            return false;
          }
          if (sent === null && remote) {
            await detach(activeMapId);
            setStatus(MAP_GONE);
            return true;
          }
          if (sent) await accepted(activeMapId, doc, sent);
        }
        await markPending(false);
        await attach(activeMapId);
        if (attempt === writes) keptLocally = false;
        setStatus(activeMapId ? messages.saved : messages.draftSaved);
        return true;
      } catch (error) {
        // Le document reste à écrire : le prochain flush() réessaie au lieu de renvoyer cet échec.
        if (attempt === writes) {
          dirty = true;
          keptLocally = sending && remote !== undefined;
        }
        if (sending && remote) {
          const { status, retry } = remote.describeError(error);
          setStatus(status);
          if (retry && attempt === writes) retryLater();
        } else {
          setStatus(messages.failed);
        }
        return false;
      }
    });
    return chain;
  };

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task);
    chain = run.then(
      () => true,
      () => false,
    );
    return run;
  };

  const schedule = () => {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = suspended || disposed ? null : setTimeout(() => void write(), delay);
  };

  const unsubscribe = store.subscribe((state, prev) => {
    if (prev.hydrated && state.doc !== prev.doc) schedule();
  });

  const flush = (): Promise<boolean> => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (suspended || disposed) return dirty ? Promise.resolve(false) : chain;
    return dirty ? write() : chain;
  };

  const resume = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    suspended = false;
    dirty = false;
  };

  const switchTo = (): Promise<boolean> => {
    if (timer) clearTimeout(timer);
    timer = null;
    suspended = false;
    detachedId = null;
    dirty = true;
    return flush();
  };

  const hydrate = (): Promise<void> => {
    if (disposed || store.getState().hydrated) return Promise.resolve();
    hydrating ??= (async () => {
      const loaded = await loadEditorState(repo, { messages, remote });
      // Session fermée pendant la lecture (déconnexion) : la carte lue n'est pas affichée.
      if (disposed) return;
      pendingSync = loaded.pendingSync;
      synced = loaded.synced;
      base.restore(loaded.base);
      // Après un échec de lecture, rien n'est écrit automatiquement (la base reste intacte).
      suspended = loaded.failed;
      // La base contient désormais la carte active retenue (ou aucune) ; inconnue après un échec.
      persistedActive = loaded.failed ? undefined : loaded.activeId;
      if (loaded.status) store.getState().setSaveStatus(loaded.status);
      store.getState().hydrate(loaded.doc, loaded.activeId);
      if (loaded.resend) schedule();
    })();
    return hydrating;
  };

  return {
    repo,
    store,
    messages,
    remote,
    hydrate,
    flush,
    resume,
    switchTo,
    enqueue,
    send,
    detach,
    accepted,
    adopt(entry, doc) {
      remember(entry.id, doc);
      base.rebase(entry.id, entry);
    },
    rebase: (id, entry) => base.rebase(id, entry),
    clearBase: () => base.clear(),
    async markSent(doc) {
      if (store.getState().doc === doc && !dirty) await markPending(false);
    },
    retrySoon() {
      dirty = true;
      retryLater();
    },
    async forgetActive() {
      await repo.setActiveId(null);
      persistedActive = null;
    },
    setStatus,
    isDetached: (id) => detachedId === id,
    isDisposed: () => disposed,
    loadFailed: () => suspended,
    keptLocally: () => !suspended && keptLocally,
    hasUnsentChanges: () => dirty || timer !== null || pendingSync,
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      unsubscribe();
    },
  };
}
