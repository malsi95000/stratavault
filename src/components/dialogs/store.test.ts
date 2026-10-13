import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentDialog,
  dialogs,
  dismissAllDialogs,
  removeDialog,
  REMOVE_FALLBACK_MS,
  useDialogStore,
  whenDialogsClosed,
} from "./store";
import type { AskRequest, ConfirmRequest, PromptRequest } from "./store";

const current = () => currentDialog(useDialogStore.getState());

/** Simule <DialogHost /> : le dialogue fermé signale la fin de sa fermeture. */
const closeCurrent = () => {
  const request = current();
  if (request) removeDialog(request.id);
};

beforeEach(() => useDialogStore.setState({ queue: [] }));
afterEach(() => vi.useRealTimers());

describe("dialogs.confirm", () => {
  it("ajoute une demande et résout true quand l'utilisateur valide", async () => {
    const answer = dialogs.confirm("Supprimer ce lien et ses notes ?", { confirmLabel: "Supprimer", destructive: true });
    const request = current() as ConfirmRequest;
    expect(request).toMatchObject({
      kind: "confirm",
      open: true,
      message: "Supprimer ce lien et ses notes ?",
      options: { confirmLabel: "Supprimer", destructive: true },
    });
    request.settle(true);
    await expect(answer).resolves.toBe(true);
  });

  it("résout false à l'annulation et ignore une seconde réponse", async () => {
    const answer = dialogs.confirm("Quitter ?");
    const request = current() as ConfirmRequest;
    request.settle(false);
    request.settle(true);
    await expect(answer).resolves.toBe(false);
  });
});

describe("dialogs.prompt", () => {
  it("propose la valeur par défaut et renvoie la saisie", async () => {
    const answer = dialogs.prompt("Nom de la carte :", "Carte du 03/10/2026", { maxLength: 120 });
    const request = current() as PromptRequest;
    expect(request).toMatchObject({ kind: "prompt", defaultValue: "Carte du 03/10/2026", options: { maxLength: 120 } });
    request.settle("Sahel");
    await expect(answer).resolves.toBe("Sahel");
  });

  it("renvoie null à l'annulation", async () => {
    const answer = dialogs.prompt("Nom ?");
    (current() as PromptRequest).settle(null);
    await expect(answer).resolves.toBeNull();
  });
});

describe("dialogs.ask", () => {
  const options = { yesLabel: "Enregistrer", noLabel: "Ne pas enregistrer" };

  it("renvoie le choix de l'utilisateur", async () => {
    const answer = dialogs.ask("L’enregistrer ?", options);
    const request = current() as AskRequest;
    expect(request).toMatchObject({ kind: "ask", open: true, message: "L’enregistrer ?", options });
    request.settle("no");
    await expect(answer).resolves.toBe("no");
  });

  it("renvoie null quand la demande est annulée (Échap, changement de page)", async () => {
    const answer = dialogs.ask("L’enregistrer ?", options);
    dismissAllDialogs();
    await expect(answer).resolves.toBeNull();
  });
});

describe("fermeture", () => {
  it("garde la demande, fermée, jusqu'à ce que le dialogue signale la fin de sa fermeture", () => {
    void dialogs.confirm("Supprimer ?");
    const request = current() as ConfirmRequest;
    request.settle(true);
    expect(current()).toMatchObject({ id: request.id, open: false });
    removeDialog(request.id);
    expect(useDialogStore.getState().queue).toEqual([]);
  });

  it("retire quand même la demande après le délai de secours", () => {
    vi.useFakeTimers();
    void dialogs.confirm("Supprimer ?");
    (current() as ConfirmRequest).settle(false);
    expect(useDialogStore.getState().queue).toHaveLength(1);
    vi.advanceTimersByTime(REMOVE_FALLBACK_MS);
    expect(useDialogStore.getState().queue).toEqual([]);
  });
});

describe("file d'attente", () => {
  it("affiche les demandes l'une après l'autre, dans l'ordre", async () => {
    const first = dialogs.confirm("Première ?");
    const second = dialogs.prompt("Seconde ?", "x");
    expect(current()?.message).toBe("Première ?");
    (current() as ConfirmRequest).settle(true);
    expect(current()?.message).toBe("Première ?");
    closeCurrent();
    expect(current()?.message).toBe("Seconde ?");
    (current() as PromptRequest).settle("y");
    closeCurrent();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe("y");
    expect(current()).toBeUndefined();
  });

  it("dismissAllDialogs annule toutes les demandes en attente (changement de page)", async () => {
    const first = dialogs.confirm("Des modifications n’ont pas pu être enregistrées…");
    const second = dialogs.confirm("Des modifications n’ont pas pu être enregistrées…");
    const third = dialogs.prompt("Nom ?", "x");
    dismissAllDialogs();
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    await expect(third).resolves.toBeNull();
    expect(useDialogStore.getState().queue.every((r) => !r.open)).toBe(true);
  });
});

describe("whenDialogsClosed", () => {
  it("se résout aussitôt sans dialogue, sinon quand le dernier dialogue est retiré", async () => {
    await expect(whenDialogsClosed()).resolves.toBeUndefined();
    void dialogs.confirm("A ?");
    void dialogs.confirm("B ?");
    let closed = false;
    void whenDialogsClosed().then(() => (closed = true));
    (current() as ConfirmRequest).settle(true);
    closeCurrent();
    await Promise.resolve();
    expect(closed).toBe(false);
    (current() as ConfirmRequest).settle(false);
    closeCurrent();
    await Promise.resolve();
    expect(closed).toBe(true);
  });
});
