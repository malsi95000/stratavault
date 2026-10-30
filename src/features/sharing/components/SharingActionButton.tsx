"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { dialogs } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INITIAL_SHARING_STATE, type SharingActionState } from "../actionState";
import { sharedMapPath } from "../paths";
import SharingMessage from "./SharingMessage";

type SharingAction = (previous: SharingActionState, formData: FormData) => Promise<SharingActionState>;

type Props = {
  action: SharingAction;
  /** Champs envoyés (compte attendu, référence, réponse…). */
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  /** Question posée avant d'agir ; sans elle, l'action part au clic. */
  confirm?: { message: string; label: string };
  danger?: boolean;
  /** Après un succès qui donne une carte (invitation acceptée), l'ouvrir dans l'éditeur coopératif. */
  openMapOnSuccess?: boolean;
};

/**
 * Un bouton qui appelle une Server Action du partage, avec confirmation éventuelle. Succès : un toast
 * (la ligne du bouton disparaît souvent avec la liste relue) ; échec : le message sous le bouton.
 */
export default function SharingActionButton({
  action,
  fields,
  label,
  pendingLabel,
  confirm,
  danger = false,
  openMapOnSuccess = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SharingActionState>(INITIAL_SHARING_STATE);

  async function onClick() {
    if (pending) return;
    if (confirm && !(await dialogs.confirm(confirm.message, { confirmLabel: confirm.label, destructive: danger }))) return;
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) data.append(name, value);
    startTransition(async () => {
      const result = await action(INITIAL_SHARING_STATE, data);
      if (result.status === "success") {
        toast.success(result.message);
        setState(INITIAL_SHARING_STATE);
        if (openMapOnSuccess && result.mapId) router.push(sharedMapPath(result.mapId));
      } else {
        setState(result);
      }
    });
  }

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="panel"
        size="panel"
        className={cn(danger && "border-danger-line text-danger hover:border-danger")}
        disabled={pending}
        onClick={() => void onClick()}
      >
        {pending ? pendingLabel : label}
      </Button>
      <SharingMessage state={state} />
    </div>
  );
}
