// Session de la carte collective : la carte commune est affichée dans l'éditeur habituel, chacun y
// ajoute ses éléments et ne modifie que les siens (règles posées dans l'éditeur : rules.ts). Un compte
// sans profil, ou dont les contributions sont suspendues, peut seulement supprimer ses éléments.
//
// Ce que la base connaît est gardé ici (`base` : dernier état lu ou envoyé de chaque élément). Après
// chaque modification, et un court délai, les différences des éléments du compte sont envoyées une à
// une (ajouts, modifications, suppressions). Un envoi refusé (limite, contenu, élément masqué entre-
// temps) remet l'élément tel que la base le connaît, avec un avis ; une panne passagère est réessayée.
// La carte est relue toutes les 30 secondes si elle a changé, quand il ne reste rien à envoyer. Les
// écritures du compte ne la font pas relire : chacune renvoie la version de la carte avant et après
// elle ; si la version d'avant est celle que la session connaît, personne d'autre n'a rien changé, et
// la session adopte la version d'après (les lectures complètes comptent dans une limite horaire).
//
// Rien n'est enregistré dans ce navigateur : la carte collective n'est jamais mêlée au brouillon ni à
// la banque du compte.
import type { StoreApi } from "zustand/vanilla";
import type { EditorState } from "@/features/editor/store";
import type { EntityKind } from "@/features/map-doc/types";
import { composeDoc, entityKey, itemKey, withElement } from "../compose";
import { planIsEmpty, planSync, type BaseEntry, type SyncPlan } from "../diff";
import { contentJson } from "../itemData";
import { REFRESH_MS, SYNC_DELAY_MS, SYNC_RETRY_MS } from "../limits";
import {
  COLLECTIVE_RATE_LIMITED,
  COLLECTIVE_READ_ONLY_NO_PROFILE,
  COLLECTIVE_SAVED,
  COLLECTIVE_SAVE_RETRY,
  COLLECTIVE_SAVING,
  COLLECTIVE_SESSION_ENDED,
  COLLECTIVE_UNAVAILABLE,
  REFUSED_CREATE,
  REFUSED_DELETE_RATE_LIMITED,
  REFUSED_UPDATE,
  collectiveReadOnlySuspended,
} from "../messages";
import { collectiveEditRules } from "../rules";
import type { CollectiveError, CollectiveResult } from "../syncActions";
import type { CollectiveItem, CollectiveState, CreateResult, DeleteResult, ItemContent, RevisionStep, UpdateResult } from "../types";

/** Server Actions de la session, déjà liées au compte (injectées pour les tests). */
export type CollectiveApi = {
  state: () => Promise<CollectiveResult<CollectiveState>>;
  load: () => Promise<CollectiveResult<CollectiveItem[]>>;
  create: (content: ItemContent) => Promise<CollectiveResult<CreateResult>>;
  update: (content: ItemContent) => Promise<CollectiveResult<UpdateResult>>;
  remove: (id: string) => Promise<CollectiveResult<DeleteResult>>;
};

/** Ce que l'interface affiche. */
export type CollectiveView = {
  phase: "loading" | "ready" | "failed";
  /** Lecture impossible, session expirée ; ou raison de la lecture seule. */
  message: string;
  /** Publication : « Publication… », « Vos ajouts sont publiés. », nouvel essai. */
  status: string;
  /** Dernier envoi refusé (gardé sous les yeux jusqu'au suivant). */
  notice: string;
  /**
   * Le compte a un profil et n'est pas suspendu : il peut ajouter et modifier ses éléments. Sinon, il
   * peut seulement supprimer les siens (règles « suppression seulement »).
   */
  canContribute: boolean;
  /** Contributions suspendues par la modération (suppression seulement, sans lien « Créer mon profil »). */
  suspended: boolean;
  isModerator: boolean;
  unreadNotices: number;
  /** Des modifications ne sont pas encore publiées (quitter la page les perdrait). */
  unsaved: boolean;
  /** Incrémenté à chaque changement de ce que la base connaît (auteurs affichés dans les fiches). */
  version: number;
};

export const INITIAL_COLLECTIVE_VIEW: CollectiveView = {
  phase: "loading",
  message: "",
  status: "",
  notice: "",
  canContribute: false,
  suspended: false,
  isModerator: false,
  unreadNotices: 0,
  unsaved: false,
  version: 0,
};

/** Auteur d'un élément de la carte, pour sa fiche. */
export type Authorship = {
  mine: boolean;
  authorName: string | null;
  /** Identifiant public de l'auteur (unique : distingue deux auteurs du même nom). */
  authorHandle: string | null;
  /** Date d'ajout ; null pour un ajout pas encore publié. */
  createdAt: string | null;
};

