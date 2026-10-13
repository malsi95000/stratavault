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
import type { ConfirmRequest } from "./store";
import { useCloseAutoFocus } from "./useCloseAutoFocus";

/** Confirmation modale : le focus va sur « Annuler », Échap annule, le focus revient au déclencheur. */
export default function ConfirmDialog({ request }: { request: ConfirmRequest }) {
  const { id, message, options, open, settle } = request;
  const onCloseAutoFocus = useCloseAutoFocus(id);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && settle(false)}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className="sr-only">Confirmation</AlertDialogTitle>
          <AlertDialogDescription className="text-[15px] text-foreground">{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant={options.destructive ? "destructive" : "default"}
            onClick={() => settle(true)}
          >
            {options.confirmLabel ?? "Confirmer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
