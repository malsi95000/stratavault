"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/features/auth/actions";
import { resetRequestSchema } from "@/features/auth/schemas";
import AuthField from "./AuthField";
import { DemoButton, DemoForm } from "./DemoAccess";
import FormMessage from "./FormMessage";
import NotConfiguredNotice from "./NotConfiguredNotice";
import { form as formClass, primaryButton } from "./styles";
import { useAuthAction } from "./useAuthAction";

export default function ForgotPasswordForm({ accountsEnabled }: { accountsEnabled: boolean }) {
  const demoFormId = useId();
  const form = useForm({ resolver: zodResolver(resetRequestSchema), defaultValues: { email: "" } });
  const { state, formAction, onSubmit, pending } = useAuthAction(form, requestPasswordReset);

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
            error={form.formState.errors.email?.message}
            {...form.register("email")}
          />
          <Button type="submit" variant="panel" size="panel" className={primaryButton}>
            {pending ? "Envoi…" : "Recevoir un lien"} <span aria-hidden="true">→</span>
          </Button>
        </fieldset>
        {!accountsEnabled && <DemoButton form={demoFormId} />}
      </form>
      {!accountsEnabled && <DemoForm id={demoFormId} />}
      <FormMessage state={state} />
    </>
  );
}
