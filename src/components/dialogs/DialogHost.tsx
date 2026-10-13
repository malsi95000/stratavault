"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import AskDialog from "./AskDialog";
import ConfirmDialog from "./ConfirmDialog";
import PromptDialog from "./PromptDialog";
import { currentDialog, dismissAllDialogs, useDialogStore } from "./store";

/** Affiche la demande de dialogue en cours (une à la fois). À monter une seule fois, dans le layout racine. */
export default function DialogHost() {
  const request = useDialogStore(currentDialog);
  const pathname = usePathname();

  // Le layout racine survit à la navigation : une demande posée sur une page n'a plus de sens sur
  // la suivante (Précédent, double clic sur un lien…). On les annule toutes au changement de page.
  useEffect(() => dismissAllDialogs, [pathname]);

  if (!request) return null;
  switch (request.kind) {
    case "confirm":
      return <ConfirmDialog key={request.id} request={request} />;
    case "ask":
      return <AskDialog key={request.id} request={request} />;
    case "prompt":
      return <PromptDialog key={request.id} request={request} />;
  }
}
