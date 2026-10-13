"use client";

import { useCallback, useState } from "react";
import { removeDialog } from "./store";

/**
 * Gestionnaire `onCloseAutoFocus` commun aux dialogues de la file.
 *
 * Les dialogues sont ouverts par code (pas de <DialogTrigger>) : Radix ne sait donc pas à qui rendre
 * le focus et le laisse sur <body>. On mémorise l'élément actif à l'ouverture, on le refocalise
 * à la fermeture (s'il est toujours dans la page), puis on retire la demande de la file.
 */
export function useCloseAutoFocus(id: number): (event: Event) => void {
  // Lu une seule fois, au premier rendu : c'est l'élément qui avait le focus avant le dialogue.
  const [returnFocus] = useState(() => (typeof document === "undefined" ? null : document.activeElement));

  return useCallback(
    (event: Event) => {
      event.preventDefault();
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
      removeDialog(id);
    },
    [id, returnFocus],
  );
}
