"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { editorShortcut } from "@/features/editor/panelFocus";
import { deleteOnly, isExpanded, useEditorStore } from "@/features/editor/store";
import { isInDialog, isTyping, shortcutFor } from "@/features/editor/tools";
import { useViewStore } from "@/features/editor/viewStore";
import { loadWorld, loadedWorld } from "@/features/editor/world";
import type { World } from "@/features/editor/world";
import BottomBar from "./BottomBar";
import CategoriesDialog from "./categories/CategoriesDialog";
import FilterStatus from "./filters/FilterStatus";
import FiltersPanel from "./filters/FiltersPanel";
import MapCanvas from "./MapCanvas";
import Panel, { PANEL_WIDTH, hasFiche } from "./Panel";
import type { FicheAside } from "./Panel";
import TimelineView from "./timeline/TimelineView";
import Toolbar, { EraseToolbar } from "./Toolbar";

/**
 * Cadre plein écran de l'éditeur : carte (ou frise), barre d'outils, barre d'aide, panneau des
 * fiches, filtres et catégories, fond de carte et raccourcis clavier. `topBar` : barre du haut (celle
 * de l'éditeur du compte ou de la démo, ou celle de l'éditeur coopératif ou de la carte collective). La
 * barre d'outils n'est montrée qu'en dehors de la lecture seule. `ficheAside` : bloc affiché en tête de
 * la fiche ouverte (carte collective).
 */
export default function EditorFrame({ topBar, ficheAside }: { topBar: ReactNode; ficheAside?: FicheAside }) {
  const hydrated = useEditorStore((s) => s.hydrated);
  const readOnly = useEditorStore((s) => s.readOnly);
  // Carte collective, compte qui peut seulement supprimer ses éléments : Sélection et Gomme.
  const eraseOnly = useEditorStore(deleteOnly);
  const [world, setWorld] = useState<World | null>(loadedWorld);
  const [loadFailed, setLoadFailed] = useState(false);

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
  // le plein écran, ou ferme la fiche. En lecture seule, le store ignore tout autre outil que Sélection.
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
        {topBar}
        {!frise && !readOnly && (eraseOnly ? <EraseToolbar /> : <Toolbar />)}
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
      <Panel aside={ficheAside} />
      <CategoriesDialog />
    </div>
  );
}
