import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import { textLink } from "@/components/auth/styles";

/** Contacts en mode démo (ou comptes non configurés) : ils n'existent qu'avec un compte. */
export default function ContactsNoAccount() {
  return (
    <AuthCard
      back={{ href: "/espace", label: "Retour à mon espace" }}
      title="Contacts"
      lead="Les contacts entre membres n’existent qu’avec un compte. Le mode démo reste entièrement local : rien n’y est partagé."
      note="Créez un compte, puis votre profil, pour échanger avec d’autres membres."
    >
      <Link href="/espace" className={textLink}>
        Aller à mon espace
      </Link>
    </AuthCard>
  );
}
