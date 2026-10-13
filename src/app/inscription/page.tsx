import type { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";
import SignupForm from "@/components/auth/SignupForm";
import { DEMO_NOTE } from "@/features/auth/messages";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Inscription" };

export default function InscriptionPage() {
  const accountsEnabled = isSupabaseConfigured();

  return (
    <AuthCard
      back={{ href: "/connexion", label: "Retour à la connexion" }}
      title="Créer votre compte"
      lead="Rejoignez votre espace stratégique pour organiser vos cartes, vos données et vos hypothèses."
      note={
        accountsEnabled
          ? "Un e-mail de confirmation vous sera envoyé. Le mot de passe n’est jamais stocké en clair."
          : DEMO_NOTE
      }
    >
      <SignupForm accountsEnabled={accountsEnabled} />
    </AuthCard>
  );
}
