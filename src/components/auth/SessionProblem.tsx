import Link from "next/link";
import { LOGIN_PAGE } from "@/features/auth/redirects";
import { cn } from "@/lib/utils";
import AuthCard from "./AuthCard";
import { notice, textLink } from "./styles";

/**
 * Page de cartes sans mode utilisable : session impossible à vérifier (rien n'est affiché, pour ne
 * rien mélanger avec la démo de ce navigateur), ou session terminée (déconnexion, expiration).
 */
export default function SessionProblem({ kind, retry }: { kind: "unavailable" | "signed-out"; retry: string }) {
  if (kind === "signed-out") {
    return (
      <AuthCard
        back={{ href: "/", label: "Retour à l’accueil" }}
        title="Session terminée"
        lead="Vous n’êtes plus connecté. Connectez-vous pour retrouver vos cartes."
        note="Les cartes enregistrées dans votre compte restent disponibles."
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
      title="Connexion indisponible"
      lead="Votre session n’a pas pu être vérifiée pour le moment."
      note="Rien n’a été modifié : vos cartes restent dans votre compte."
    >
      <p role="alert" className={cn(notice, "text-danger")}>
        Le service des comptes ne répond pas. Réessayez dans un instant.
      </p>
      <Link href={retry} prefetch={false} className={textLink}>
        Réessayer
      </Link>
    </AuthCard>
  );
}