export type CollectiveSession = {
  /** Charge la carte, pose les règles d'édition et démarre le rafraîchissement. */
  start: () => Promise<void>;
  /** Quitte la carte : envoie ce qui reste, retire les règles, arrête tout. */
  stop: () => Promise<void>;
  /** Fermeture de l'onglet : tout s'arrête, la carte passe en lecture seule. */
  abandon: () => void;
  /** Auteur de l'élément désigné ; null pour un pays ou un élément absent. */
  authorship: (k: EntityKind, id: string) => Authorship | null;
  /** Nombre d'avis non lus (après leur lecture). */
  setUnreadNotices: (count: number) => void;
  /**
   * Fait relire la carte au plus tôt (après un blocage : les éléments de l'auteur bloqué ne sont plus
   * montrés, sans que la version de la carte change).
   */
  reload: () => void;
  view: () => CollectiveView;
  subscribe: (listener: () => void) => () => void;
};

/** Ce qu'un envoi a donné : « done » (rien de plus à faire), « retry » (panne passagère), « stopped ». */
type Outcome = "done" | "retry" | "stopped";

/** Message d'un envoi refusé (limite, profil manquant, contenu refusé). */
const refusal = (messages: { "rate-limited": string; "no-profile": string; invalid: string }, error: CollectiveError) =>
  error === "rate-limited" || error === "no-profile" ? messages[error] : messages.invalid;

type Author = { mine: boolean; authorName: string | null; authorHandle: string | null };

const entryOf = (content: ItemContent, author: Author, createdAt: string): BaseEntry => ({
  content,
  json: contentJson(content),
  ...author,
  createdAt,
});

/** Ce qui autorise à contribuer : un profil, et aucune suspension en cours (`suspendedUntil` : sa fin). */
type Contribution = { hasProfile: boolean; suspended: boolean; suspendedUntil: string | null };

/** Contribution d'après l'état lu dans la base. */
const contributionOf = (state: CollectiveState): Contribution => ({
  hasProfile: state.hasProfile,
  suspended: state.suspendedUntil !== null,
  suspendedUntil: state.suspendedUntil,
});

