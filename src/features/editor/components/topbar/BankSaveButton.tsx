"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { COVER_AFTER_SAVE_FAILED } from "@/features/bank/cover/texts";
import { getPersistence } from "@/features/editor/storageSession";
import { useEditorStore } from "@/features/editor/store";
import SaveMapDialog from "./SaveMapDialog";
import type { SaveChoice } from "./SaveMapDialog";

/**
 * « Enregistrer dans la banque » (nom et logo demandés, nouvelle carte active) ou « Mettre à jour la
 * banque » (carte active écrasée directement, son logo ne change pas). Le résultat s'affiche dans le
 * statut d'enregistrement.
 */
export default function BankSaveButton() {
  const hasActiveMap = useEditorStore((s) => s.activeMapId !== null);
  const [asking, setAsking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // Garde contre un double clic ; le bouton reste actif pour récupérer le focus à la fermeture du dialogue.
  const busy = useRef(false);

  async function saveToBank() {
    if (busy.current) return;
    busy.current = true;
    try {
      if ((await getPersistence().saveToBank()) === "needs-name") {
        // Le verrou reste pris jusqu'à la réponse du dialogue.
        setAsking(true);
        return;
      }
    } catch {
      // Statut déjà affiché par la persistance.
    }
    busy.current = false;
  }

  async function saveAs(choice: SaveChoice | null) {
    setAsking(false);
    try {
      // Annulé : rien n'est enregistré (comme la bêta).
      if (!choice) return;
      const persistence = getPersistence();
      if ((await persistence.saveToBank(choice.name)) !== "created" || !choice.cover) return;
      const id = useEditorStore.getState().activeMapId;
      const saved = id !== null && (await persistence.setMapCover(id, choice.cover).catch(() => false));
      if (!saved) toast.warning(COVER_AFTER_SAVE_FAILED);
    } finally {
      busy.current = false;
    }
  }

  return (
    <>
      <Button ref={button} variant="panel" size="panel" onClick={saveToBank}>
        {hasActiveMap ? "Mettre à jour la banque" : "Enregistrer dans la banque"}
      </Button>
      {asking && (
        <SaveMapDialog
          onDone={(choice) => void saveAs(choice)}
          onCloseAutoFocus={(event) => {
            // Ouvert par code : Radix ne connaît pas le déclencheur, le focus revient au bouton.
            event.preventDefault();
            button.current?.focus();
          }}
        />
      )}
    </>
  );
}
