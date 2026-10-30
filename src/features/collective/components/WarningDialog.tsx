"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COLLECTIVE_WARNING } from "../warning";
import CollectiveLegalLinks from "./CollectiveLegalLinks";

/**
 * Avertissement de la carte collective (COM-02) : ouvert à l'entrée, rappelé par le bouton
 * « Avertissement » de la barre du haut. Son texte est dans warning.ts.
 */
export default function WarningDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [first, ...rest] = COLLECTIVE_WARNING.paragraphs;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="brut pr-8 text-xl">{COLLECTIVE_WARNING.title}</DialogTitle>
          <DialogDescription className="text-[14px] text-ink">{first}</DialogDescription>
        </DialogHeader>
        {rest.map((paragraph) => (
          <p key={paragraph} className="m-0 text-[14px] text-mute">
            {paragraph}
          </p>
        ))}
        <CollectiveLegalLinks />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{COLLECTIVE_WARNING.accept}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
