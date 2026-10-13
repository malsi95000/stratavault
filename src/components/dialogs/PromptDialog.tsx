"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PromptRequest } from "./store";
import { useCloseAutoFocus } from "./useCloseAutoFocus";

/** Saisie d'un texte (équivalent de window.prompt) : le champ reçoit le focus, Entrée valide, Échap annule. */
export default function PromptDialog({ request }: { request: PromptRequest }) {
  const { id, message, defaultValue, options, open, settle } = request;
  const [value, setValue] = useState(defaultValue);
  const inputId = useId();
  const onCloseAutoFocus = useCloseAutoFocus(id);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && settle(null)}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogTitle className="sr-only">Saisie</DialogTitle>
        <form
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            settle(value);
          }}
        >
          <Field>
            <FieldLabel htmlFor={inputId} className="text-[15px] font-normal">
              {message}
            </FieldLabel>
            <Input
              id={inputId}
              value={value}
              maxLength={options.maxLength}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => settle(null)}>
              Annuler
            </Button>
            <Button type="submit">Valider</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
