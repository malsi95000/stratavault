"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { EDITOR_TABS_CHANNEL, otherTabWarning, watchOtherTabs } from "@/features/editor/otherTabs";
import { MAP_SHARED_OPENING } from "@/features/editor/saveStatus";
import { flush, getPersistence } from "@/features/editor/storageSession";
import { useEditorStore } from "@/features/editor/store";
import { storageKey, storageModeOf } from "@/features/storage";
import type { Account } from "@/features/storage";
import { coopRedirectFor } from "@/features/sharing/paths";
import EditorFrame from "./EditorFrame";
import TopBar from "./TopBar";

/**
 * Éditeur plein écran : carte, barre du haut, barre d'aide et panneau des fiches.
 * À rendre sous StorageScope (dépôt de la session : démo ou compte). `sharedMapIds` (mode compte) :
 * cartes du compte qui ont des membres ; si la carte active en est une, elle s'ouvre dans l'éditeur
 * coopératif (verrou d'édition, lecture seule pendant qu'un membre la modifie) au lieu d'ici.
 */
export default function Editor({ account, sharedMapIds = [] }: { account: Account | null; sharedMapIds?: readonly string[] }) {
  const router = useRouter();
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

  // Carte active qui a des membres : l'éditeur habituel ne respecte pas le verrou d'édition (la base
  // refuserait l'écriture pendant le bail d'un membre) ; elle passe en lecture seule et s'ouvre dans
  // l'éditeur coopératif. Les modifications pas encore envoyées partent à la sortie (flush).
  const sharedKey = sharedMapIds.join(",");
  useEffect(() => {
    if (sharedKey === "") return;
    let cancelled = false;
    let leaving = false;
    void getPersistence()
      .hydrate()
      .then(() => {
        const state = useEditorStore.getState();
        const target = coopRedirectFor(state.activeMapId, sharedKey.split(","));
        if (cancelled || !target) return;
        leaving = true;
        state.setReadOnly(true);
        state.setSaveStatus(MAP_SHARED_OPENING);
        router.replace(target);
      });
    return () => {
      cancelled = true;
      // Le store sert aussitôt à la page suivante : il n'y reste pas en lecture seule (l'éditeur
      // coopératif pose la sienne lui-même).
      if (leaving) useEditorStore.getState().setReadOnly(false);
    };
  }, [router, sharedKey]);

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

  return <EditorFrame topBar={<TopBar account={account} />} />;
}
