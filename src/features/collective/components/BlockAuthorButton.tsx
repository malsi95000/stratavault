"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { dialogs } from "@/components/dialogs";
import { BTN } from "@/features/editor/components/fiches/styles";
import { cn } from "@/lib/utils";
import { blockCollectiveAuthor } from "../actions";
import { INITIAL_COLLECTIVE_STATE } from "../actionState";
import { BLOCK_AUTHOR_BUTTON, BLOCK_AUTHOR_CONFIRM_LABEL, BLOCK_AUTHOR_PENDING, confirmBlockAuthor } from "../messages";

type Props = {
  userId: string;
  itemId: string;
  /** Identifiant public de l'auteur, montré dans la question. */
  authorHandle: string | null;
  /** Après un blocage : la carte est relue (les éléments de l'auteur disparaissent). */
  onBlocked: () => void;
};

/**
 * « Bloquer l'auteur » d'un élément d'un autre membre : même blocage que depuis la page « Contacts »,
 * possible même si son profil n'est visible que de ses contacts (la base retrouve l'auteur à partir
 * de l'élément). Confirmation d'abord ; succès : un toast ; refus : le message sous le bouton.
 */
export default function BlockAuthorButton({ userId, itemId, authorHandle, onBlocked }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function onClick() {
    if (pending) return;
    const confirmed = await dialogs.confirm(confirmBlockAuthor(authorHandle), {
      confirmLabel: BLOCK_AUTHOR_CONFIRM_LABEL,
      destructive: true,
    });
    if (!confirmed) return;
    const data = new FormData();
    data.append("account", userId);
    data.append("item", itemId);
    startTransition(async () => {
      const result = await blockCollectiveAuthor(INITIAL_COLLECTIVE_STATE, data);
      if (result.status === "success") {
        setError("");
        toast.success(result.message);
        onBlocked();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <>
      <button type="button" className={cn(BTN, "px-2 py-1 text-[13px]")} disabled={pending} onClick={() => void onClick()}>
        {pending ? BLOCK_AUTHOR_PENDING : BLOCK_AUTHOR_BUTTON}
      </button>
      {error && (
        <p role="alert" className="m-0 basis-full text-danger">
          {error}
        </p>
      )}
    </>
  );
}
