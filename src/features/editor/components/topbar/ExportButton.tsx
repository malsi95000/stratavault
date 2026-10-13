"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { EXPORT_FILE_NAME, EXPORT_TOO_LARGE, MAX_IMPORT_BYTES, exportBlob } from "@/features/editor/mapFile";
import { useEditorStore } from "@/features/editor/store";

/** « Exporter » : télécharge la carte en cours (stratavault-carte.json). */
export default function ExportButton() {
  const hydrated = useEditorStore((s) => s.hydrated);

  function exportMap() {
    const blob = exportBlob(useEditorStore.getState().doc);
    if (blob.size > MAX_IMPORT_BYTES) toast.warning(EXPORT_TOO_LARGE);
    downloadBlob(blob, EXPORT_FILE_NAME);
  }

  // Avant le chargement, le document est encore vide : l'exporter n'aurait pas de sens.
  return (
    <Button variant="panel" size="panel" disabled={!hydrated} onClick={exportMap}>
      Exporter
    </Button>
  );
}
