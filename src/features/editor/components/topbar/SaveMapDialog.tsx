"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import CoverPicker from "@/features/bank/components/cover/CoverPicker";
import { coverOf, draftFrom } from "@/features/bank/cover/coverDraft";
import type { MapCover } from "@/features/maps/cover";
import { MAP_NAME_PROMPT, cleanMapName, defaultMapName } from "@/features/editor/persistence";
import { useEditorStore } from "@/features/editor/store";
import { MAX_MAP_NAME_LENGTH } from "@/features/storage";

export type SaveChoice = { name: string; cover: MapCover | null };

/** L'aperçu se calcule sur la carte de l'éditeur, telle qu'elle est à cet instant. */
const currentDoc = () => Promise.resolve(useEditorStore.getState().doc);

/**
 * « Enregistrer dans la banque » (DIV-01) : nom de la nouvelle carte (prérempli, comme la bêta) et son
 * logo (aucun, une icône et sa couleur, ou l'aperçu de la carte). Monté à l'ouverture seulement ;
 * Annuler ou Échap n'enregistre rien. Le focus revient ensuite au bouton (`onCloseAutoFocus`).
 */
export default function SaveMapDialog({
  onDone,
  onCloseAutoFocus,
}: {
  /** Choix validé, ou null si l'utilisateur annule. */
  onDone: (choice: SaveChoice | null) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(defaultMapName);
  const [draft, setDraft] = useState(() => draftFrom(null));
  const [answer, setAnswer] = useState<SaveChoice | null>(null);
  const inputId = useId();
  const cover = coverOf(draft);
  const ready = cleanMapName(name) !== "" && cover !== undefined;

  // La réponse part une fois le dialogue fermé (après le retour du focus), comme les autres dialogues.
  const close = (choice: SaveChoice | null) => {
    setAnswer(choice);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close(null)}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus(event);
          onDone(answer);
        }}
      >
        <DialogTitle className="brut pr-8 text-xl">Enregistrer dans la banque</DialogTitle>
        <form
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && cover !== undefined) close({ name, cover });
          }}
        >
          <Field>
            <FieldLabel htmlFor={inputId} className="text-[15px] font-normal">
              {MAP_NAME_PROMPT}
            </FieldLabel>
            <Input
              id={inputId}
              value={name}
              maxLength={MAX_MAP_NAME_LENGTH}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <CoverPicker value={draft} onChange={setDraft} loadDoc={currentDoc} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(null)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!ready}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
