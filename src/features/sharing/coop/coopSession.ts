// Session de l'éditeur coopératif (une carte partagée ouverte par son propriétaire ou un membre).
//
// Verrou d'édition v1 : un seul éditeur à la fois. Le compte qui tient le verrou modifie la carte ;
// ses modifications partent après un court délai (update_map_data, contrôle de version). Il renouvelle
// son bail (deux minutes) toutes les 40 secondes tant qu'il est actif ; sans activité pendant cinq
// minutes, il rend la main. Les autres (lecteurs, ou éditeurs en attente) voient la carte en lecture
// seule, avec « X modifie cette carte », et la carte est relue toutes les 15 secondes si elle a changé,
// seulement tant que l'onglet est visible (relue dès qu'il le redevient) ; un rafraîchissement refusé
// (limite des lectures, réseau) est signalé, l'avis disparaît au premier qui réussit.
// Un bail échu peut être repris par un autre éditeur (bouton « Modifier la carte »). Tant que personne
// ne l'a repris, l'éditeur dont le bail a expiré (réseau coupé, appareil en veille) le reprend au
// premier enregistrement refusé, sans rien perdre si la carte n'a pas changé entre-temps.
// Le verrou est tenu par un compte, pas par un onglet : si le compte le tient déjà ailleurs (autre
// onglet, autre appareil, éditeur de son espace), la carte s'ouvre en lecture seule, et seul
// « Modifier la carte » reprend la main ici.
//
// Rien n'est enregistré dans ce navigateur : la carte partagée n'est jamais mêlée au brouillon ni à
// la banque du compte.
import { parseMapDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import type { StoreApi } from "zustand/vanilla";
import type { EditorState } from "@/features/editor/store";
import type { CoopResult } from "../coopActions";
import { EDITOR_IDLE_MS, LOCK_RENEW_MS, REFRESH_MS, SHARED_SAVE_DELAY_MS } from "../limits";
import {
  COOP_CONFLICT,
  COOP_DEMOTED,
  COOP_EDITING,
  COOP_FREE,
  COOP_GONE,
  COOP_IDLE,
  COOP_INVALID,
  COOP_LOST,
  COOP_MINE_ELSEWHERE,
  COOP_QUOTA,
  COOP_RATE_LIMITED,
  COOP_READER,
  COOP_REFRESH_FAILED,
  COOP_REFRESH_RATE_LIMITED,
  COOP_SAVED,
  COOP_SAVE_FAILED,
  COOP_SAVING,
  COOP_TOO_LARGE,
  COOP_UNAVAILABLE,
  coopHeldBy,
  ownerLabel,
} from "../messages";
import type { LockResult, LockView, MapRole, SharedMapContent, SharedMapState } from "../types";

/** Server Actions de l'éditeur coopératif, déjà liées au compte et à la carte (injectées pour les tests). */
export type CoopApi = {
  open: () => Promise<CoopResult<SharedMapContent | null>>;
  state: () => Promise<CoopResult<SharedMapState | null>>;
  acquire: () => Promise<CoopResult<LockResult>>;
  release: () => Promise<CoopResult<boolean>>;
  save: (doc: MapDoc, revision: number) => Promise<CoopResult<{ revision: number; updated: string } | null>>;
};

export type CoopPhase = "loading" | "ready" | "gone" | "failed";

/** Ce que l'interface affiche. */
export type CoopView = {
  phase: CoopPhase;
  name: string;
  owner: string;
  role: MapRole | null;
  /** Le compte tient le verrou : il peut modifier la carte. */
  editing: boolean;
  /** Verrou vu par le compte (« other » : quelqu'un d'autre modifie la carte). */
  lock: LockView;
  /** État de la carte pour le compte (vous la modifiez, lecture seule, qui la modifie). */
  message: string;
  /** Avis à garder sous les yeux jusqu'à la prochaine prise de main (inactivité, main reprise, échec). */
  notice: string;
  /** Enregistrement (éditeur) : « Enregistrement… », « Enregistré… », échec. */
  saveStatus: string;
  /** Des modifications ne sont pas encore enregistrées (quitter la page les perdrait). */
  unsaved: boolean;
};

/** Vue avant le chargement de la carte. */
export const INITIAL_COOP_VIEW: CoopView = {
  phase: "loading",
  name: "",
  owner: "",
  role: null,
  editing: false,
  lock: { kind: "free" },
  message: "",
  notice: "",
  saveStatus: "",
  unsaved: false,
};

/** Après un échec passager de l'enregistrement, nouvel essai. */
const SAVE_RETRY_MS = 5_000;

/** Texte de lecture seule selon le rôle et le verrou. */
export function readOnlyMessage(role: MapRole | null, lock: LockView): string {
  if (role === "reader") return lock.kind === "other" ? `${COOP_READER} ${coopHeldBy(lock.holderName)}` : COOP_READER;
  if (lock.kind === "other") return coopHeldBy(lock.holderName);
  // Verrou du compte, pris ailleurs : autre onglet, ou éditeur de son espace (propriétaire).
  if (lock.kind === "mine") return COOP_MINE_ELSEWHERE;
  return COOP_FREE;
}

/** Contenu refusé par le serveur : rien n'est réessayé tant que la carte ne change pas. */
const REFUSED_MESSAGES = { "too-large": COOP_TOO_LARGE, invalid: COOP_INVALID, quota: COOP_QUOTA } as const;

/** Message d'un échec de lecture. */
const failureMessage = (error: string) => (error === "rate-limited" ? COOP_RATE_LIMITED : COOP_UNAVAILABLE);

/** Avis d'un rafraîchissement refusé : la carte affichée n'est peut-être plus à jour. */
const refreshFailureMessage = (error: string) => (error === "rate-limited" ? COOP_REFRESH_RATE_LIMITED : COOP_REFRESH_FAILED);
const REFRESH_NOTICES: readonly string[] = [COOP_REFRESH_RATE_LIMITED, COOP_REFRESH_FAILED];

export type CoopSession = {
  /** Charge la carte, puis prend le verrou si le rôle le permet et que personne ne le tient (pas même le compte, ailleurs). */
  start: () => Promise<void>;
  /** Prend la main (« Modifier la carte »). */
  take: () => Promise<void>;
  /** Rend la main (« Rendre la main ») : enregistre, libère le verrou, repasse en lecture seule. */
  giveBack: () => Promise<void>;
  /** Activité de l'éditeur (clavier, souris) : repousse l'abandon pour inactivité. */
  touch: () => void;
  /** Quitte l'éditeur : enregistre ce qui reste, libère le verrou, arrête tout. */
  stop: () => Promise<void>;
  /** Fermeture de l'onglet : tout s'arrête et la carte passe en lecture seule (le verrou est libéré par sendBeacon). */
  abandon: () => void;
  /**
   * Onglet masqué (`true`) : plus de rafraîchissement en arrière-plan (il userait la limite des
   * lectures pour rien) ; de nouveau visible : la carte est relue tout de suite.
   */
  setHidden: (hidden: boolean) => void;
  view: () => CoopView;
  subscribe: (listener: () => void) => () => void;
};

export function createCoopSession(api: CoopApi, store: StoreApi<EditorState>, now: () => number = Date.now): CoopSession {
  let view: CoopView = INITIAL_COOP_VIEW;
  const listeners = new Set<() => void>();
  let revision = 0;
  let stopped = false;
  let hidden = false;
  let lastActivity = now();
  // Document envoyé en dernier (ou chargé) : une modification est tout ce qui en diffère.
  let savedDoc: MapDoc | null = null;
  let saving: Promise<void> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let renewTimer: ReturnType<typeof setInterval> | undefined;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | null = null;

  const update = (patch: Partial<CoopView>) => {
    view = { ...view, ...patch };
    listeners.forEach((listener) => listener());
  };

  const clearSaveTimer = () => {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = undefined;
  };

  /** Plus de verrou : lecture seule, renouvellement arrêté. */
  function becomeReader(lock: LockView, notice = view.notice) {
    // Session arrêtée : le store sert peut-être déjà à une autre page (éditeur du compte).
    if (stopped) return;
    if (renewTimer !== undefined) clearInterval(renewTimer);
    renewTimer = undefined;
    clearSaveTimer();
    store.getState().setReadOnly(true);
    update({ editing: false, lock, message: readOnlyMessage(view.role, lock), notice, unsaved: false, saveStatus: "" });
  }

  /** Remplace le document par celui de la base (la fiche ouverte reste si son élément existe). */
  function applyRemote(content: SharedMapContent, first: boolean): boolean {
    if (stopped) return false;
    const doc = parseMapDoc(content.data);
    if (!doc) {
      stopTimers();
      store.getState().setReadOnly(true);
      update({ phase: "failed", editing: false, message: COOP_UNAVAILABLE });
      return false;
    }
    revision = content.revision;
    savedDoc = doc;
    if (first) store.getState().hydrate(doc, null);
    else store.getState().loadSharedDoc(doc);
    update({ name: content.name, owner: ownerLabel(content.ownerHandle, content.ownerName), role: content.role });
    return true;
  }

  /** Relit la carte entière ; false si elle n'est plus accessible ou illisible. */
  async function reload(first = false): Promise<boolean> {
    const result = await api.open();
    if (stopped) return false;
    if (!result.ok) {
      if (first) update({ phase: "failed", message: failureMessage(result.error) });
      return false;
    }
    if (!result.value) {
      gone();
      return false;
    }
    return applyRemote(result.value, first);
  }

  function gone() {
    if (stopped) return;
    stopTimers();
    store.getState().setReadOnly(true);
    update({ phase: "gone", editing: false, message: COOP_GONE, notice: "", unsaved: false, saveStatus: "" });
  }

  function stopTimers() {
    clearSaveTimer();
    if (renewTimer !== undefined) clearInterval(renewTimer);
    if (refreshTimer !== undefined) clearInterval(refreshTimer);
    renewTimer = undefined;
    refreshTimer = undefined;
  }

  /**
   * Plus le droit d'écrire pendant l'édition : main reprise par un autre membre (COOP_LOST), compte
   * passé lecteur (COOP_DEMOTED), ou carte modifiée ailleurs entre-temps (COOP_CONFLICT). La carte est relue.
   */
  async function lost(lock: LockView = { kind: "free" }, notice = COOP_LOST) {
    becomeReader(lock, notice);
    await reload();
    void refresh();
  }

  /** Le compte est passé lecteur pendant l'édition. */
  function demoted() {
    update({ role: "reader" });
    return lost({ kind: "free" }, COOP_DEMOTED);
  }

  /**
   * Enregistrement refusé faute de verrou. Souvent, le bail du compte a seulement expiré (réseau
   * coupé, appareil en veille) sans que personne ne le reprenne : il est repris, et l'envoi peut être
   * refait (« retry ») ; la version attendue reste celle du dernier envoi, donc une carte modifiée
   * entre-temps donne un conflit, jamais un écrasement. « done » : la session a déjà réagi (main prise
   * par un autre membre, compte passé lecteur, carte disparue) ; « failed » : échec passager.
   */
  async function relock(): Promise<"retry" | "done" | "failed"> {
    const result = await api.acquire();
    if (!result.ok) return "failed";
    const lock = result.value;
    if (lock.status === "acquired") {
      if (view.editing) update({ lock: { kind: "mine", expiresAt: lock.expiresAt } });
      return "retry";
    }
    if (lock.status === "not-found") gone();
    else if (lock.status === "read-only") await demoted();
    else await lost({ kind: "other", holderName: lock.holderName });
    return "done";
  }

  /** Envoie le document s'il a changé depuis le dernier envoi. */
  function save(): Promise<void> {
    clearSaveTimer();
    if (saving) return saving.then(() => (view.editing && hasChanges() ? save() : undefined));
    if (!view.editing || !hasChanges()) return Promise.resolve();
    const doc = store.getState().doc;
    update({ saveStatus: COOP_SAVING });
    saving = (async () => {
      let result = await api.save(doc, revision);
      if (!result.ok && result.error === "locked") {
        const next = await relock();
        if (next === "done") return;
        // Un second refus après une reprise réussie est traité comme une perte du verrou.
        result = next === "retry" ? await api.save(doc, revision) : { ok: false, error: "unavailable" };
      }
      if (result.ok && result.value) {
        revision = result.value.revision;
        savedDoc = doc;
      }
      if (stopped) return;
      if (result.ok) {
        if (!result.value) return gone();
        update({ saveStatus: hasChanges() ? COOP_SAVING : COOP_SAVED, unsaved: hasChanges() });
        return;
      }
      if (result.error === "locked") return lost();
      if (result.error === "conflict") return lost({ kind: "free" }, COOP_CONFLICT);
      if (result.error === "too-large" || result.error === "invalid" || result.error === "quota") {
        // Rien à réessayer tant que la carte ne change pas : le document reste tel quel dans l'éditeur.
        savedDoc = doc;
        const message = REFUSED_MESSAGES[result.error];
        update({ saveStatus: message, notice: message, unsaved: false });
        return;
      }
      update({ saveStatus: COOP_SAVE_FAILED });
      if (!stopped) saveTimer = setTimeout(() => void save(), SAVE_RETRY_MS);
    })().finally(() => {
      saving = null;
    });
    return saving;
  }

  const hasChanges = () => savedDoc !== null && store.getState().doc !== savedDoc;

  /** Après une modification du document par l'éditeur : envoi différé. */
  function onDocChange() {
    if (!view.editing || !hasChanges()) return;
    lastActivity = now();
    update({ unsaved: true });
    clearSaveTimer();
    saveTimer = setTimeout(() => void save(), SHARED_SAVE_DELAY_MS);
  }

  /** Résultat d'une prise ou d'un renouvellement du verrou. */
  async function onLock(result: CoopResult<LockResult>, renewing: boolean): Promise<void> {
    if (stopped) return;
    if (!result.ok) {
      // Passager : le bail court encore deux minutes, le prochain renouvellement réessaiera.
      if (!renewing) update({ notice: failureMessage(result.error) });
      return;
    }
    const lock = result.value;
    if (lock.status === "not-found") return gone();
    if (lock.status === "read-only") {
      if (renewing) return demoted();
      update({ role: "reader" });
      return becomeReader({ kind: "free" });
    }
    if (lock.status === "held") {
      const other: LockView = { kind: "other", holderName: lock.holderName };
      return renewing ? lost(other) : becomeReader(other);
    }
    if (renewing) return;
    // Nouvelle prise : la carte a pu changer depuis la dernière lecture.
    const state = await api.state();
    if (stopped) return;
    if (state.ok && state.value && state.value.revision !== revision && !(await reload())) return;
    lastActivity = now();
    store.getState().setReadOnly(false);
    update({ editing: true, lock: { kind: "mine", expiresAt: lock.expiresAt }, message: COOP_EDITING, notice: "", saveStatus: "" });
    if (renewTimer !== undefined) clearInterval(renewTimer);
    renewTimer = setInterval(() => void renew(), LOCK_RENEW_MS);
  }

  async function renew() {
    if (!view.editing || stopped) return;
    if (now() - lastActivity >= EDITOR_IDLE_MS) {
      await giveBack(COOP_IDLE);
      return;
    }
    await onLock(await api.acquire(), true);
  }

  /**
   * Rafraîchissement périodique (hors édition, onglet visible) : version et verrou. Un refus (limite
   * des lectures, réseau) est signalé, sans arrêter les essais suivants ; l'avis part au premier
   * rafraîchissement réussi.
   */
  async function refresh() {
    if (stopped || hidden || view.editing || view.phase !== "ready") return;
    const result = await api.state();
    if (stopped || view.editing) return;
    if (!result.ok) {
      update({ notice: refreshFailureMessage(result.error) });
      return;
    }
    if (!result.value) return gone();
    const state = result.value;
    if (state.revision !== revision && !(await reload())) return;
    const notice = REFRESH_NOTICES.includes(view.notice) ? "" : view.notice;
    update({ role: state.role, name: state.name, lock: state.lock, message: readOnlyMessage(state.role, state.lock), notice });
  }

  async function take() {
    if (stopped || view.editing || view.role === "reader" || view.phase !== "ready") return;
    await onLock(await api.acquire(), false);
  }

  async function giveBack(notice = "") {
    if (!view.editing) return;
    await save();
    becomeReader({ kind: "free" }, notice);
    await api.release();
    void refresh();
  }

  return {
    async start() {
      store.getState().setReadOnly(true);
      if (!(await reload(true))) return;
      update({ phase: "ready", message: readOnlyMessage(view.role, { kind: "free" }) });
      unsubscribe = store.subscribe((state, previous) => {
        if (state.doc !== previous.doc) onDocChange();
      });
      refreshTimer = setInterval(() => void refresh(), REFRESH_MS);
      // État du verrou d'abord : le compte qui le tient déjà ailleurs ne le prend pas ici sans le
      // demander (deux pages du même compte écriraient en même temps).
      await refresh();
      if (view.role !== "reader" && view.lock.kind === "free") await take();
    },
    take,
    giveBack: () => giveBack(),
    touch() {
      lastActivity = now();
    },
    async stop() {
      if (stopped) return;
      // Tout de suite : plus aucune réaction aux changements du store, qui peut servir aussitôt à la
      // page suivante (éditeur du compte, banque) ; le document à enregistrer est celui de cet instant.
      stopped = true;
      stopTimers();
      unsubscribe?.();
      const doc = store.getState().doc;
      // Le store sert aussitôt à la page suivante (éditeur du compte) : il n'y reste pas en lecture seule.
      store.getState().setReadOnly(false);
      if (!view.editing) return;
      if (saving) await saving;
      if (doc !== savedDoc) await api.save(doc, revision);
      await api.release();
    },
    abandon() {
      stopped = true;
      stopTimers();
      unsubscribe?.();
      // Plus rien n'est enregistré : la carte ne doit plus sembler modifiable (page gardée en cache).
      store.getState().setReadOnly(true);
      if (view.editing) update({ editing: false, unsaved: false, saveStatus: "" });
    },
    setHidden(value) {
      const shown = hidden && !value;
      hidden = value;
      if (shown) void refresh();
    },
    view: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
