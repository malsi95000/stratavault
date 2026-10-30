"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { suspendStorage } from "@/features/editor/storageSession";
import { useEditorStore } from "@/features/editor/store";
import { createCollectiveItem, deleteCollectiveItem, getCollectiveState, loadCollectiveMap, updateCollectiveItem } from "../syncActions";
import { INITIAL_COLLECTIVE_VIEW, createCollectiveSession, type CollectiveSession, type CollectiveView } from "./collectiveSession";

/**
 * Session de la carte collective pour le compte `userId` : la session de l'éditeur du compte
 * (brouillon, banque) est d'abord suspendue, pour que la carte collective ne s'y mêle jamais ; à la
 * sortie, les modifications restantes sont envoyées. Fermeture de l'onglet : plus rien n'est envoyé
 * (le navigateur demande d'abord confirmation s'il reste des modifications).
 */
export function useCollectiveSession(userId: string): { session: CollectiveSession | null; view: CollectiveView } {
  const [session, setSession] = useState<CollectiveSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    const collective = createCollectiveSession(
      {
        state: () => getCollectiveState(userId),
        load: () => loadCollectiveMap(userId),
        create: (content) => createCollectiveItem(userId, content.kind, content.id, content.data),
        update: (content) => updateCollectiveItem(userId, content.kind, content.id, content.data),
        remove: (id) => deleteCollectiveItem(userId, id),
      },
      useEditorStore,
    );
    void (async () => {
      // Une page du compte (retour rapide vers /carte ou /espace) a pu rouvrir la session pendant
      // l'envoi : la carte collective ne démarre qu'une fois aucune session du compte ouverte.
      while (!(await suspendStorage())) {
        if (cancelled) return;
      }
      if (cancelled) return;
      setSession(collective);
      void collective.start();
    })();

    const onPageHide = () => collective.abandon();
    // Retour par le cache du navigateur (bouton Précédent) : la page est rechargée pour une nouvelle session.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (collective.view().unsaved) event.preventDefault();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void collective.stop();
    };
  }, [userId]);

  const view = useSyncExternalStore(
    (listener) => session?.subscribe(listener) ?? (() => {}),
    () => session?.view() ?? INITIAL_COLLECTIVE_VIEW,
    () => INITIAL_COLLECTIVE_VIEW,
  );
  return { session, view };
}
