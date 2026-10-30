import Link from "next/link";
import type { ReactNode } from "react";
import ProfileAvatar from "@/features/profiles/components/ProfileAvatar";
import { HIDDEN_MEMBER } from "../messages";
import { profilePath } from "@/features/profiles/paths";

type Props = {
  /** Identifiant du membre ; null si son profil ne vous est plus visible (demande envoyée). */
  handle: string | null;
  /** Nom affiché ; null si le profil n'est pas (ou plus) visible : seul l'identifiant est montré. */
  displayName: string | null;
  avatarId?: string | null;
  /** Ligne d'information sous l'identifiant (« depuis le… »). */
  detail?: string;
  /** Boutons d'action. */
  children?: ReactNode;
};

/** Une ligne d'une liste de la page « Contacts » : avatar, nom, identifiant (lien vers le profil), actions. */
export default function MemberRow({ handle, displayName, avatarId = null, detail, children }: Props) {
  const name = displayName ?? (handle ? `@${handle}` : HIDDEN_MEMBER);
  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
      <ProfileAvatar avatarId={displayName ? avatarId : null} displayName={name} size={40} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-medium break-words">{name}</span>
        {handle && displayName && (
          <Link href={profilePath(handle)} prefetch={false} className="text-[13px] text-mute underline underline-offset-3 hover:text-ink">
            @{handle}
          </Link>
        )}
        {detail && <span className="text-[12px] text-mute">{detail}</span>}
      </div>
      {children && <div className="flex flex-wrap items-start gap-2">{children}</div>}
    </li>
  );
}
