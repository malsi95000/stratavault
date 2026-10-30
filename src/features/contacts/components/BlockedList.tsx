import { formatAccountDate } from "@/features/account/format";
import { unblockMember } from "../actions";
import { BLOCKED_HANDLE_NOTE } from "../messages";
import type { BlockedMember } from "../types";
import ContactActionButton from "./ContactActionButton";
import MemberRow from "./MemberRow";

/**
 * Comptes bloqués par le compte : déblocage. Seul l'identifiant du moment du blocage est montré, sans
 * lien (le profil du bloqué vous est invisible) ; une ligne sans identifiant s'affiche « profil masqué ».
 */
export default function BlockedList({ userId, blocked }: { userId: string; blocked: readonly BlockedMember[] }) {
  if (blocked.length === 0) return <p className="m-0 text-[14px] text-mute">Aucun compte bloqué.</p>;
  return (
    <ul className="m-0 list-none p-0">
      {blocked.map((member) => (
        <MemberRow
          key={member.id}
          handle={member.handle}
          displayName={null}
          detail={`Bloqué le ${formatAccountDate(member.createdAt)}${member.handle ? ` (${BLOCKED_HANDLE_NOTE})` : ""}`}
        >
          <ContactActionButton
            action={unblockMember}
            fields={{ account: userId, block: member.id }}
            label="Débloquer"
            pendingLabel="Déblocage…"
          />
        </MemberRow>
      ))}
    </ul>
  );
}
