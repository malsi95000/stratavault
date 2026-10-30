import Link from "next/link";
import { navLink } from "@/components/auth/styles";
import ReportContentLink from "@/components/legal/ReportContentLink";
import { Card } from "@/components/ui/card";
import { formatAccountDate } from "@/features/account/format";
import { formatBankDate } from "@/features/bank/bankItems";
import { listMapInvitations, listSharedWithMe } from "@/lib/supabase/sharing";
import { createClient } from "@/lib/supabase/server";
import { answerInvitation, leaveMap } from "../actions";
import { CONFIRM_LEAVE, CONFIRM_REFUSE_INVITATION, JOIN_DISCLOSURE, ROLE_LABELS, ownerLabel } from "../messages";
import { sharedMapPath } from "../paths";
import type { MapInvitation, SharedMap } from "../types";
import SharingActionButton from "./SharingActionButton";

const FAILED = "Impossible de charger les cartes partagées avec vous : rechargez la page.";
const CARD = "flex-row flex-wrap items-center gap-3 rounded-[8px] border border-line bg-panel px-4 py-3.5 text-[15px] text-ink shadow-none ring-0";

async function readLists(): Promise<{ maps: SharedMap[]; invitations: MapInvitation[] } | null> {
  const db = await createClient();
  if (!db) return null;
  try {
    const [maps, invitations] = await Promise.all([listSharedWithMe(db), listMapInvitations(db)]);
    return { maps, invitations };
  } catch {
    return null;
  }
}

function InvitationCard({ userId, invitation }: { userId: string; invitation: MapInvitation }) {
  return (
    <Card className={CARD}>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <h3 className="brut m-0 text-[17px] break-words">{invitation.mapName}</h3>
        <p className="m-0 text-[12.5px] text-mute">
          {ROLE_LABELS[invitation.role]} · de {ownerLabel(invitation.ownerHandle, invitation.ownerName)} · valable jusqu’au{" "}
          {formatAccountDate(invitation.expiresAt)}
        </p>
        <ReportContentLink
          className="justify-self-start"
          target={{ kind: "shared-map", mapName: invitation.mapName, owner: ownerLabel(invitation.ownerHandle, invitation.ownerName) }}
        />
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <SharingActionButton
          action={answerInvitation}
          fields={{ account: userId, invitation: invitation.id, answer: "accept" }}
          label="Rejoindre"
          pendingLabel="Entrée…"
          openMapOnSuccess
        />
        <SharingActionButton
          action={answerInvitation}
          fields={{ account: userId, invitation: invitation.id, answer: "refuse" }}
          label="Refuser"
          pendingLabel="Refus…"
          confirm={{ message: CONFIRM_REFUSE_INVITATION(invitation.mapName), label: "Refuser" }}
        />
      </div>
    </Card>
  );
}

function SharedMapCard({ userId, map }: { userId: string; map: SharedMap }) {
  const date = formatBankDate(map.updated);
  return (
    <Card className={CARD}>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <h3 className="brut m-0 text-[17px] break-words">{map.name}</h3>
        <p className="m-0 text-[12.5px] text-mute">
          {ROLE_LABELS[map.role]} · de {ownerLabel(map.ownerHandle, map.ownerName)}
        </p>
        <p className="m-0 text-[12.5px] text-mute">{[date, map.stats].filter(Boolean).join(" — ")}</p>
        <ReportContentLink
          className="justify-self-start"
          target={{ kind: "shared-map", mapName: map.name, owner: ownerLabel(map.ownerHandle, map.ownerName) }}
        />
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <Link href={sharedMapPath(map.id)} className={navLink}>
          {map.role === "editor" ? "Coopérer" : "Consulter"}
        </Link>
        <SharingActionButton
          action={leaveMap}
          fields={{ account: userId, map: map.id }}
          label="Quitter"
          pendingLabel="Départ…"
          confirm={{ message: CONFIRM_LEAVE(map.name), label: "Quitter" }}
          danger
        />
      </div>
    </Card>
  );
}

/**
 * Banque, mode compte : invitations reçues (rejoindre, refuser) et cartes « Partagées avec moi »
 * (rôle, propriétaire ; ouvrir dans l'éditeur coopératif, quitter).
 */
export default async function SharedWithMe({ userId }: { userId: string }) {
  const lists = await readLists();
  return (
    <section aria-labelledby="partagees" className="mt-12 border-t border-line pt-6">
      <h2 id="partagees" className="brut mb-2 text-[19px]">
        Partagées avec moi
      </h2>
      {!lists ? (
        <p role="alert" className="mt-2.5 text-mute">
          {FAILED}
        </p>
      ) : (
        <div className="grid gap-3.5">
          {lists.invitations.length > 0 && (
            <>
              <h3 className="m-0 text-[13px] tracking-[.08em] text-mute uppercase">Invitations reçues ({lists.invitations.length})</h3>
              <p className="m-0 max-w-[62ch] text-[13px] text-mute">{JOIN_DISCLOSURE}</p>
              <ul className="m-0 grid list-none gap-3 p-0">
                {lists.invitations.map((invitation) => (
                  <li key={invitation.id}>
                    <InvitationCard userId={userId} invitation={invitation} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {lists.maps.length === 0 ? (
            <p className="m-0 text-mute">
              Aucune carte partagée avec vous pour l’instant. Un membre peut vous inviter s’il est votre contact, ou vous
              envoyer un lien d’invitation.
            </p>
          ) : (
            <ul className="m-0 grid list-none gap-3 p-0">
              {lists.maps.map((map) => (
                <li key={map.id}>
                  <SharedMapCard userId={userId} map={map} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
