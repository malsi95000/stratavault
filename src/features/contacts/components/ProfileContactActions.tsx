import Link from "next/link";
import { navLink } from "@/components/auth/styles";
import { answerContactRequest, blockMember, cancelContactRequest, removeContact, sendContactRequest } from "../actions";
import { CONFIRM_BLOCK, CONFIRM_REFUSE, CONFIRM_REMOVE } from "../messages";
import { CONTACTS_PAGE } from "../paths";
import type { Relation } from "../relation";
import ContactActionButton from "./ContactActionButton";

type Props = { userId: string; handle: string; relation: Relation };

const STATUS: Record<Relation["kind"], string> = {
  none: "",
  contact: "Vous êtes en contact.",
  incoming: "Ce membre vous a envoyé une demande de contact.",
  outgoing: "Votre demande de contact est en attente.",
};

/**
 * Boutons de contact sur la page du profil d'un autre membre, selon la relation actuelle. Retirer,
 * refuser, annuler ou bloquer peut masquer ce profil (visibilité « contacts ») : après un succès, ces
 * boutons mènent à la page « Contacts » au lieu de relire la page.
 */
export default function ProfileContactActions({ userId, handle, relation }: Props) {
  const block = (kind: "handle" | "request" | "contact", value: string) => (
    <ContactActionButton
      action={blockMember}
      fields={{ account: userId, kind, value }}
      label="Bloquer"
      pendingLabel="Blocage…"
      confirm={{ message: CONFIRM_BLOCK(handle), label: "Bloquer" }}
      danger
      leaveToContacts
    />
  );

  return (
    <div className="grid gap-3">
      {STATUS[relation.kind] && <p className="m-0 text-[14px] text-mute">{STATUS[relation.kind]}</p>}
      <div className="flex flex-wrap items-start gap-2">
        {relation.kind === "none" && (
          <>
            <ContactActionButton
              action={sendContactRequest}
              fields={{ account: userId, handle }}
              label="Demander en contact"
              pendingLabel="Envoi…"
            />
            {block("handle", handle)}
          </>
        )}
        {relation.kind === "incoming" && (
          <>
            <ContactActionButton
              action={answerContactRequest}
              fields={{ account: userId, request: relation.requestId, answer: "accept" }}
              label="Accepter"
              pendingLabel="Acceptation…"
            />
            <ContactActionButton
              action={answerContactRequest}
              fields={{ account: userId, request: relation.requestId, answer: "refuse" }}
              label="Refuser"
              pendingLabel="Refus…"
              confirm={{ message: CONFIRM_REFUSE(handle), label: "Refuser" }}
              leaveToContacts
            />
            {block("request", relation.requestId)}
          </>
        )}
        {relation.kind === "outgoing" && (
          <>
            <ContactActionButton
              action={cancelContactRequest}
              fields={{ account: userId, request: relation.requestId }}
              label="Annuler la demande"
              pendingLabel="Annulation…"
              leaveToContacts
            />
            {block("request", relation.requestId)}
          </>
        )}
        {relation.kind === "contact" && (
          <>
            <ContactActionButton
              action={removeContact}
              fields={{ account: userId, contact: relation.contactId }}
              label="Retirer des contacts"
              pendingLabel="Retrait…"
              confirm={{ message: CONFIRM_REMOVE(handle), label: "Retirer" }}
              leaveToContacts
            />
            {block("contact", relation.contactId)}
          </>
        )}
        <Link href={CONTACTS_PAGE} className={navLink}>
          Mes contacts
        </Link>
      </div>
    </div>
  );
}
