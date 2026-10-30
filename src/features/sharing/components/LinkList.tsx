import { formatAccountDate } from "@/features/account/format";
import { revokeLink } from "../actions";
import { CONFIRM_REVOKE_LINK, ROLE_LABELS } from "../messages";
import type { MapLink } from "../types";
import SharingActionButton from "./SharingActionButton";

/** Liens d'invitation actifs d'une carte (jamais leur jeton) : révocation. */
export default function LinkList({ userId, links }: { userId: string; links: readonly MapLink[] }) {
  if (links.length === 0) return <p className="m-0 text-[14px] text-mute">Aucun lien actif.</p>;
  return (
    <ul className="m-0 list-none p-0">
      {links.map((link) => (
        <li key={link.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="font-medium">
              {ROLE_LABELS[link.role]} · {link.uses} / {link.maxUses} {link.maxUses > 1 ? "usages" : "usage"}
            </span>
            <span className="text-[12px] text-mute">
              Créé le {formatAccountDate(link.createdAt)}, valable jusqu’au {formatAccountDate(link.expiresAt)}
            </span>
          </div>
          <SharingActionButton
            action={revokeLink}
            fields={{ account: userId, link: link.id }}
            label="Révoquer"
            pendingLabel="Révocation…"
            confirm={{ message: CONFIRM_REVOKE_LINK, label: "Révoquer" }}
            danger
          />
        </li>
      ))}
    </ul>
  );
}
