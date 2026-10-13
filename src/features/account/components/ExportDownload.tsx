"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** Adresse du téléchargement des données (Route Handler src/app/compte/export/route.ts). */
export const EXPORT_URL = "/compte/export";

/**
 * Bouton « Télécharger mes données », avec l'erreur du dernier essai (?erreur=…, déjà traduite).
 * Le paramètre est retiré de l'adresse dès l'affichage (un rechargement ne le réaffiche pas), et le
 * message disparaît au clic suivant : un téléchargement réussi ne quitte pas la page
 * (Content-Disposition), il ne doit pas laisser l'ancien échec affiché.
 */
export default function ExportDownload({ error }: { error?: string }) {
  const [shownError, setShownError] = useState(error);

  useEffect(() => {
    if (!error) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("erreur");
    window.history.replaceState(window.history.state, "", url);
  }, [error]);

  return (
    <>
      {shownError && (
        <p role="alert" className="m-0 text-[14px] text-danger">
          {shownError}
        </p>
      )}
      <div>
        <Button asChild variant="panel" size="panel">
          {/* Lien ordinaire : le fichier se télécharge sans quitter la page. Sans JavaScript, tout marche aussi. */}
          <a href={EXPORT_URL} onClick={() => setShownError(undefined)}>
            Télécharger mes données
          </a>
        </Button>
      </div>
    </>
  );
}
