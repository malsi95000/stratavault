"use client";

import { useEditorStore } from "@/features/editor/store";
import Hint from "./Hint";
import { PANEL_WIDTH, hasFiche } from "./Panel";
import ViewSwitch from "./ViewSwitch";

/**
 * Bas de la carte : barre d'aide centrée (bêta : #hint, left 50 %, 60 px de marge) et choix de la vue à
 * droite, décalé de la largeur du panneau ouvert.
 *
 * Grille `minmax(3rem,1fr) auto 1fr` : les deux colonnes latérales se partagent la place libre, la droite
 * ne réservant que la largeur réelle du choix de la vue. L'aide reste centrée tant qu'elle tient ; plus
 * longue, elle glisse vers la gauche (jamais à moins de 60 px du bord, la largeur de la barre d'outils)
 * avant de passer sur deux lignes, sans jamais chevaucher le choix de la vue.
 *
 * Quand la place manque (mobile, panneau ouvert sur un écran étroit), le choix passe au-dessus de l'aide,
 * qui garde 60 px de chaque côté (pl-3 + mx-12, comme la bêta) pour ne pas passer sous la barre d'outils ;
 * plus étroit encore, il n'affiche que ses icônes (ViewSwitch), puis disparaît plutôt que de passer sous
 * la barre d'outils, à gauche. Il revient dès que le panneau se ferme.
 */
export default function BottomBar() {
  const panelOpen = useEditorStore((s) => hasFiche(s.selection));
  return (
    <div
      className="@container pointer-events-none absolute inset-x-0 bottom-3.5 z-2 pl-3 max-sm:bottom-2"
      style={{ paddingRight: panelOpen ? `calc(${PANEL_WIDTH} + 12px)` : "12px" }}
    >
      <div className="grid grid-cols-[minmax(3rem,1fr)_auto_1fr] items-end *:pointer-events-auto @max-[50rem]:flex @max-[50rem]:flex-col-reverse @max-[50rem]:items-end @max-[50rem]:gap-2">
        <Hint className="col-start-2 @max-[50rem]:mx-12 @max-[50rem]:self-center" />
        <div className="col-start-3 justify-self-end pl-2 @max-[50rem]:pl-0 @max-[8.5rem]:hidden">
          <ViewSwitch />
        </div>
      </div>
    </div>
  );
}
