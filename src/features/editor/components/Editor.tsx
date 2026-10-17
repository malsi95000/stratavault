"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EDITOR_TABS_CHANNEL, otherTabWarning, watchOtherTabs } from "@/features/editor/otherTabs";
import { editorShortcut } from "@/features/editor/panelFocus";
import { flush, getPersistence } from "@/features/editor/storageSession";
import { isExpanded, useEditorStore } from "@/features/editor/store";
import { isInDialog, isTyping, shortcutFor } from "@/features/editor/tools";
import { useViewStore } from "@/features/editor/viewStore";
import { loadWorld, loadedWorld } from "@/features/editor/world";
import { storageKey, storageModeOf } from "@/features/storage";
import type { Account } from "@/features/storage";
import type { World } from "@/features/editor/world";
import BottomBar from "./BottomBar";
import CategoriesDialog from "./categories/CategoriesDialog";
import FilterStatus from "./filters/FilterStatus";
import FiltersPanel from "./filters/FiltersPanel";
import MapCanvas from "./MapCanvas";
import Panel, { PANEL_WIDTH, hasFiche } from "./Panel";
import TimelineView from "./timeline/TimelineView";
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
  // Fiche en plein écran ou vue frise : les outils sont masqués, leurs raccourcis inactifs ; Échap quitte
  // le plein écran, ou ferme la fiche.
  // Ignorés pendant la saisie dans un champ, avec Ctrl, Meta ou Alt, et quand un dialogue est ouvert
  // (Échap y est déjà traité : il ferme le dialogue, pas la fiche).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isInDialog(e.target)) return;
      const state = useEditorStore.getState();
      const frise = useViewStore.getState().view === "frise";
      const action = editorShortcut(shortcutFor(e, isTyping(e.target)), { expanded: isExpanded(state), frise });
      if (!action) return;
      if (action.type === "cancel") state.cancel();
      else state.setTool(action.tool);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const ready = hydrated && world !== null;
  // Fiche en plein écran : tout ce qu'elle recouvre est inerte (ni focus clavier, ni clic, ni lecteur
  // d'écran), le focus reste dans la fiche.
  const covered = useEditorStore(isExpanded);
  // Vue frise : elle recouvre la carte, qui reste montée dessous (projection, cadrage et zoom gardés)
  // mais inerte ; les outils de dessin, sans objet, sont masqués.
  const frise = useViewStore((s) => s.view === "frise");
  const panelOpen = useEditorStore((s) => hasFiche(s.selection));
  // Nouvelle carte (ouverture, import) : la frise repart de son cadrage automatique, liste fermée.
  const docLoads = useEditorStore((s) => s.docLoads);

  // overflow-clip et non overflow-hidden : un conteneur « hidden » reste défilable par le navigateur
  // (focus d'un élément hors écran, panneau fermé, barre du haut trop large sur mobile), ce qui
  // décalait durablement toute la carte.
  return (
    <div className="fixed inset-0 overflow-clip bg-bg">
      <div className="contents" inert={covered}>
        <div className="contents" inert={frise}>
          <MapCanvas world={ready ? world : null} />
        </div>
        {frise && <TimelineView key={docLoads} />}
        <TopBar account={account} />
        {!frise && <Toolbar />}
        {!frise && (
          // Filtres actifs : rappelés au-dessus de la carte (la frise les affiche dans son en-tête).
          <FilterStatus
            className="absolute top-14 left-[72px] z-3 max-lg:top-[4.75rem]"
            style={{ maxWidth: `calc(100% - 84px - ${panelOpen ? PANEL_WIDTH : "0px"})` }}
          />
        )}
        {!ready && (
          <p role="status" className="pointer-events-none absolute top-1/2 left-1/2 m-0 -translate-1/2 text-mute">
            {loadFailed ? "Impossible de charger le fond de carte. Rechargez la page." : "Chargement de la carte…"}
          </p>
        )}
        <BottomBar />
        <FiltersPanel />
      </div>
      <Panel />
      <CategoriesDialog />
    </div>
  );
}
