import type { Metadata } from "next";
import Link from "next/link";
import SessionProblem from "@/components/auth/SessionProblem";
import { navLink } from "@/components/auth/styles";
import AccountSection from "@/features/account/components/AccountSection";
import { getPageSession } from "@/features/auth/getPageSession";
import AvatarForm from "@/features/profiles/components/AvatarForm";
import DeleteProfileButton from "@/features/profiles/components/DeleteProfileButton";
import FindProfileForm from "@/features/profiles/components/FindProfileForm";
import ProfileCard from "@/features/profiles/components/ProfileCard";
import ProfileForm from "@/features/profiles/components/ProfileForm";
import ProfileNoAccount from "@/features/profiles/components/ProfileNoAccount";
import ProfileShell from "@/features/profiles/components/ProfileShell";
import { MY_PROFILE_PAGE, profilePath } from "@/features/profiles/paths";
import type { OwnProfile } from "@/features/profiles/types";
import { getOwnProfile, listOwnAvatarObjects } from "@/lib/supabase/profiles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mon profil", robots: { index: false } };

const text = "m-0 max-w-[62ch] text-[14px] text-mute";

type OwnState = { profile: OwnProfile | null; leftoverFiles: boolean };

/**
 * Profil du compte (null : pas encore créé) et présence de fichiers d'avatar autres que l'avatar
 * actuel (effacement précédent qui a échoué : la page propose de les effacer) ; undefined si la
 * lecture du profil a échoué (jamais pris pour « pas de profil »).
 */
async function readOwnState(userId: string): Promise<OwnState | undefined> {
  const db = await createClient();
  if (!db) return undefined;
  let profile: OwnProfile | null;
  try {
    profile = await getOwnProfile(db, userId);
  } catch {
    return undefined;
  }
  if (!profile) return { profile, leftoverFiles: false };
  try {
    const files = await listOwnAvatarObjects(db);
    return { profile, leftoverFiles: files.some((name) => name !== profile.avatarId) };
  } catch {
    // Sans effet sur la page : les fichiers restants sont effacés au prochain changement d'avatar.
    return { profile, leftoverFiles: false };
  }
}

// « Mon profil » (mode compte) : à la première visite, formulaire de création (aucun profil n'est
// créé sans que la personne le demande) ; ensuite, aperçu, avatar, modification, recherche d'un membre
// par son identifiant exact et suppression du profil. Session vérifiée auprès de l'API Auth (getUser).
export default async function ProfilPage() {
  const session = await getPageSession();
  if (session.kind === "unavailable" || session.kind === "signed-out") {
    return <SessionProblem kind={session.kind} retry={MY_PROFILE_PAGE} />;
  }
  if (session.kind === "demo") return <ProfileNoAccount />;
  const { userId } = session.account;
  const own = await readOwnState(userId);
  if (own === undefined) return <SessionProblem kind="unavailable" retry={MY_PROFILE_PAGE} />;
  const { profile, leftoverFiles } = own;

  if (!profile) {
    return (
      <ProfileShell title="Mon profil" current="profil">
        <AccountSection id="creer" title="Créer mon profil">
          <p className={text}>
            Vous n’avez pas encore de profil. Il permet aux autres membres connectés de vous trouver par votre
            identifiant (jamais par votre adresse e-mail, qui n’y figure pas). Vos cartes restent privées.
          </p>
          <ProfileForm userId={userId} />
        </AccountSection>
      </ProfileShell>
    );
  }

  return (
    <ProfileShell title="Mon profil" current="profil">
      <AccountSection id="apercu" title="Aperçu">
        <ProfileCard profile={profile} />
        <p className={text}>
          {profile.visibility === "members"
            ? "Visible par les membres connectés qui connaissent votre identifiant."
            : "Visible par vos contacts seulement (et par les membres à qui vous envoyez une demande, tant qu’elle est en attente)."}
        </p>
        <div>
          <Link href={profilePath(profile.handle)} prefetch={false} className={navLink}>
            Voir ma page publique
          </Link>
        </div>
      </AccountSection>
      <AccountSection id="avatar" title="Avatar">
        <AvatarForm
          userId={userId}
          avatarId={profile.avatarId}
          displayName={profile.displayName}
          leftoverFiles={leftoverFiles}
        />
      </AccountSection>
      <AccountSection id="informations" title="Modifier mon profil">
        <ProfileForm userId={userId} profile={profile} />
      </AccountSection>
      <AccountSection id="trouver" title="Trouver un membre">
        <p className={text}>Par son identifiant exact uniquement : il n’existe ni annuaire, ni recherche par e-mail.</p>
        <FindProfileForm />
      </AccountSection>
      <AccountSection id="suppression" title="Supprimer mon profil" danger>
        <p className={text}>
          Supprime votre profil, son avatar, vos contacts et vos demandes de contact (les comptes que vous avez bloqués le
          restent) ; vous quittez les cartes partagées avec vous et les partages de vos cartes s’arrêtent. Vos éléments
          de la carte collective ne sont plus montrés aux autres membres : ils restent, et reviennent, signés, si vous
          recréez un profil. Votre compte et vos cartes restent. Vous pourrez recréer un profil plus tard.
        </p>
        <DeleteProfileButton userId={userId} />
      </AccountSection>
    </ProfileShell>
  );
}
