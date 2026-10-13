"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { updatePassword } from "@/features/auth/actions";
import { PASSWORD_HINT } from "@/features/auth/messages";
import { newPasswordSchema } from "@/features/auth/schemas";
import AuthField from "./AuthField";
import { DemoButton, DemoForm } from "./DemoAccess";
import FormMessage from "./FormMessage";
import NotConfiguredNotice from "./NotConfiguredNotice";
import { form as formClass, primaryButton } from "./styles";
import { useAuthAction } from "./useAuthAction";

export default function NewPasswordForm({ accountsEnabled }: { accountsEnabled: boolean }) {
  const demoFormId = useId();
  const form = useForm({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: "", confirm: "" } });
  const { state, formAction, onSubmit, pending } = useAuthAction(form, updatePassword);
  const { errors } = form.formState;

  return (
    <>
      {!accountsEnabled && <NotConfiguredNotice />}
      <form action={formAction} onSubmit={onSubmit} noValidate aria-busy={pending} className={formClass}>
        <fieldset disabled={!accountsEnabled} className="contents">
          <AuthField
            id="password"
            label="Nouveau mot de passe"
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
            {pending ? "Enregistrement…" : "Enregistrer le mot de passe"} <span aria-hidden="true">→</span>
          </Button>
        </fieldset>
        {!accountsEnabled && <DemoButton form={demoFormId} />}
      </form>
      {!accountsEnabled && <DemoForm id={demoFormId} />}
      <FormMessage state={state} />
    </>
  );
}