export function createCollectiveSession(api: CollectiveApi, store: StoreApi<EditorState>): CollectiveSession {
  let view: CollectiveView = INITIAL_COLLECTIVE_VIEW;
  const listeners = new Set<() => void>();
  let base = new Map<string, BaseEntry>();
  let revision = -1;
  let stopped = false;
  let syncing: Promise<void> | null = null;
  let again = false;
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | null = null;
  /** Profil et suspension, d'après le dernier état lu (ou le dernier envoi refusé). */
  let contribution: Contribution = { hasProfile: false, suspended: false, suspendedUntil: null };

  const update = (patch: Partial<CollectiveView>) => {
    view = { ...view, ...patch };
    listeners.forEach((listener) => listener());
  };
  const touched = () => update({ version: view.version + 1 });

  const ownership = { isForeign: (key: string) => base.get(key)?.mine === false };

  function clearSyncTimer() {
    if (syncTimer !== undefined) clearTimeout(syncTimer);
    syncTimer = undefined;
  }

  function stopTimers() {
    clearSyncTimer();
    if (refreshTimer !== undefined) clearInterval(refreshTimer);
    refreshTimer = undefined;
  }

  function fail(message: string) {
    if (stopped) return;
    stopTimers();
    store.getState().setReadOnly(true);
    update({ phase: "failed", message, unsaved: false, status: "" });
  }

  const failureMessage = (error: CollectiveError) =>
    error === "unauthorized" ? COLLECTIVE_SESSION_ENDED : error === "rate-limited" ? COLLECTIVE_RATE_LIMITED : COLLECTIVE_UNAVAILABLE;

  /** Remplace la carte par celle de la base (la fiche ouverte reste si son élément existe). */
  function apply(items: readonly CollectiveItem[], first: boolean) {
    const doc = composeDoc(items);
    // Un lien omis (extrémité masquée ou absente) n'est pas connu ici : il ne serait sinon jamais
    // affiché et passerait pour supprimé.
    const shownLinks = new Set(doc.links.map((l) => l.id));
    base = new Map();
    for (const item of items) {
      if (item.kind === "link" && !shownLinks.has(item.id)) continue;
      const content = { kind: item.kind, id: item.id, data: item.data } as ItemContent;
      const author = { mine: item.mine, authorName: item.authorName, authorHandle: item.authorHandle };
      base.set(itemKey(item.kind, item.id), entryOf(content, author, item.createdAt));
    }
    if (first) store.getState().hydrate(doc, null);
    else store.getState().loadSharedDoc(doc);
    touched();
  }

  function setContribution({ hasProfile, suspended: suspension, suspendedUntil }: Contribution) {
    if (stopped) return;
    const suspended = hasProfile && suspension;
    const canContribute = hasProfile && !suspended;
    // Sans contribution, le compte peut encore supprimer ses éléments : règles « suppression seulement »
    // (ni lecture seule, ni outils de dessin).
    store.getState().setEditRules(collectiveEditRules(ownership, !canContribute));
    store.getState().setReadOnly(false);
    const message = canContribute ? "" : suspended ? collectiveReadOnlySuspended(suspendedUntil) : COLLECTIVE_READ_ONLY_NO_PROFILE;
    contribution = { hasProfile, suspended: suspension, suspendedUntil };
    update({ canContribute, suspended, message });
  }

  /** Envoi refusé pour suspension : suppression seulement (la date de fin viendra du prochain état lu). */
  function onSuspended(key: string, refused: string) {
    if (stopped) return;
    if (!contribution.suspended) setContribution({ hasProfile: true, suspended: true, suspendedUntil: null });
    revert(key, refused);
  }

  /** Remet l'élément `key` tel que la base le connaît (ou le retire), avec un avis. */
  function revert(key: string, notice: string) {
    if (stopped) return;
    const doc = store.getState().doc;
    const next = withElement(doc, key, base.get(key)?.content ?? null);
    if (next !== doc) store.getState().loadSharedDoc(next);
    update({ notice });
  }

  /** Après une lecture de l'état : profil créé ou supprimé, suspension prononcée, échue ou levée. */
  function syncContribution(next: Contribution) {
    const same =
      next.hasProfile === contribution.hasProfile &&
      next.suspended === contribution.suspended &&
      next.suspendedUntil === contribution.suspendedUntil;
    if (!same) setContribution(next);
  }

  const hasPending = () => syncTimer !== undefined || !planIsEmpty(planSync(base, store.getState().doc));

  /** Erreur d'un envoi : « retry » pour une panne passagère, sinon l'élément est remis (`refused`). */
  function onError(error: CollectiveError, key: string, refused: string, final: boolean): Outcome | null {
    if (error === "unavailable") return "retry";
    if (error === "unauthorized") {
      if (!final) fail(COLLECTIVE_SESSION_ENDED);
      return "stopped";
    }
    if (final) return null;
    if (error === "no-profile") setContribution({ ...contribution, hasProfile: false });
    revert(key, refused);
    return null;
  }

  /** Écriture du compte acceptée ou refusée sous le verrou : version suivie si rien d'autre n'a changé. */
  function follow(step: RevisionStep | null) {
    if (step && step.from === revision) revision = step.to;
  }

  /** Envoie le plan, élément par élément. `final` : sortie de la page, rien n'est plus montré. */
  async function runPlan(plan: SyncPlan, final: boolean): Promise<Outcome> {
    for (const content of plan.creates) {
      const key = itemKey(content.kind, content.id);
      const result = await api.create(content);
      if (stopped && !final) return "stopped";
      if (!result.ok) {
        const outcome = onError(result.error, key, refusal(REFUSED_CREATE, result.error), final);
        if (outcome) return outcome;
        continue;
      }
      const { status, authorName, createdAt, step } = result.value;
      follow(step);
      if (status === "created") {
        base.set(key, entryOf(content, { mine: true, authorName, authorHandle: null }, createdAt ?? new Date().toISOString()));
      } else if (status === "suspended") {
        if (!final) onSuspended(key, REFUSED_CREATE.suspended);
      } else if (!final) {
        revert(key, REFUSED_CREATE[status]);
      }
    }
    for (const content of plan.updates) {
      const key = itemKey(content.kind, content.id);
      const result = await api.update(content);
      if (stopped && !final) return "stopped";
      if (!result.ok) {
        const outcome = onError(result.error, key, refusal(REFUSED_UPDATE, result.error), final);
        if (outcome) return outcome;
        continue;
      }
      const { status, step } = result.value;
      follow(step);
      const known = base.get(key);
      if (status === "updated" || status === "unchanged") {
        if (known) base.set(key, { ...known, content, json: contentJson(content) });
      } else if (status === "not-found") {
        // Masqué par la modération ou supprimé : il disparaît de la carte.
        base.delete(key);
        if (!final) revert(key, REFUSED_UPDATE["not-found"]);
      } else if (status === "suspended") {
        if (!final) onSuspended(key, REFUSED_UPDATE.suspended);
      } else if (!final) {
        revert(key, REFUSED_UPDATE[status]);
      }
    }
    for (const content of plan.deletes) {
      const key = itemKey(content.kind, content.id);
      const result = await api.remove(content.id);
      if (stopped && !final) return "stopped";
      if (!result.ok) {
        const outcome = onError(result.error, key, REFUSED_DELETE_RATE_LIMITED, final);
        if (outcome) return outcome;
        continue;
      }
      follow(result.value.step);
      base.delete(key);
    }
    return "done";
  }

  /** Envoie ce qui a changé depuis le dernier envoi (un seul envoi à la fois). */
  function sync(): Promise<void> {
    clearSyncTimer();
    if (syncing) {
      again = true;
      return syncing;
    }
    // Sans contribution, les règles n'acceptent que des suppressions : le plan n'a qu'elles (un ajout
    // resté d'avant une suspension est refusé par la base et remis).
    if (stopped || view.phase !== "ready") return Promise.resolve();
    const plan = planSync(base, store.getState().doc);
    if (planIsEmpty(plan)) {
      update({ unsaved: false });
      return Promise.resolve();
    }
    update({ status: COLLECTIVE_SAVING, unsaved: true });
    syncing = (async () => {
      const outcome = await runPlan(plan, false);
      touched();
      if (outcome === "stopped" || stopped) return;
      if (outcome === "retry") {
        update({ status: COLLECTIVE_SAVE_RETRY });
        syncTimer = setTimeout(() => void sync(), SYNC_RETRY_MS);
        return;
      }
      const pending = !planIsEmpty(planSync(base, store.getState().doc));
      update({ status: pending ? COLLECTIVE_SAVING : COLLECTIVE_SAVED, unsaved: pending });
      if (pending) again = true;
    })().finally(() => {
      syncing = null;
      if (again && !stopped) {
        again = false;
        syncTimer = setTimeout(() => void sync(), SYNC_DELAY_MS);
      }
    });
    return syncing;
  }

  /** Après une modification du document par l'éditeur : envoi différé. */
  function onDocChange() {
    if (stopped || view.phase !== "ready") return;
    update({ unsaved: true });
    clearSyncTimer();
    syncTimer = setTimeout(() => void sync(), SYNC_DELAY_MS);
  }

  /** Rafraîchissement périodique : état du compte, et carte relue si elle a changé (rien à envoyer). */
  async function refresh() {
    if (stopped || view.phase !== "ready" || syncing || hasPending()) return;
    const state = await api.state();
    if (stopped || !state.ok) return;
    update({ unreadNotices: state.value.unreadNotices, isModerator: state.value.isModerator });
    syncContribution(contributionOf(state.value));
    if (state.value.revision === revision) return;
    const before = store.getState().doc;
    const items = await api.load();
    // Modifiée entre-temps : la carte sera relue au prochain passage, une fois tout envoyé.
    if (stopped || !items.ok || syncing || store.getState().doc !== before || hasPending()) return;
    apply(items.value, false);
    revision = state.value.revision;
  }

  return {
    async start() {
      store.getState().setReadOnly(true);
      const state = await api.state();
      if (stopped) return;
      if (!state.ok) return fail(failureMessage(state.error));
      const items = await api.load();
      if (stopped) return;
      if (!items.ok) return fail(failureMessage(items.error));
      apply(items.value, true);
      revision = state.value.revision;
      update({ phase: "ready", isModerator: state.value.isModerator, unreadNotices: state.value.unreadNotices });
      // Règles d'édition (complètes, ou suppression seulement) et fin de la lecture seule.
      setContribution(contributionOf(state.value));
      unsubscribe = store.subscribe((next, previous) => {
        if (next.doc !== previous.doc) onDocChange();
      });
      refreshTimer = setInterval(() => void refresh(), REFRESH_MS);
    },
    async stop() {
      if (stopped) return;
      // Tout de suite : plus aucune réaction aux changements du store, qui peut servir aussitôt à la
      // page suivante ; le document à envoyer est celui de cet instant.
      const doc = store.getState().doc;
      const ready = view.phase === "ready";
      stopped = true;
      stopTimers();
      unsubscribe?.();
      // Le store sert aussitôt à la page suivante (éditeur du compte) : ni règles ni lecture seule.
      store.getState().setEditRules(null);
      store.getState().setReadOnly(false);
      if (syncing) await syncing;
      if (!ready) return;
      const plan = planSync(base, doc);
      if (!planIsEmpty(plan)) await runPlan(plan, true);
    },
    abandon() {
      stopped = true;
      stopTimers();
      unsubscribe?.();
      store.getState().setReadOnly(true);
      update({ unsaved: false, status: "" });
    },
    authorship(k, id) {
      const key = entityKey(k, id);
      if (!key) return null;
      const entry = base.get(key);
      if (entry) return { mine: entry.mine, authorName: entry.authorName, authorHandle: entry.authorHandle, createdAt: entry.createdAt };
      // Ajout du compte pas encore publié.
      return { mine: true, authorName: null, authorHandle: null, createdAt: null };
    },
    setUnreadNotices(count) {
      update({ unreadNotices: count });
    },
    reload() {
      revision = -1;
      void refresh();
    },
    view: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
