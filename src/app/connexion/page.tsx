import type { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";
import ClearAccountCopies from "@/components/auth/ClearAccountCopies";
import LoginForm from "@/components/auth/LoginForm";
import PrivacyLink from "@/components/auth/PrivacyLink";
import { notice } from "@/components/auth/styles";
import { loginPageError } from "@/features/auth/messages";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { checkCurrentUser } from "@/lib/supabase/user";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Connexion" };

export default async function ConnexionPage({ searchParams }: PageProps<"/connexion">) {
  const { erreur } = await searchParams;
  const linkError = loginPageError(erreur);
  const accountsEnabled = isSupabaseConfigured();
  // Aucune session (vérification aboutie, pas une panne passagère) : rien d'un compte ne doit rester ici.
  const signedOut = accountsEnabled && (await checkCurrentUser()).status === "signed-out";

  return (
    <AuthCard
      back={{ href: "/", label: "Retour à l’accueil" }}
      title="Votre espace stratégique"
      lead="Connectez-vous pour retrouver vos cartes, vos données et vos hypothèses sur le terrain."
      note={
        accountsEnabled
          ? "Mot de passe vérifié par Supabase Auth : il n’est jamais stocké en clair."
          : "Passerelle de démonstration — aucune donnée de connexion n’est enregistrée."
      }
    >
      {linkError && (
        <p role="alert" className={cn(notice, "text-danger")}>
          {linkError}
        </p>
      )}
      <LoginForm accountsEnabled={accountsEnabled} />
      <PrivacyLink />
      {signedOut && <ClearAccountCopies />}
    </AuthCard>
  );
}
