"use client";

import { useRef } from "react";
import type { ChangeEvent } from "react";
import { toast } from "sonner";
import { dialogs } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { IMPORT_ACCEPT, IMPORT_CONFIRM, readMapFile } from "@/features/editor/mapFile";
import { getPersistence } from "@/features/editor/storageSession";

/** « Importer » : lit un fichier .json, le valide, puis remplace la carte en cours après confirmation. */
export default function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  // Garde contre deux imports simultanés ; le bouton reste actif pour récupérer le focus après le dialogue.
  const busy = useRef(false);

  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    // Vidé tout de suite : choisir à nouveau le même fichier relance l'import.
    input.value = "";
    if (!file || busy.current) return;
    busy.current = true;
    try {
      const result = await readMapFile(file);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const confirmed = await dialogs.confirm(IMPORT_CONFIRM, { confirmLabel: "Remplacer", destructive: true });
      // La carte importée remplace le document : fiche fermée, sauvegarde automatique.
      if (confirmed) await getPersistence().importDoc(result.doc);
    } finally {
      busy.current = false;
    }
  }

  return (
    <>
      <Button variant="panel" size="panel" onClick={() => inputRef.current?.click()}>
        Importer
      </Button>
      <input ref={inputRef} type="file" accept={IMPORT_ACCEPT} hidden onChange={importFile} />
    </>
  );
}
