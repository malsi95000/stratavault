import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SessionProblem from "@/components/auth/SessionProblem";
import { navLink } from "@/components/auth/styles";
import AccountSection from "@/features/account/components/AccountSection";
import { getPageSession } from "@/features/auth/getPageSession";
import { CONTACTS_PAGE } from "@/features/contacts/paths";
import ProfileShell from "@/features/profiles/components/ProfileShell";
import { MY_PROFILE_PAGE } from "@/features/profiles/paths";
import CreateLinkForm from "@/features/sharing/components/CreateLinkForm";
import InviteContactForm from "@/features/sharing/components/InviteContactForm";
import LinkList from "@/features/sharing/components/LinkList";
import { MemberList, SentInvitationList } from "@/features/sharing/components/MemberList";
import SharingNoAccount from "@/features/sharing/components/SharingNoAccount";
import { HELP } from "@/features/sharing/components/styles";
import { INVITATION_DAYS, MAX_ACTIVE_LINKS, MAX_MAP_SEATS } from "@/features/sharing/limits";
import { ROLE_HELP, SHARING_NO_PROFILE } from "@/features/sharing/messages";
import { INVITE_ANCHOR, shareSettingsPath, sharedMapPath } from "@/features/sharing/paths";
import { sharingRefSchema } from "@/features/sharing/schemas";
import { listContacts } from "@/lib/supabase/contacts";
import { getOwnProfile } from "@/lib/supabase/profiles";
import { createClient } from "@/lib/supabase/server";
import { getMapShares, getOwnMapName } from "@/lib/supabase/sharing";

export const metadata: Metadata = { title: "Partager une carte", robots: { index: false } };

/** Carte, profil, partages et contacts du compte ; undefined si une lecture échoue, null si la carte n'est pas à lui. */
async function readState(userId: string, mapId: string) {
  const db = await createClient();
  if (!db) return undefined;
  try {
    const name = await getOwnMapName(db, userId, mapId);
    if (name === null) return null;
    const [profile, shares, contacts] = await Promise.all([
      getOwnProfile(db, userId),
      getMapShares(db, mapId),
      listContacts(db),
    ]);
    return { name, profile, shares, contacts };
  } catch {
    return undefined;
  }
}

// « Partager » une carte du compte (propriétaire seulement) : membres (rôle, retrait), invitation
// d'un contact, invitations en attente, liens d'invitation (création, révocation). Session vérifiée
// auprès de l'API Auth (getUser) ; la base revérifie que la carte est au compte à chaque opération.
export default async function ShareMapPage({ params }: PageProps<"/espace/partage/[id]">) {
  const { id } = await params;
  if (!sharingRefSchema.safeParse(id).success) notFound();
  const session = await getPageSession();
  if (session.kind === "unavailable" || session.kind === "signed-out") {
    return <SessionProblem kind={session.kind} retry={shareSettingsPath(id)} />;
  }
  if (session.kind === "demo") return <SharingNoAccount />;
  const { userId } = session.account;
  const state = await readState(userId, id);
  if (state === undefined) return <SessionProblem kind="unavailable" retry={shareSettingsPath(id)} />;
  if (state === null) notFound();
  const { name, profile, shares, contacts } = state;
  const taken = new Set([...shares.members.map((m) => m.handle), ...shares.invitations.map((i) => i.handle)]);
  const invitable = contacts.filter((c) => !taken.has(c.handle));

  return (
    <ProfileShell title={`Partager « ${name} »`}>
      <p className={HELP}>
        {ROLE_HELP} Les membres voient votre identifiant et votre nom affiché, et le nom affiché de celui qui
        modifie la carte. Au plus {MAX_MAP_SEATS} membres et invitations en attente.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={sharedMapPath(id)} className={navLink}>
          Coopérer sur cette carte
        </Link>
      </div>
      {!profile ? (
        <AccountSection id="profil" title="Profil requis">
          <p className={HELP}>{SHARING_NO_PROFILE}</p>
          <div>
            <Link href={MY_PROFILE_PAGE} className={navLink}>
              Créer mon profil
            </Link>
          </div>
        </AccountSection>
      ) : (
        <>
          <AccountSection id="membres" title={`Membres (${shares.members.length})`}>
            <MemberList userId={userId} members={shares.members} />
          </AccountSection>
          <AccountSection id={INVITE_ANCHOR} title="Inviter un contact">
            {invitable.length > 0 ? (
              <>
                <p className={HELP}>
                  Le contact reçoit l’invitation dans son espace ; elle reste valable {INVITATION_DAYS} jours.
                </p>
                <InviteContactForm userId={userId} mapId={id} contacts={invitable} />
              </>
            ) : (
              <>
                <p className={HELP}>
                  {contacts.length === 0
                    ? "Vous n’avez pas encore de contact à inviter. Ajoutez-en depuis la page « Contacts », ou créez un lien d’invitation."
                    : "Tous vos contacts sont déjà membres ou invités."}
                </p>
                <div>
                  <Link href={CONTACTS_PAGE} className={navLink}>
                    Contacts
                  </Link>
                </div>
              </>
            )}
          </AccountSection>
          <AccountSection id="invitations" title={`Invitations en attente (${shares.invitations.length})`}>
            <SentInvitationList userId={userId} invitations={shares.invitations} />
          </AccountSection>
          <AccountSection id="liens" title={`Liens d’invitation (${shares.links.length})`}>
            <p className={HELP}>
              Toute personne connectée qui ouvre le lien peut rejoindre la carte avec le rôle choisi, dans la limite du
              nombre d’usages et de la durée. Ne le confiez qu’à des personnes de confiance ; révoquez-le s’il circule
              trop. Au plus {MAX_ACTIVE_LINKS} liens actifs.
            </p>
            <CreateLinkForm userId={userId} mapId={id} />
            <LinkList userId={userId} links={shares.links} />
          </AccountSection>
        </>
      )}
    </ProfileShell>
  );
}
