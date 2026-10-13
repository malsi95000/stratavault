// File d'attente des dialogues de l'application (remplace window.confirm / window.prompt).
// Les composants appellent `dialogs.confirm(...)`, `dialogs.ask(...)` ou `dialogs.prompt(...)` et attendent la réponse ;
// <DialogHost /> (monté dans le layout racine) affiche la première demande de la file.
//
// Cycle de vie d'une demande :
//   1. ajoutée à la file, `open: true` ;
//   2. l'utilisateur répond → `settle(réponse)` résout la promesse et passe `open: false`
//      (le dialogue joue son animation de sortie, toujours monté) ;
//   3. une fois fermé, le dialogue rend le focus puis appelle `removeDialog(id)` : la demande
//      suivante peut s'afficher. Filet de sécurité : retrait automatique après REMOVE_FALLBACK_MS.
import { create } from "zustand";

export type ConfirmOptions = {
  /** Libellé du bouton de validation (« Confirmer » par défaut). */
  confirmLabel?: string;
  /** Action irréversible : bouton de validation en rouge. */
  destructive?: boolean;
};

export type AskOptions = {
  /** Libellé du bouton « oui » (action principale). */
  yesLabel: string;
  /** Libellé du bouton « non » (continuer sans l'action principale). */
  noLabel: string;
};

/** Réponse à `dialogs.ask` : null si l'utilisateur annule (bouton « Annuler », Échap). */
export type AskAnswer = "yes" | "no" | null;

export type PromptOptions = {
  /** Longueur maximale de la saisie. */
  maxLength?: number;
};

type BaseRequest = {
  id: number;
  message: string;
  /** false dès que la demande a reçu sa réponse (le dialogue se ferme). */
  open: boolean;
  /** Ferme la demande avec la réponse « annuler » (false pour confirm, null pour prompt). */
  cancel: () => void;
};

export type ConfirmRequest = BaseRequest & {
  kind: "confirm";
  options: ConfirmOptions;
  /** Répond à la demande (les appels suivants sont ignorés). */
  settle: (accepted: boolean) => void;
};

export type PromptRequest = BaseRequest & {
  kind: "prompt";
  defaultValue: string;
  options: PromptOptions;
  /** Texte saisi, ou null si l'utilisateur annule (comme window.prompt). */
  settle: (value: string | null) => void;
};

export type AskRequest = BaseRequest & {
  kind: "ask";
  options: AskOptions;
  settle: (answer: AskAnswer) => void;
};

export type DialogRequest = ConfirmRequest | PromptRequest | AskRequest;

type DialogState = { queue: DialogRequest[] };

export const useDialogStore = create<DialogState>(() => ({ queue: [] }));

/** Délai au-delà duquel une demande fermée est retirée même si le dialogue ne l'a pas signalé. */
export const REMOVE_FALLBACK_MS = 1000;

let lastId = 0;

/** Retire une demande de la file (appelé par le dialogue une fois fermé). Sans effet si déjà retirée. */
export function removeDialog(id: number): void {
  useDialogStore.setState((s) =>
    s.queue.some((r) => r.id === id) ? { queue: s.queue.filter((r) => r.id !== id) } : s,
  );
}

/**
 * Se résout quand la file est vide : tous les dialogues sont fermés et ont rendu le focus
 * (au plus REMOVE_FALLBACK_MS après la dernière réponse).
 */
export function whenDialogsClosed(): Promise<void> {
  return new Promise((resolve) => {
    if (useDialogStore.getState().queue.length === 0) return resolve();
    const unsubscribe = useDialogStore.subscribe((s) => {
      if (s.queue.length > 0) return;
      unsubscribe();
      resolve();
    });
  });
}

/** Annule toutes les demandes en cours (changement de page : une réponse n'aurait plus de sens). */
export function dismissAllDialogs(): void {
  for (const request of useDialogStore.getState().queue) request.cancel();
}

type Handlers<T> = { settle: (answer: T) => void; cancel: () => void };

/** Ajoute une demande à la file ; `settle` résout la promesse une seule fois puis ferme la demande. */
function enqueue<T>(cancelAnswer: T, build: (id: number, handlers: Handlers<T>) => DialogRequest): Promise<T> {
  return new Promise<T>((resolve) => {
    const id = ++lastId;
    let settled = false;
    const settle = (answer: T) => {
      if (settled) return;
      settled = true;
      resolve(answer);
      useDialogStore.setState((s) => ({ queue: s.queue.map((r) => (r.id === id ? { ...r, open: false } : r)) }));
      setTimeout(() => removeDialog(id), REMOVE_FALLBACK_MS);
    };
    const request = build(id, { settle, cancel: () => settle(cancelAnswer) });
    useDialogStore.setState((s) => ({ queue: [...s.queue, request] }));
  });
}

export const dialogs = {
  /** Demande une confirmation : true si l'utilisateur valide, false s'il annule (bouton, Échap). */
  confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
    return enqueue<boolean>(false, (id, { settle, cancel }) => ({
      id,
      kind: "confirm",
      message,
      options,
      open: true,
      settle,
      cancel,
    }));
  },

  /**
   * Question à trois réponses (oui, non, annuler), quand « non » ne veut pas dire « abandonner » :
   * par exemple « Enregistrer », « Ne pas enregistrer » ou « Annuler ».
   */
  ask(message: string, options: AskOptions): Promise<AskAnswer> {
    return enqueue<AskAnswer>(null, (id, { settle, cancel }) => ({
      id,
      kind: "ask",
      message,
      options,
      open: true,
      settle,
      cancel,
    }));
  },

  /** Demande un texte : la saisie validée, ou null si l'utilisateur annule. */
  prompt(message: string, defaultValue = "", options: PromptOptions = {}): Promise<string | null> {
    return enqueue<string | null>(null, (id, { settle, cancel }) => ({
      id,
      kind: "prompt",
      message,
      defaultValue,
      options,
      open: true,
      settle,
      cancel,
    }));
  },
};

/** Demande actuellement affichée (la première de la file, éventuellement en cours de fermeture). */
export function currentDialog(state: DialogState): DialogRequest | undefined {
  return state.queue[0];
}
