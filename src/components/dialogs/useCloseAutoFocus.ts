"use client";

import { useCallback, useState } from "react";
import { removeDialog } from "./store";

/** Attribut d'une zone qui survit au déclencheur (le panneau des fiches, par exemple). */
const SCOPE = "[data-focus-scope]";
/** Attribut de l'élément de cette zone qui reprend le focus (le titre de la fiche affichée). */
const FALLBACK = "[data-focus-fallback]";

type Origin = { trigger: Element | null; scope: Element | null };

/**
 * Élément à refocaliser à la fermeture : le déclencheur s'il est toujours dans la page ; sinon (il a
 * disparu avec ce qu'il supprimait), l'élément de repli de sa zone `data-focus-scope`.
 */
export function returnFocusTarget({ trigger, scope }: Origin): HTMLElement | null {
  if (typeof HTMLElement !== "undefined" && trigger instanceof HTMLElement && trigger.isConnected) return trigger;
  if (!scope?.isConnected) return null;
  return scope.querySelector<HTMLElement>(FALLBACK);
}

/**
 * Gestionnaire `onCloseAutoFocus` commun aux dialogues de la file.
 *
 * Les dialogues sont ouverts par code (pas de <DialogTrigger>) : Radix ne sait donc pas à qui rendre
 * le focus et le laisse sur <body>. On mémorise l'élément actif à l'ouverture, on le refocalise
 * à la fermeture (s'il est toujours dans la page, sinon l'élément de repli de sa zone), puis on
 * retire la demande de la file.
 */
export function useCloseAutoFocus(id: number): (event: Event) => void {
  // Lu une seule fois, au premier rendu : c'est l'élément qui avait le focus avant le dialogue.
  const [origin] = useState<Origin>(() => {
    const trigger = typeof document === "undefined" ? null : document.activeElement;
    return { trigger, scope: trigger?.closest(SCOPE) ?? null };
  });

  return useCallback(
    (event: Event) => {
      event.preventDefault();
      returnFocusTarget(origin)?.focus();
      removeDialog(id);
    },
    [id, origin],
  );
}
