"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EDITOR_TABS_CHANNEL, otherTabWarning, watchOtherTabs } from "@/features/editor/otherTabs";
import { flush, getPersistence } from "@/features/editor/storageSession";
import { useEditorStore } from "@/features/editor/store";
import { isInDialog, isTyping, shortcutFor } from "@/features/editor/tools";
import { loadWorld, loadedWorld } from "@/features/editor/world";
import { storageKey, storageModeOf } from "@/features/storage";
import type { Account } from "@/features/storage";
import type { World } from "@/features/editor/world";
import BottomBar from "./BottomBar";
import MapCanvas from "./MapCanvas";
import Panel from "./Panel";
import Toolbar from "./Toolbar";
import TopBar from "./TopBar";

/**
 * Éditeur plein écran : carte, barre du haut, barre d'aide et panneau des fiches.
 * À rendre sous StorageScope (dépôt de la session : démo ou compte).
 */
export default function Editor({ account }: { account: Account | null }) {
  const hydrated = useEditorStore((s) => s.hydrated);
  const [world, setWorld] = useState<World | null>(loadedWorld);
  const [loadFailed, setLoadFailed] = useState(false);

  // Entrée dans l'éditeur (bêta, enterEditor → setTool('select')) : outil Sélection, sans lien ni tracé en cours.
  // Puis chargement de la carte enregistrée ; la sauvegarde automatique suit chaque modification.
  useEffect(() => {
    useEditorStore.getState().setTool("select");
    void getPersistence().hydrate();
    const onPageHide = () => void flush();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      void flush();
    };
  }, []);

  // Autre onglet de l'éditeur sur la même base locale : ils s'écraseraient (démo) ou partagent la
  // copie de ce navigateur (compte), on prévient.
  const mode = storageModeOf(account);
  const storage = storageKey(mode);
  const warning = otherTabWarning(mode.kind === "account");
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(EDITOR_TABS_CHANNEL);
    const stop = watchOtherTabs(channel, storage, () =>
      toast.warning(warning, { id: EDITOR_TABS_CHANNEL, duration: 15_000 }),
    );
    return () => {
      stop();
      channel.close();
    };
  }, [storage, warning]);

  useEffect(() => {
    if (loadedWorld()) return;
    const controller = new AbortController();
    loadWorld(controller.signal).then(setWorld, () => {
      if (!controller.signal.aborted) setLoadFailed(true);
    });
    return () => controller.abort();
  }, []);

  // Raccourcis V L P O Z T G F ; Échap annule le lien en cours, remet l'aide et ferme la fiche.
  // Ignorés pendant la saisie dans un champ, avec Ctrl, Meta ou Alt, et quand un dialogue est ouvert
  // (Échap y est déjà traité : il ferme le dialogue, pas la fiche).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isInDialog(e.target)) return;
      const action = shortcutFor(e, isTyping(e.target));
      if (!action) return;
      const state = useEditorStore.getState();
      if (action.type === "cancel") state.cancel();
      else state.setTool(action.tool);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const ready = hydrated && world !== null;

  // overflow-clip et non overflow-hidden : un conteneur « hidden » reste défilable par le navigateur
  // (focus d'un élément hors écran, panneau fermé, barre du haut trop large sur mobile), ce qui
  // décalait durablement toute la carte.
  return (
    <div className="fixed inset-0 overflow-clip bg-bg">
      <MapCanvas world={ready ? world : null} />
      <TopBar account={account} />
      <Toolbar />
      {!ready && (
        <p role="status" className="pointer-events-none absolute top-1/2 left-1/2 m-0 -translate-1/2 text-mute">
          {loadFailed ? "Impossible de charger le fond de carte. Rechargez la page." : "Chargement de la carte…"}
        </p>
      )}
      <BottomBar />
      <Panel />
    </div>
  );
}
