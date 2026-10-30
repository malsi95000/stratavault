"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { inviteContact } from "../actions";
import { INITIAL_SHARING_STATE, type SharingActionState } from "../actionState";
import { ROLE_LABELS } from "../messages";
import { MEMBER_ROLES, type MemberRole } from "../types";
import SharingMessage from "./SharingMessage";
import { FIELD_LABEL, SELECT } from "./styles";

export type InvitableContact = { id: string; handle: string; displayName: string };

/**
 * « Inviter un contact » : un contact du compte (référence de son contact, jamais un identifiant de
 * compte) et un rôle. Le contact reçoit l'invitation dans son espace et l'accepte ou la refuse.
 */
export default function InviteContactForm({
  userId,
  mapId,
  contacts,
}: {
  userId: string;
  mapId: string;
  contacts: readonly InvitableContact[];
}) {
  const [contact, setContact] = useState(contacts[0]?.id ?? "");
  const [role, setRole] = useState<MemberRole>("editor");
  const [state, setState] = useState<SharingActionState>(INITIAL_SHARING_STATE);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !contact) return;
    const data = new FormData();
    data.append("account", userId);
    data.append("map", mapId);
    data.append("contact", contact);
    data.append("role", role);
    startTransition(async () => setState(await inviteContact(INITIAL_SHARING_STATE, data)));
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className={FIELD_LABEL}>
          Contact
          <select className={SELECT} value={contact} onChange={(event) => setContact(event.target.value)}>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName} (@{c.handle})
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD_LABEL}>
          Rôle
          <select
            className={SELECT}
            value={role}
            onChange={(event) => setRole(MEMBER_ROLES.find((r) => r === event.target.value) ?? "reader")}
          >
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="panel" size="panel" disabled={pending || !contact}>
          {pending ? "Envoi…" : "Inviter"}
        </Button>
      </div>
      <SharingMessage state={state} />
    </form>
  );
}
