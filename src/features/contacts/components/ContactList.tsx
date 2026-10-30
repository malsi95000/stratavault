import { formatAccountDate } from "@/features/account/format";
import { blockMember, removeContact } from "../actions";
import { CONFIRM_BLOCK, CONFIRM_REMOVE } from "../messages";
import type { Contact } from "../types";
import ContactActionButton from "./ContactActionButton";
import MemberRow from "./MemberRow";

/** Contacts du compte : profil, retrait, blocage. */
export default function ContactList({ userId, contacts }: { userId: string; contacts: readonly Contact[] }) {
  if (contacts.length === 0) {
    return <p className="m-0 text-[14px] text-mute">Pas encore de contact. Envoyez une demande à un membre par son identifiant.</p>;
  }
  return (
    <ul className="m-0 list-none p-0">
      {contacts.map((contact) => (
        <MemberRow
          key={contact.id}
          handle={contact.handle}
          displayName={contact.displayName}
          avatarId={contact.avatarId}
          detail={`En contact depuis le ${formatAccountDate(contact.createdAt)}`}
        >
          <ContactActionButton
            action={removeContact}
            fields={{ account: userId, contact: contact.id }}
            label="Retirer"
            pendingLabel="Retrait…"
            confirm={{ message: CONFIRM_REMOVE(contact.handle), label: "Retirer" }}
          />
          <ContactActionButton
            action={blockMember}
            fields={{ account: userId, kind: "contact", value: contact.id }}
            label="Bloquer"
            pendingLabel="Blocage…"
            confirm={{ message: CONFIRM_BLOCK(contact.handle), label: "Bloquer" }}
            danger
          />
        </MemberRow>
      ))}
    </ul>
  );
}
