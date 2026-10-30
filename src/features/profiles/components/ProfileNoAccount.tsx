import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import { textLink } from "@/components/auth/styles";

/** Profils en mode démo (ou comptes non configurés) : ils n'existent qu'avec un compte. */
export default function ProfileNoAccount() {
  return (
    <AuthCard
      back={{ href: "/espace", label: "Retour à mon espace" }}
      title="Profils"
      lead="Les profils et les pages des membres n’existent qu’avec un compte. Le mode démo reste entièrement local : rien n’y est partagé."
      note="Créez un compte pour avoir un profil."
    >
      <Link href="/espace" className={textLink}>
        Aller à mon espace
      </Link>
    </AuthCard>
  );
}
