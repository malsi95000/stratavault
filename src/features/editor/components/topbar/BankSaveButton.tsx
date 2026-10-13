"use client";

import { useRef } from "react";
import { dialogs } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { MAP_NAME_PROMPT, defaultMapName } from "@/features/editor/persistence";
import { getPersistence } from "@/features/editor/storageSession";
import { useEditorStore } from "@/features/editor/store";
import { MAX_MAP_NAME_LENGTH } from "@/features/storage";

/**
 * « Enregistrer dans la banque » (nom demandé, nouvelle carte active) ou « Mettre à jour la banque »
 * (carte active écrasée directement). Le résultat s'affiche dans le statut d'enregistrement.
 */
export default function BankSaveButton() {
  const hasActiveMap = useEditorStore((s) => s.activeMapId !== null);
  // Garde contre un double clic ; le bouton reste actif pour récupérer le focus à la fermeture du dialogue.
  const busy = useRef(false);

  async function saveToBank() {
    if (busy.current) return;
    busy.current = true;
    try {
      const persistence = getPersistence();
      if ((await persistence.saveToBank()) !== "needs-name") return;
      const name = await dialogs.prompt(MAP_NAME_PROMPT, defaultMapName(), { maxLength: MAX_MAP_NAME_LENGTH });
      // Annulé ou nom vide : rien n'est enregistré (comme la bêta).
      if (name !== null) await persistence.saveToBank(name);
    } finally {
      busy.current = false;
    }
  }

  return (
    <Button variant="panel" size="panel" onClick={saveToBank}>
      {hasActiveMap ? "Mettre à jour la banque" : "Enregistrer dans la banque"}
    </Button>
  );
}
