import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import { textLink } from "@/components/auth/styles";

/** Partage des cartes en mode démo (ou comptes non configurés) : il n'existe qu'avec un compte. */
export default function SharingNoAccount() {
  return (
    <AuthCard
      back={{ href: "/espace", label: "Retour à mon espace" }}
      title="Cartes partagées"
      lead="Le partage des cartes et la coopération n’existent qu’avec un compte. Le mode démo reste entièrement local : rien n’y est partagé."
      note="Créez un compte, puis votre profil, pour partager une carte ou rejoindre celle d’un autre membre."
    >
      <Link href="/espace" className={textLink}>
        Aller à mon espace
      </Link>
    </AuthCard>
  );
}
