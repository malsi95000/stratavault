"use client";

import { useEffect, useRef, useState } from "react";
import type { Selection } from "@/features/map-doc/types";
import {
  FICHE_BUTTON_ATTR,
  FOCUS_FALLBACK_ATTR,
  collapsesOnEscape,
  ficheKey,
  panelUpdate,
} from "@/features/editor/panelFocus";
import type { PanelFocusTarget } from "@/features/editor/panelFocus";
import { useEditorStore } from "@/features/editor/store";
import { selectedElement } from "@/features/editor/storeFiches";
import CountryFiche from "./fiches/CountryFiche";
import ExtraFicheView from "./fiches/ExtraFicheView";
import FluxFiche from "./fiches/FluxFiche";
import LinkFiche from "./fiches/LinkFiche";
import PingFiche from "./fiches/PingFiche";
import PointFiche from "./fiches/PointFiche";
import TextFiche from "./fiches/TextFiche";
import ZoneFiche from "./fiches/ZoneFiche";

/** Largeur du panneau ouvert (bêta : min(360px, 100 %)). */
export const PANEL_WIDTH = "min(360px, 100%)";

/** Vrai si un élément est ouvert : chaque sorte d'élément a sa fiche. */
export function hasFiche(selection: Selection | null): selection is Selection {
  return selection !== null;
}

/** Fiche de l'élément ouvert, une par type (bêta, render), ou l'une de ses fiches supplémentaires. */
export function Fiche({ selection }: { selection: Selection }) {
  const { k, id, fiche } = selection;
  const owner = selectedElement(selection);
  if (fiche !== undefined && owner) return <ExtraFicheView owner={owner} ficheId={fiche} />;
  switch (k) {
    case "c":
      return <CountryFiche code={id} />;
    case "l":
      return <LinkFiche id={id} />;
    case "p":
      return <PingFiche id={id} />;
    case "o":
      return <PointFiche id={id} />;
    case "z":
      return <ZoneFiche id={id} />;
    case "t":
      return <TextFiche id={id} />;
    case "flux":
      return <FluxFiche id={id} />;
  }
}

/** Rend le focus au panneau s'il a été perdu (bouton démonté avec l'ancienne fiche). */
function restoreFocus(aside: HTMLElement, target: PanelFocusTarget) {
  const active = document.activeElement;
  if (active && active !== document.body) return;
  const button =
    target === "heading" ? null : aside.querySelector<HTMLElement>(`[${FICHE_BUTTON_ATTR}="${CSS.escape(target.ficheButton)}"]`);
  (button ?? aside.querySelector<HTMLElement>(`[${FOCUS_FALLBACK_ATTR}]`))?.focus({ preventScroll: true });
}

/**
 * Panneau de droite : glisse depuis la droite et affiche la fiche de l'élément ouvert. En plein écran,
 * il couvre toute la carte (texte centré, lisible) ; Échap ou le bouton de l'en-tête le ramène à droite,
 * même pendant la saisie dans un champ. Le reste de l'éditeur est alors inerte (Editor.tsx).
 */
export default function Panel() {
  const selection = useEditorStore((s) => s.selection);
  const panelExpanded = useEditorStore((s) => s.panelExpanded);
  const setPanelExpanded = useEditorStore((s) => s.setPanelExpanded);
  const open = hasFiche(selection);
  const expanded = open && panelExpanded;
  // La dernière fiche reste affichée pendant que le panneau se referme.
  const [shown, setShown] = useState<Selection | null>(open ? selection : null);
  if (open && selection !== shown) setShown(selection);

  // Nouvelle fiche affichée (ou panneau rouvert) : elle s'ouvre en haut (en-tête, boutons, mini-carte),
  // et le focus perdu avec le bouton cliqué (« Nouvelle fiche », une fiche de la liste, « Fiche
  // principale ») est rendu. Recliquer l'élément déjà ouvert ne change rien (panelUpdate).
  const asideRef = useRef<HTMLElement>(null);
  const previous = useRef<Selection | null>(null);
  useEffect(() => {
    const { remember, focus } = panelUpdate(previous.current, open, shown);
    previous.current = remember;
    const aside = asideRef.current;
    if (!aside || !focus) return;
    aside.scrollTop = 0;
    restoreFocus(aside, focus);
  }, [open, shown]);

  return (
    <aside
      ref={asideRef}
      aria-live="polite"
      aria-label="Fiche"
      inert={!open}
      data-expanded={expanded}
      data-focus-scope=""
      className={`absolute top-0 right-0 bottom-0 z-4 overflow-auto border-l border-line bg-panel p-4 transition-transform duration-[180ms] ease-[ease] motion-reduce:transition-none ${open ? "translate-x-0" : "translate-x-full"} ${expanded ? "sm:px-8 sm:py-6" : ""}`}
      style={{ width: expanded ? "100%" : PANEL_WIDTH }}
      onKeyDown={(e) => {
        if (!collapsesOnEscape(e, expanded)) return;
        e.preventDefault();
        setPanelExpanded(false);
      }}
    >
      <div className={expanded ? "mx-auto max-w-3xl" : undefined}>
        {/* Une clé par fiche : les champs repartent de la fiche ouverte. */}
        {shown && <Fiche key={ficheKey(shown)} selection={shown} />}
      </div>
    </aside>
  );
}
