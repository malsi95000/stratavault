import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import SessionProblem from "@/components/auth/SessionProblem";
import { textLink } from "@/components/auth/styles";
import { LOGIN_PAGE } from "@/features/auth/redirects";
import { getPageSession } from "@/features/auth/getPageSession";
import JoinByLink from "@/features/sharing/components/JoinByLink";
import SharingNoAccount from "@/features/sharing/components/SharingNoAccount";
import { INVITATION_PAGE } from "@/features/sharing/paths";

export const metadata: Metadata = {
  title: "Invitation à une carte",
  robots: { index: false },
  // Aucune adresse de provenance : le jeton reste dans le fragment, mais la prudence ne coûte rien.
  referrer: "no-referrer",
};

// Lien d'invitation à une carte partagée (« /invitation#<jeton> »). Le jeton est dans le fragment :
// le navigateur ne l'envoie jamais au serveur (ni dans les journaux de l'hébergeur, ni en en-tête
// Referer) ; la page le lit, le retire de l'adresse et l'envoie aux seules Server Actions d'aperçu et
// d'acceptation. Il faut être connecté : sans session, la page invite à se connecter puis à rouvrir
// le lien (le jeton n'est conservé nulle part).
export default async function InvitationPage() {
  const session = await getPageSession();
  if (session.kind === "unavailable") return <SessionProblem kind="unavailable" retry={INVITATION_PAGE} />;
  if (session.kind === "signed-out") {
    return (
      <AuthCard
        back={{ href: "/", label: "Retour à l’accueil" }}
        title="Invitation à une carte"
        lead="Connectez-vous (ou créez un compte), puis rouvrez le lien d’invitation reçu pour rejoindre la carte."
        note="Le lien n’est conservé nulle part : gardez le message qui le contient."
      >
        <Link href={LOGIN_PAGE} className={textLink}>
          Aller à la connexion
        </Link>
      </AuthCard>
    );
  }
  if (session.kind === "demo") return <SharingNoAccount />;
  return (
    <AuthCard
      back={{ href: "/espace", label: "Retour à mon espace" }}
      title="Invitation à une carte"
      lead="Un membre vous invite à rejoindre l’une de ses cartes."
      note="Vous pourrez quitter la carte à tout moment depuis votre espace (« Partagées avec moi »)."
    >
      <JoinByLink userId={session.account.userId} />
    </AuthCard>
  );
}
