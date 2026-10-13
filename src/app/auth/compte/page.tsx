import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import { notice, primaryButton, secondaryButton, textLink } from "@/components/auth/styles";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { LOGIN_PAGE, safeNextPath } from "@/features/auth/redirects";
import { getCurrentUser } from "@/lib/supabase/user";

export const metadata: Metadata = { title: "Compte ouvert", robots: { index: false } };

// Étape intermédiaire après un lien reçu par e-mail (confirmEmailLink) : le jeton vient d'ouvrir une
// session. Un tiers peut avoir transmis un lien reçu pour SON compte (connexion forcée) : l'adresse
// du compte ouvert est affichée avant d'entrer, avec de quoi se déconnecter tout de suite.
export default async function AccountOpenedPage({ searchParams }: PageProps<"/auth/compte">) {
  const { next } = await searchParams;
  const target = safeNextPath(typeof next === "string" ? next : undefined);
  const user = await getCurrentUser();

  if (!user) {
    return (
      <AuthCard
        back={{ href: "/", label: "Retour à l’accueil" }}
        title="Aucune session"
        lead="Aucun compte n’est ouvert dans ce navigateur."
        note="Les liens envoyés par e-mail ne servent qu’une fois et pour une durée limitée."
      >
        <Link href={LOGIN_PAGE} className={textLink}>
          Aller à la connexion
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      back={{ href: "/", label: "Retour à l’accueil" }}
      title="Compte ouvert"
      lead="Vérifiez l’adresse du compte avant de continuer."
      note="Vous n’avez utilisé que vos propres liens ? Vous pouvez continuer sans crainte."
    >
      <p className={notice}>
        Vous êtes connecté au compte{" "}
        <strong className="break-all text-ink">{user.email ?? "sans adresse e-mail"}</strong>.
      </p>
      <p className={notice}>
        Ce n’est pas votre adresse ? Quelqu’un vous a peut-être transmis un lien reçu pour son propre compte :
        n’y enregistrez rien et déconnectez-vous.
      </p>
      <Button asChild variant="panel" size="panel" className={primaryButton}>
        <Link href={target}>
          Continuer <span aria-hidden="true">→</span>
        </Link>
      </Button>
      <form action={signOut}>
        <Button type="submit" variant="panel" size="panel" className={secondaryButton}>
          Ce n’est pas mon compte — se déconnecter
        </Button>
      </form>
    </AuthCard>
  );
}
