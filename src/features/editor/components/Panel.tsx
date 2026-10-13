"use client";

import { useState } from "react";
import type { Selection } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import CountryFiche from "./fiches/CountryFiche";
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

/** Fiche de l'élément ouvert, une par type (bêta, render). */
export function Fiche({ selection }: { selection: Selection }) {
  const { k, id } = selection;
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

/** Panneau de droite : glisse depuis la droite et affiche la fiche de l'élément ouvert. */
export default function Panel() {
  const selection = useEditorStore((s) => s.selection);
  const open = hasFiche(selection);
  // La dernière fiche reste affichée pendant que le panneau se referme.
  const [shown, setShown] = useState<Selection | null>(open ? selection : null);
  if (open && selection !== shown) setShown(selection);

  return (
    <aside
      aria-live="polite"
      aria-label="Fiche"
      inert={!open}
      className={`absolute top-0 right-0 bottom-0 z-4 overflow-auto border-l border-line bg-panel p-4 transition-transform duration-[180ms] ease-[ease] motion-reduce:transition-none ${open ? "translate-x-0" : "translate-x-full"}`}
      style={{ width: PANEL_WIDTH }}
    >
      {/* Une clé par élément : les champs repartent de l'élément ouvert. */}
      {shown && <Fiche key={`${shown.k}:${shown.id}`} selection={shown} />}
    </aside>
  );
}
