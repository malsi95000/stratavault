import type { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { DEMO_NOTE } from "@/features/auth/messages";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function MotDePasseOubliePage() {
  const accountsEnabled = isSupabaseConfigured();

  return (
    <AuthCard
      back={{ href: "/connexion", label: "Retour à la connexion" }}
      title="Mot de passe oublié"
      lead="Indiquez votre adresse e-mail : vous recevrez un lien pour choisir un nouveau mot de passe."
      note={accountsEnabled ? "Le lien reçu par e-mail n’est valable qu’une fois et pour une durée limitée." : DEMO_NOTE}
    >
      <ForgotPasswordForm accountsEnabled={accountsEnabled} />
    </AuthCard>
  );
}
