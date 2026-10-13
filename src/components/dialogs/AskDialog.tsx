"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AskRequest } from "./store";
import { useCloseAutoFocus } from "./useCloseAutoFocus";

/**
 * Question à trois réponses : le focus va sur « Annuler » et Échap annule (rien ne se passe),
 * « non » et « oui » sont deux choix explicites. Le focus revient au déclencheur.
 */
export default function AskDialog({ request }: { request: AskRequest }) {
  const { id, message, options, open, settle } = request;
  const onCloseAutoFocus = useCloseAutoFocus(id);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && settle(null)}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className="sr-only">Question</AlertDialogTitle>
          <AlertDialogDescription className="text-[15px] text-foreground">{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="outline" onClick={() => settle("no")}>
            {options.noLabel}
          </AlertDialogAction>
          <AlertDialogAction onClick={() => settle("yes")}>{options.yesLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
