"use client";

import { useEffect } from "react";
import { purgeAccountCopies } from "@/features/storage/purge";

/**
 * Page de connexion sans session : efface de ce navigateur les copies locales des comptes restées
 * après une déconnexion sans JavaScript, une réponse perdue ou une session expirée (sauf une carte
 * jamais envoyée, gardée pour la prochaine connexion de son compte).
 */
export default function ClearAccountCopies() {
  useEffect(() => {
    void purgeAccountCopies();
  }, []);
  return null;
}
