import type { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";
import NewPasswordForm from "@/components/auth/NewPasswordForm";
import { DEMO_NOTE } from "@/features/auth/messages";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function NouveauMotDePassePage() {
  const accountsEnabled = isSupabaseConfigured();

  return (
    <AuthCard
      back={{ href: "/connexion", label: "Retour à la connexion" }}
      title="Nouveau mot de passe"
      lead="Choisissez un nouveau mot de passe pour votre compte."
      note={accountsEnabled ? "Le mot de passe est vérifié par Supabase Auth et n’est jamais stocké en clair." : DEMO_NOTE}
    >
      <NewPasswordForm accountsEnabled={accountsEnabled} />
    </AuthCard>
  );
}
