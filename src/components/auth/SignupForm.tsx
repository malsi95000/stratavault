"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { signUp } from "@/features/auth/actions";
import { PASSWORD_HINT } from "@/features/auth/messages";
import { signUpSchema } from "@/features/auth/schemas";
import AuthField from "./AuthField";
import { DemoButton, DemoForm } from "./DemoAccess";
import FormMessage from "./FormMessage";
import NotConfiguredNotice from "./NotConfiguredNotice";
import SignupConsent from "./SignupConsent";
import { form as formClass, primaryButton } from "./styles";
import { useAuthAction } from "./useAuthAction";

export default function SignupForm({ accountsEnabled }: { accountsEnabled: boolean }) {
  const demoFormId = useId();
  const form = useForm({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", confirm: "" },
  });
  const { state, formAction, onSubmit, pending } = useAuthAction(form, signUp);
  const { errors } = form.formState;

  return (
    <>
      {!accountsEnabled && <NotConfiguredNotice />}
      <form action={formAction} onSubmit={onSubmit} noValidate aria-busy={pending} className={formClass}>
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
            autoComplete="new-password"
            placeholder="Choisissez un mot de passe"
            required
            hint={PASSWORD_HINT}
            error={errors.password?.message}
            {...form.register("password", { deps: ["confirm"] })}
          />
          <AuthField
            id="confirm-password"
            label="Confirmer le mot de passe"
            type="password"
            autoComplete="new-password"
            placeholder="Répétez votre mot de passe"
            required
            error={errors.confirm?.message}
            {...form.register("confirm")}
          />
          <Button type="submit" variant="panel" size="panel" className={primaryButton}>
            {pending ? "Création…" : "Créer mon compte"} <span aria-hidden="true">→</span>
          </Button>
          {accountsEnabled && <SignupConsent />}
        </fieldset>
        {!accountsEnabled && <DemoButton form={demoFormId} />}
      </form>
      {!accountsEnabled && <DemoForm id={demoFormId} />}
      <FormMessage state={state} />
    </>
  );
}
