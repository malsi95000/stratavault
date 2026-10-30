"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { setMemberRole } from "../actions";
import { INITIAL_SHARING_STATE, type SharingActionState } from "../actionState";
import { ROLE_LABELS } from "../messages";
import { MEMBER_ROLES, type MemberRole } from "../types";
import SharingMessage from "./SharingMessage";
import { SELECT } from "./styles";

/** Rôle d'un membre, modifiable par le propriétaire (le changement part aussitôt). */
export default function RoleSelect({
  userId,
  memberId,
  role,
  handle,
}: {
  userId: string;
  memberId: string;
  role: MemberRole;
  handle: string;
}) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SharingActionState>(INITIAL_SHARING_STATE);

  function change(next: MemberRole) {
    const data = new FormData();
    data.append("account", userId);
    data.append("member", memberId);
    data.append("role", next);
    startTransition(async () => {
      const result = await setMemberRole(INITIAL_SHARING_STATE, data);
      if (result.status === "success") {
        toast.success(result.message);
        setState(INITIAL_SHARING_STATE);
      } else {
        setState(result);
      }
    });
  }

  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="sr-only">
        Rôle de @{handle}
      </label>
      <select
        id={id}
        className={SELECT}
        value={role}
        disabled={pending}
        onChange={(event) => {
          const next = MEMBER_ROLES.find((r) => r === event.target.value);
          if (next && next !== role) change(next);
        }}
      >
        {MEMBER_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <SharingMessage state={state} />
    </div>
  );
}
