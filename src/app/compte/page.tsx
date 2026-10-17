import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import SiteFooter from "@/components/SiteFooter";
import PageBackdrop from "@/components/backdrop/PageBackdrop";
import AccountBar from "@/components/auth/AccountBar";
import AuthCard from "@/components/auth/AuthCard";
import SessionProblem from "@/components/auth/SessionProblem";
import { textLink } from "@/components/auth/styles";
import { LOGIN_PAGE } from "@/features/auth/redirects";
import AccountPanel from "@/features/account/components/AccountPanel";
import { exportError } from "@/features/account/notices";
import { NOT_CONFIGURED } from "@/features/auth/messages";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_COOKIE } from "@/lib/supabase/cookies";
import { checkActiveAccount } from "@/lib/supabase/user";

export const metadata: Metadata = { title: "Mon compte", robots: { index: false } };

/** Page sans compte à afficher : comptes non configurés, ou mode démo choisi. */
function NoAccount({ lead }: { lead: string }) {
  return (
    <AuthCard
      back={{ href: "/espace", label: "Retour à mon espace" }}
      title="Mon compte"
      lead={lead}
      backdrop="relief"
      note="En mode démo, « Effacer les données de ce navigateur » se trouve dans votre espace."
    >
      <Link href="/espace" className={textLink}>
        Aller à mon espace
      </Link>
    </AuthCard>
  );
}

/**
 * Page sans session. Texte propre à /compte, sans la phrase de SessionProblem sur les cartes « qui
 * restent disponibles » : cette page est aussi re-rendue juste après la suppression du compte (la
 * Server Action efface les cookies), et ce texte y serait faux.
 */
function SignedOut() {
  return (
    <AuthCard
      back={{ href: "/", label: "Retour à l’accueil" }}
      title="Session terminée"
      lead="Vous n’êtes plus connecté. Connectez-vous pour accéder à votre compte."
      backdrop="relief"
      note="Cette page n’affiche que le compte connecté dans ce navigateur."
    >
      <Link href={LOGIN_PAGE} className={textLink}>
        Aller à la connexion
      </Link>
    </AuthCard>
  );
}

// « Mon compte » (RGPD, articles 15 à 20) : fiche du compte, téléchargement des données,
// changement du mot de passe et suppression du compte. Session vérifiée auprès de l'API Auth
// (getUser) : une copie d'un cookie de session révoquée n'ouvre pas cette page.
export default async function ComptePage({ searchParams }: PageProps<"/compte">) {
  if (!isSupabaseConfigured()) return <NoAccount lead={NOT_CONFIGURED} />;
  const check = await checkActiveAccount();
  if (check.status === "unavailable") return <SessionProblem kind="unavailable" retry="/compte" />;
  if (check.status === "signed-out") {
    const demo = (await cookies()).get(DEMO_COOKIE)?.value === "1";
    if (demo) return <NoAccount lead="Vous utilisez le mode démo, sans compte : vos cartes ne sont que dans ce navigateur." />;
    return <SignedOut />;
  }

  return (
    <>
      <PageBackdrop variant="relief" />
      <main className="mx-auto max-w-[760px] px-6 pt-8 pb-[90px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackLink href="/espace" label="Retour à mon espace" />
          <AccountBar />
        </div>
        <h1 className="brut mt-[30px] mb-8 text-[clamp(28px,5vw,44px)]">Mon compte</h1>
        <AccountPanel account={check.account} exportError={exportError(await searchParams)} />
      </main>
      <SiteFooter />
    </>
  );
}
