"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { suspendStorage } from "@/features/editor/storageSession";
import { useEditorStore } from "@/features/editor/store";
import { acquireMapLock, getSharedMapState, openSharedMap, releaseMapLock, saveSharedMap } from "../coopActions";
import { INITIAL_COOP_VIEW, createCoopSession, type CoopSession, type CoopView } from "./coopSession";
import { lockBeaconPath } from "./lockBeacon";

/**
 * Session de l'éditeur coopératif pour la carte `mapId`, ouverte par le compte `userId` : la session
 * de l'éditeur du compte (brouillon, banque) est d'abord suspendue, pour que la carte partagée ne s'y
 * mêle jamais ; à la sortie, les modifications restantes sont enregistrées et le verrou libéré
 * (fermeture de l'onglet : libération par sendBeacon, sinon le bail expire seul en deux minutes).
 */
export function useCoopSession(userId: string, mapId: string): { session: CoopSession | null; view: CoopView } {
  const [session, setSession] = useState<CoopSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    const coop = createCoopSession(
      {
        open: () => openSharedMap(userId, mapId),
        state: () => getSharedMapState(userId, mapId),
        acquire: () => acquireMapLock(userId, mapId),
        release: () => releaseMapLock(userId, mapId),
        save: (doc, revision) => saveSharedMap(userId, mapId, doc, revision),
      },
      useEditorStore,
    );
    void (async () => {
      // Une page du compte (retour rapide vers /carte ou /espace) a pu rouvrir la session pendant
      // l'envoi : la carte partagée ne démarre qu'une fois aucune session du compte ouverte.
      while (!(await suspendStorage())) {
        if (cancelled) return;
      }
      if (cancelled) return;
      setSession(coop);
      void coop.start();
    })();

    // Onglet masqué : plus de rafraîchissement en arrière-plan ; de nouveau visible : relu tout de suite.
    const onVisibility = () => coop.setHidden(document.visibilityState === "hidden");
    onVisibility();
    const onActivity = () => coop.touch();
    // Fermeture ou rechargement de l'onglet (ou page mise en cache par le navigateur) : plus rien
    // n'est envoyé, la carte passe en lecture seule et le verrou est libéré.
    const onPageHide = () => {
      const editing = coop.view().editing;
      coop.abandon();
      if (editing) navigator.sendBeacon(lockBeaconPath(mapId), new Blob([userId], { type: "text/plain" }));
    };
    // Retour par le cache du navigateur (bouton Précédent) : la session arrêtée à la sortie ne
    // reprend pas d'elle-même ; la page est rechargée pour en ouvrir une nouvelle.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    // Modifications pas encore enregistrées : le navigateur demande confirmation avant de quitter.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (coop.view().unsaved) event.preventDefault();
    };
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("wheel", onActivity, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("wheel", onActivity);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      void coop.stop();
    };
  }, [userId, mapId]);

  const view = useSyncExternalStore(
    (listener) => session?.subscribe(listener) ?? (() => {}),
    () => session?.view() ?? INITIAL_COOP_VIEW,
    () => INITIAL_COOP_VIEW,
  );
  return { session, view };
}
