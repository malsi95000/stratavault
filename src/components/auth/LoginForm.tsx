"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { signIn } from "@/features/auth/actions";
import { signInSchema } from "@/features/auth/schemas";
import AuthField from "./AuthField";
import { DemoButton, DemoForm } from "./DemoAccess";
import FormMessage from "./FormMessage";
import NotConfiguredNotice from "./NotConfiguredNotice";
import { form as formClass, primaryButton, textLink } from "./styles";
import { useAuthAction } from "./useAuthAction";

type Props = {
  accountsEnabled: boolean;
  /** Page où ramener une fois connecté (revérifiée par l'action) ; absente : l'espace. */
  next?: string;
};

export default function LoginForm({ accountsEnabled, next }: Props) {
  const demoFormId = useId();
  const form = useForm({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });
  const { state, formAction, onSubmit, pending } = useAuthAction(form, signIn, next ? { next } : {});
  const { errors } = form.formState;

  return (
    <>
      {!accountsEnabled && <NotConfiguredNotice />}
      <form action={formAction} onSubmit={onSubmit} noValidate aria-busy={pending} className={formClass}>
        {next && <input type="hidden" name="next" value={next} />}
        <fieldset disabled={!accountsEnabled} className="contents">
          <AuthField
            id="email"
            label="Adresse e-mail"
            type="email"
            autoComplete="email"
            placeholder="vous@exemple.fr"
            required
            error={errors.email?.message}
            {...form.register("email")}
          />
          <AuthField
            id="password"
            label="Mot de passe"
            type="password"
            autoComplete="current-password"
            placeholder="Votre mot de passe"
            required
            error={errors.password?.message}
            {...form.register("password")}
          />
          <Button type="submit" variant="panel" size="panel" className={primaryButton}>
            {pending ? "Connexion…" : "Se connecter"} <span aria-hidden="true">→</span>
          </Button>
        </fieldset>
        <DemoButton form={demoFormId} />
      </form>
      <DemoForm id={demoFormId} />
      <FormMessage state={state} />

      <Link href="/inscription" className={textLink}>
        Pas de compte ? Créer un compte
      </Link>
      {accountsEnabled && (
        <Link href="/mot-de-passe-oublie" className={textLink}>
          Mot de passe oublié ?
        </Link>
      )}
    </>
  );
}
