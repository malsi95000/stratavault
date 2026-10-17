"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { MapCover } from "@/features/maps/cover";
import type { MapDoc } from "@/features/map-doc/types";
import { coverOf, draftFrom, sameCover } from "../../cover/coverDraft";
import { coverDialogTitle } from "../../cover/texts";
import CoverPicker from "./CoverPicker";

type Props = {
  name: string;
  cover: MapCover | undefined;
  /** Identifiant du titre de la carte : il décrit le bouton « Logo » pour les lecteurs d'écran. */
  describedBy: string;
  loadDoc: () => Promise<MapDoc | null>;
  /** Enregistre le logo choisi (null : le retirer) ; true si c'est fait. */
  onSave: (cover: MapCover | null) => Promise<boolean>;
};

/** Bouton « Logo » d'une carte de la banque et son dialogue (le focus revient au bouton à la fermeture). */
export default function CoverDialog({ name, cover, describedBy, loadDoc, onSave }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="panel" size="panel" aria-describedby={describedBy}>
          Logo
        </Button>
      </DialogTrigger>
      {/* Contenu monté à l'ouverture seulement : le choix repart du logo enregistré. */}
      {open && <CoverForm name={name} cover={cover} loadDoc={loadDoc} onSave={onSave} onDone={() => setOpen(false)} />}
    </Dialog>
  );
}

function CoverForm({ name, cover, loadDoc, onSave, onDone }: Omit<Props, "describedBy"> & { onDone: () => void }) {
  const [draft, setDraft] = useState(() => draftFrom(cover));
  const [saving, setSaving] = useState(false);
  const chosen = coverOf(draft);

  async function save() {
    if (chosen === undefined) return;
    if (sameCover(chosen, cover)) return onDone();
    setSaving(true);
    const saved = await onSave(chosen);
    setSaving(false);
    if (saved) onDone();
  }

  return (
    <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
      <DialogTitle className="brut pr-8 text-xl">{coverDialogTitle(name)}</DialogTitle>
      <form
        className="grid gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <CoverPicker value={draft} onChange={setDraft} loadDoc={loadDoc} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving || chosen === undefined}>
            Enregistrer
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
