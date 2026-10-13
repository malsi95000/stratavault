"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Message de confirmation passé par l'adresse de la page (`?compte=supprime`…) : affiché une fois
 * dans un toast, puis le paramètre est retiré de l'adresse (un rechargement ne le réaffiche pas).
 */
export default function FlashToast({ message }: { message: string }) {
  useEffect(() => {
    // Identifiant fixe : un second appel (double effet en développement) ne crée pas de doublon.
    toast.success(message, { id: message });
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState(window.history.state, "", url);
  }, [message]);
  return null;
}
