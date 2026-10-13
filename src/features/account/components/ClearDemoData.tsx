"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { dialogs } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { clearDemoData } from "@/features/editor/storageSession";
import { CLEAR_DEMO_CONFIRM, DEMO_DATA_NOT_CLEARED, DEMO_DATA_PENDING } from "../messages";
import { DEMO_CLEARED_PATH } from "../notices";

/**
 * Mode démo : « Effacer les données de ce navigateur » (cartes de la démo dans IndexedDB et vue
 * mémorisée), après confirmation. La page est ensuite rechargée, avec un message de confirmation ;
 * si un autre onglet retarde l'effacement, un avertissement le dit.
 */
export default function ClearDemoData() {
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);

  function onClick() {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      let leaving = false;
      try {
        const confirmed = await dialogs.confirm(CLEAR_DEMO_CONFIRM, {
          confirmLabel: "Effacer les données",
          destructive: true,
        });
        if (!confirmed) return;
        const result = await clearDemoData();
        if (result === "failed") {
          toast.error(DEMO_DATA_NOT_CLEARED);
          return;
        }
        if (result === "pending") {
          toast.warning(DEMO_DATA_PENDING);
          return;
        }
        leaving = true;
        window.location.assign(DEMO_CLEARED_PATH);
      } finally {
        if (!leaving) busy.current = false;
      }
    });
  }

  return (
    <Button
      variant="panel"
      size="panel"
      className="border-danger-line text-danger hover:border-danger"
      aria-busy={pending}
      onClick={onClick}
    >
      Effacer les données de ce navigateur
    </Button>
  );
}
