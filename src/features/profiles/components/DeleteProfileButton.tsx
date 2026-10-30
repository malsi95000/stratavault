"use client";

import { startTransition, useActionState } from "react";
import { dialogs } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { deleteMyProfile } from "../actions";
import { INITIAL_PROFILE_STATE } from "../formState";
import { DELETE_PROFILE_CONFIRM } from "../messages";
import ProfileFormMessage from "./ProfileFormMessage";

/** « Supprimer mon profil » : confirmation, puis suppression de l'avatar et du profil (le compte reste). */
export default function DeleteProfileButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(deleteMyProfile, INITIAL_PROFILE_STATE);

  async function onClick() {
    if (pending) return;
    if (!(await dialogs.confirm(DELETE_PROFILE_CONFIRM, { confirmLabel: "Supprimer mon profil", destructive: true }))) return;
    const data = new FormData();
    data.append("account", userId);
    startTransition(() => action(data));
  }

  return (
    <>
      <div>
        <Button
          type="button"
          variant="panel"
          size="panel"
          className="border-danger-line text-danger hover:border-danger"
          disabled={pending}
          onClick={() => void onClick()}
        >
          {pending ? "Suppression…" : "Supprimer mon profil"}
        </Button>
      </div>
      <ProfileFormMessage state={state} />
    </>
  );
}
