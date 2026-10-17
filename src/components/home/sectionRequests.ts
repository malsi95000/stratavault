// Ouverture d'un onglet de l'accueil demandée de l'extérieur (ACC-04) : par le menu fixe, ou par
// l'adresse (/#projection), au chargement comme après un changement d'ancre. Sans React, pour être
// testé tel quel.

import { OPEN_SECTION_EVENT, sectionFromHash, type HomeSectionId } from "./homeNav";

/** Ce que la fonction utilise de `window` (remplaçable dans les tests). */
export type SectionWindow = {
  location: { hash: string };
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(handle: number): void;
};

/**
 * Appelle `onRequest` pour chaque onglet demandé : celui de l'ancre au chargement (une image plus
 * tard, après l'hydratation), puis à chaque changement d'ancre et à chaque choix dans le menu. Les
 * ancres et les détails qui ne désignent pas un onglet sont ignorés. Renvoie la fonction de nettoyage.
 */
export function watchSectionRequests(win: SectionWindow, onRequest: (id: HomeSectionId) => void): () => void {
  const fromHash = () => {
    const id = sectionFromHash(win.location.hash);
    if (id) onRequest(id);
  };
  const fromMenu = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    const id = typeof detail === "string" ? sectionFromHash(detail) : null;
    if (id) onRequest(id);
  };
  const frame = win.requestAnimationFrame(fromHash);
  win.addEventListener("hashchange", fromHash);
  win.addEventListener(OPEN_SECTION_EVENT, fromMenu);
  return () => {
    win.cancelAnimationFrame(frame);
    win.removeEventListener("hashchange", fromHash);
    win.removeEventListener(OPEN_SECTION_EVENT, fromMenu);
  };
}

/** Au-delà, on n'attend plus la fin du dépliement (transition de 250 ms, ou aucune). */
export const PANEL_OPEN_FALLBACK_MS = 400;

/**
 * Appelle `done` une fois l'onglet déplié : à la fin de sa transition de hauteur, ou au plus tard
 * après `fallbackMs` (onglet déjà ouvert, transition interrompue). Sans animation, tout de suite.
 * Le navigateur calcule la position d'une ancre au clic, quand l'onglet est encore fermé et la page
 * parfois trop courte pour l'atteindre : il faut donc recaler la page une fois l'onglet ouvert.
 * Renvoie la fonction d'annulation.
 */
export function whenPanelOpened(
  panel: EventTarget,
  animated: boolean,
  done: () => void,
  fallbackMs = PANEL_OPEN_FALLBACK_MS,
): () => void {
  if (!animated) {
    done();
    return () => {};
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancel();
    done();
  };
  const onEnd = (event: Event) => {
    if (event.target === panel && (event as TransitionEvent).propertyName === "max-height") finish();
  };
  const timer = setTimeout(finish, fallbackMs);
  function cancel() {
    finished = true;
    clearTimeout(timer);
    panel.removeEventListener("transitionend", onEnd);
  }
  panel.addEventListener("transitionend", onEnd);
  return cancel;
}
