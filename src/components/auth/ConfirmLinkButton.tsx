"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { primaryButton } from "./styles";

/** Bouton de /auth/confirm, désactivé pendant l'envoi : le jeton du lien ne sert qu'une fois. */
export default function ConfirmLinkButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant="panel" size="panel" className={primaryButton}>
      {pending ? "Vérification…" : "Continuer"} <span aria-hidden="true">→</span>
    </Button>
  );
}
