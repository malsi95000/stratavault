import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import { textLink } from "@/components/auth/styles";
import { MY_PROFILE_PAGE } from "@/features/profiles/paths";

/** Identifiant inconnu, mal formé ou profil non visible : une seule réponse, sans plus de détail. */
export default function MemberProfileNotFound() {
  return (
    <AuthCard
      back={{ href: MY_PROFILE_PAGE, label: "Retour à mon profil" }}
      title="Profil introuvable"
      lead="Aucun profil visible pour vous ne porte cet identifiant. Vérifiez son orthographe exacte."
      note="Les profils se trouvent uniquement par leur identifiant exact."
    >
      <Link href={MY_PROFILE_PAGE} className={textLink}>
        Aller à mon profil
      </Link>
    </AuthCard>
  );
}
