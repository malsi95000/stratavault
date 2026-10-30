"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { dialogs } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INITIAL_CONTACT_STATE, LEAVE_AFTER_SUCCESS, type ContactActionState } from "../actionState";
import { CONTACTS_PAGE } from "../paths";
import ContactMessage from "./ContactMessage";

type ContactAction = (previous: ContactActionState, formData: FormData) => Promise<ContactActionState>;

type Props = {
  action: ContactAction;
  /** Champs envoyés (compte attendu, référence, réponse…). */
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  /** Question posée avant d'agir ; sans elle, l'action part au clic. */
  confirm?: { message: string; label: string };
  danger?: boolean;
  /**
   * Après un succès, aller sur la page « Contacts » au lieu de relire la page (profil d'un membre qui
   * peut ne plus être visible ensuite).
   */
  leaveToContacts?: boolean;
};

/**
 * Un bouton qui appelle une Server Action des contacts, avec confirmation éventuelle. Succès : un
 * toast (la ligne du bouton disparaît souvent avec la liste relue) ; échec : le message sous le bouton.
 */
export default function ContactActionButton({
  action,
  fields,
  label,
  pendingLabel,
  confirm,
  danger = false,
  leaveToContacts = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ContactActionState>(INITIAL_CONTACT_STATE);

  async function onClick() {
    if (pending) return;
    if (confirm && !(await dialogs.confirm(confirm.message, { confirmLabel: confirm.label, destructive: danger }))) return;
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) data.append(name, value);
    if (leaveToContacts) data.append("after", LEAVE_AFTER_SUCCESS);
    startTransition(async () => {
      const result = await action(INITIAL_CONTACT_STATE, data);
      if (result.status === "success") {
        toast.success(result.message);
        setState(INITIAL_CONTACT_STATE);
        if (leaveToContacts) router.push(CONTACTS_PAGE);
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
      <ContactMessage state={state} />
    </div>
  );
}
