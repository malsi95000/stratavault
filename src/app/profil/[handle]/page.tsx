import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SessionProblem from "@/components/auth/SessionProblem";
import ReportContentLink from "@/components/legal/ReportContentLink";
import { navLink } from "@/components/auth/styles";
import { getPageSession } from "@/features/auth/getPageSession";
import ProfileContactActions from "@/features/contacts/components/ProfileContactActions";
import { relationWith, type Relation } from "@/features/contacts/relation";
import { checkAttempt, clientIp, trustedProxyHops } from "@/features/auth/rateLimit";
import ProfileCard from "@/features/profiles/components/ProfileCard";
import ProfileNoAccount from "@/features/profiles/components/ProfileNoAccount";
import ProfileShell from "@/features/profiles/components/ProfileShell";
import { isHandleFormatOk, normalizeHandle } from "@/features/profiles/handle";
import { LOOKUP_RATE_LIMITED } from "@/features/profiles/messages";
import { MY_PROFILE_PAGE, profilePath } from "@/features/profiles/paths";
import type { PublicProfile } from "@/features/profiles/types";
import { getContactOverview } from "@/lib/supabase/contacts";
import { ProfileDataError, findProfile } from "@/lib/supabase/profiles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profil d’un membre", robots: { index: false } };

type Lookup =
  | { status: "found"; profile: PublicProfile }
  | { status: "none" }
  | { status: "limited" }
  | { status: "unavailable" };

/** Profil d'identifiant exact `handle`, s'il est visible ; limite par IP, puis celle de la base par compte. */
async function lookUp(handle: string): Promise<Lookup> {
  if (checkAttempt("profileLookup", clientIp(await headers(), trustedProxyHops())) !== "allowed") {
    return { status: "limited" };
  }
  const db = await createClient();
  if (!db) return { status: "unavailable" };
  try {
    const profile = await findProfile(db, handle);
    return profile ? { status: "found", profile } : { status: "none" };
  } catch (error) {
    if (error instanceof ProfileDataError && error.kind === "rate-limited") return { status: "limited" };
    return { status: "unavailable" };
  }
}

/** Relation du compte connecté avec le membre `handle` ; null si les contacts sont illisibles. */
async function readRelation(handle: string): Promise<Relation | null> {
  const db = await createClient();
  if (!db) return null;
  try {
    return relationWith(await getContactOverview(db), handle);
  } catch {
    return null;
  }
}

// Profil d'un membre, désigné par son identifiant exact, réservé aux comptes connectés. Identifiant
// inconnu ou profil masqué (y compris quand l'un des deux comptes a bloqué l'autre) : la même page
// « introuvable » (rien ne révèle qu'un profil existe). Boutons de contact selon la relation, et lien
// de signalement par e-mail (profil d'un autre membre).
export default async function MemberProfilePage({ params }: PageProps<"/profil/[handle]">) {
  const session = await getPageSession();
  if (session.kind === "unavailable" || session.kind === "signed-out") {
    return <SessionProblem kind={session.kind} retry={MY_PROFILE_PAGE} />;
  }
  if (session.kind === "demo") return <ProfileNoAccount />;

  const { handle: raw } = await params;
  const handle = normalizeHandle(decodeURIComponentSafe(raw));
  if (!isHandleFormatOk(handle)) notFound();
  // Une seule adresse par profil : /profil/Alice mène à /profil/alice.
  if (handle !== raw) redirect(profilePath(handle));

  const lookup = await lookUp(handle);
  if (lookup.status === "none") notFound();
  if (lookup.status === "unavailable") return <SessionProblem kind="unavailable" retry={profilePath(handle)} />;
  if (lookup.status === "limited") {
    return (
      <ProfileShell title="Profil d’un membre">
        <p role="alert" className="m-0 text-danger">
          {LOOKUP_RATE_LIMITED}
        </p>
      </ProfileShell>
    );
  }

  const { profile } = lookup;
  const relation = profile.isSelf ? null : await readRelation(profile.handle);
  return (
    <ProfileShell title="Profil d’un membre">
      <ProfileCard profile={profile} />
      {!profile.isSelf &&
        (relation ? (
          <ProfileContactActions userId={session.account.userId} handle={profile.handle} relation={relation} />
        ) : (
          <p className="m-0 text-[14px] text-mute">Vos contacts sont momentanément indisponibles.</p>
        ))}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={MY_PROFILE_PAGE} className={navLink}>
          {profile.isSelf ? "Modifier mon profil" : "Mon profil"}
        </Link>
        {!profile.isSelf && <ReportContentLink target={{ kind: "profile", handle: profile.handle }} />}
      </div>
    </ProfileShell>
  );
}

/** Paramètre d'adresse décodé s'il est encore encodé (« %40alice ») ; tel quel s'il est mal formé. */
function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
