import type { PublicProfile } from "../types";
import ProfileAvatar from "./ProfileAvatar";

/** Profil d'un membre tel que les autres le voient : avatar, nom affiché, identifiant, présentation. */
export default function ProfileCard({ profile }: { profile: Pick<PublicProfile, "handle" | "displayName" | "bio" | "avatarId"> }) {
  return (
    <article className="flex flex-wrap items-start gap-5 rounded-[8px] border border-line bg-panel px-5 py-5">
      <ProfileAvatar avatarId={profile.avatarId} displayName={profile.displayName} />
      <div className="grid min-w-0 flex-1 gap-1">
        <h2 className="brut m-0 text-[24px] break-words">{profile.displayName}</h2>
        <p className="m-0 text-[14px] text-mute">@{profile.handle}</p>
        {profile.bio ? (
          // Texte brut (jamais du HTML) : React l'échappe ; les retours à la ligne sont gardés.
          <p className="mt-3 mb-0 max-w-[60ch] text-[15px] break-words whitespace-pre-line">{profile.bio}</p>
        ) : (
          <p className="mt-3 mb-0 text-[14px] text-mute">Pas encore de présentation.</p>
        )}
      </div>
    </article>
  );
}
