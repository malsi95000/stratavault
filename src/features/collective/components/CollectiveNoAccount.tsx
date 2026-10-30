import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import { textLink } from "@/components/auth/styles";
import { COLLECTIVE_TITLE } from "../messages";

/** Carte collective en mode démo (ou comptes non configurés) : elle n'existe qu'avec un compte. */
export default function CollectiveNoAccount() {
  return (
    <AuthCard
      back={{ href: "/espace", label: "Retour à mon espace" }}
      title={COLLECTIVE_TITLE}
      lead="La carte collective réunit les contributions des membres connectés. Le mode démo reste entièrement local : rien n’y est partagé."
      note="Connectez-vous (ou créez un compte), puis votre profil, pour consulter la carte collective et y contribuer."
    >
      <Link href="/connexion" className={textLink}>
        Se connecter
      </Link>
    </AuthCard>
  );
}
