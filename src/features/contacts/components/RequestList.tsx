import { formatAccountDate } from "@/features/account/format";
import { answerContactRequest, blockMember, cancelContactRequest } from "../actions";
import { CONFIRM_BLOCK, CONFIRM_REFUSE } from "../messages";
import type { ContactRequest } from "../types";
import ContactActionButton from "./ContactActionButton";
import MemberRow from "./MemberRow";

type Props = { userId: string; requests: readonly ContactRequest[]; direction: ContactRequest["direction"] };

const EMPTY = {
  incoming: "Aucune demande reçue en attente.",
  outgoing: "Aucune demande envoyée en attente.",
} as const;

/** Demandes reçues (accepter, refuser, bloquer) ou envoyées (annuler). */
export default function RequestList({ userId, requests, direction }: Props) {
  if (requests.length === 0) return <p className="m-0 text-[14px] text-mute">{EMPTY[direction]}</p>;
  return (
    <ul className="m-0 list-none p-0">
      {requests.map((request) => (
        <MemberRow
          key={request.id}
          handle={request.handle}
          displayName={request.displayName}
          avatarId={request.avatarId}
          detail={`${direction === "incoming" ? "Reçue" : "Envoyée"} le ${formatAccountDate(request.createdAt)}`}
        >
          {direction === "incoming" ? (
            <>
              <ContactActionButton
                action={answerContactRequest}
                fields={{ account: userId, request: request.id, answer: "accept" }}
                label="Accepter"
                pendingLabel="Acceptation…"
              />
              <ContactActionButton
                action={answerContactRequest}
                fields={{ account: userId, request: request.id, answer: "refuse" }}
                label="Refuser"
                pendingLabel="Refus…"
                confirm={{ message: CONFIRM_REFUSE(request.handle), label: "Refuser" }}
              />
              <ContactActionButton
                action={blockMember}
                fields={{ account: userId, kind: "request", value: request.id }}
                label="Bloquer"
                pendingLabel="Blocage…"
                confirm={{ message: CONFIRM_BLOCK(request.handle), label: "Bloquer" }}
                danger
              />
            </>
          ) : (
            <ContactActionButton
              action={cancelContactRequest}
              fields={{ account: userId, request: request.id }}
              label="Annuler la demande"
              pendingLabel="Annulation…"
            />
          )}
        </MemberRow>
      ))}
    </ul>
  );
}
