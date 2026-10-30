import { formatAccountDate } from "@/features/account/format";
import MemberRow from "@/features/contacts/components/MemberRow";
import { cancelInvitation, removeMember } from "../actions";
import { CONFIRM_REMOVE_MEMBER, ROLE_LABELS } from "../messages";
import type { MapMember, SentInvitation } from "../types";
import RoleSelect from "./RoleSelect";
import SharingActionButton from "./SharingActionButton";

/** Membres d'une carte du compte : rôle modifiable, retrait. */
export function MemberList({ userId, members }: { userId: string; members: readonly MapMember[] }) {
  if (members.length === 0) return <p className="m-0 text-[14px] text-mute">Aucun membre pour l’instant.</p>;
  return (
    <ul className="m-0 list-none p-0">
      {members.map((member) => (
        <MemberRow
          key={member.id}
          handle={member.handle}
          displayName={member.displayName}
          detail={`Membre depuis le ${formatAccountDate(member.since)}`}
        >
          <RoleSelect userId={userId} memberId={member.id} role={member.role} handle={member.handle} />
          <SharingActionButton
            action={removeMember}
            fields={{ account: userId, member: member.id }}
            label="Retirer"
            pendingLabel="Retrait…"
            confirm={{ message: CONFIRM_REMOVE_MEMBER(member.handle), label: "Retirer" }}
            danger
          />
        </MemberRow>
      ))}
    </ul>
  );
}

/** Invitations en attente envoyées à des contacts : annulation. */
export function SentInvitationList({ userId, invitations }: { userId: string; invitations: readonly SentInvitation[] }) {
  if (invitations.length === 0) return <p className="m-0 text-[14px] text-mute">Aucune invitation en attente.</p>;
  return (
    <ul className="m-0 list-none p-0">
      {invitations.map((invitation) => (
        <MemberRow
          key={invitation.id}
          handle={invitation.handle}
          displayName={invitation.displayName}
          detail={`${ROLE_LABELS[invitation.role]} · invité le ${formatAccountDate(invitation.createdAt)}, valable jusqu’au ${formatAccountDate(invitation.expiresAt)}`}
        >
          <SharingActionButton
            action={cancelInvitation}
            fields={{ account: userId, invitation: invitation.id }}
            label="Annuler l’invitation"
            pendingLabel="Annulation…"
          />
        </MemberRow>
      ))}
    </ul>
  );
}
