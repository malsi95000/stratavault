import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import ConfirmLinkButton from "@/components/auth/ConfirmLinkButton";
import { form as formClass, notice, textLink } from "@/components/auth/styles";
import { confirmEmailLink } from "@/features/auth/actions";
import { isRecoveryLink, parseEmailLink } from "@/features/auth/emailLink";
import { LINK_INVALID, LINK_RATE_LIMITED } from "@/features/auth/messages";
import { AFTER_SIGN_IN, LOGIN_PAGE } from "@/features/auth/redirects";
import { getCurrentUser } from "@/lib/supabase/user";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Confirmation", robots: { index: false } };

// Arrivée depuis un lien envoyé par e-mail. La page ne consomme pas le jeton : elle demande un clic
// (POST vers la Server Action confirmEmailLink). Voir la documentation de cette action.
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const params = await searchParams;
  const link = parseEmailLink((name) => params[name]);
  const signedIn = (await getCurrentUser()) !== null;
  // Lien absent, invalide ou refusé par Supabase (`?erreur=lien`, posé par confirmEmailLink), ou trop
  // d'essais (`?erreur=trop`) : message affiché ici, car /connexion renverrait un utilisateur connecté
  // vers /espace sans rien dire.
  if (!link) return <LinkError signedIn={signedIn} limited={params.erreur === "trop"} />;

  const recovery = isRecoveryLink(link);

  return (
    <AuthCard
      back={{ href: "/", label: "Retour à l’accueil" }}
      title={recovery ? "Mot de passe oublié" : "Confirmer l’adresse"}
      lead={
        recovery
          ? "Cliquez sur « Continuer » pour choisir un nouveau mot de passe."
          : "Cliquez sur « Continuer » pour confirmer votre adresse e-mail et ouvrir votre session."
      }
      note="Le lien reçu par e-mail n’est valable qu’une fois et pour une durée limitée."
    >
      <p className={notice}>
        N’utilisez ce lien que si vous l’avez vous-même demandé : il ouvre le compte auquel il a été envoyé.
      </p>
      {signedIn && (
        <p className={notice}>Vous êtes déjà connecté : continuer remplacera votre session par celle de ce lien.</p>
      )}
      <form action={confirmEmailLink} className={formClass}>
        {link.kind === "otp" ? (
          <>
            <input type="hidden" name="token_hash" value={link.tokenHash} />
            <input type="hidden" name="type" value={link.type} />
          </>
        ) : (
          <input type="hidden" name="code" value={link.code} />
        )}
        <input type="hidden" name="next" value={link.next} />
        <ConfirmLinkButton />
      </form>
    </AuthCard>
  );
}

function LinkError({ signedIn, limited }: { signedIn: boolean; limited: boolean }) {
  return (
    <AuthCard
      back={{ href: "/", label: "Retour à l’accueil" }}
      title={limited ? "Trop de tentatives" : "Lien invalide"}
      lead="Les liens envoyés par e-mail ne servent qu’une fois et pour une durée limitée."
      note="Aucune modification n’a été faite sur votre compte."
    >
      <p role="alert" className={cn(notice, "text-danger")}>
        {limited ? LINK_RATE_LIMITED : LINK_INVALID}
      </p>
      <Link href="/mot-de-passe-oublie" className={textLink}>
        Demander un nouveau lien de réinitialisation
      </Link>
      <Link href={signedIn ? AFTER_SIGN_IN : LOGIN_PAGE} className={textLink}>
        {signedIn ? "Aller à mon espace stratégique" : "Aller à la connexion"}
      </Link>
    </AuthCard>
  );
}
