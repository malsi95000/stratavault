"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import AuthField from "@/components/auth/AuthField";
import FormMessage from "@/components/auth/FormMessage";
import { form as formClass } from "@/components/auth/styles";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { INITIAL_AUTH_STATE, type AuthFormState } from "@/features/auth/formState";
import { forgetDeletedAccount } from "@/features/editor/storageSession";
import { deleteMyAccount } from "../actions";
import { submitAccountDeletion } from "../deleteFlow";
import { DELETE_CONFIRMATION_WORD } from "../messages";
import { deleteAccountSchema } from "../schemas";

const dangerButton = "border-danger-line text-danger hover:border-danger";

const steps = {
  submit: (data: FormData) => deleteMyAccount(INITIAL_AUTH_STATE, data),
  forget: forgetDeletedAccount,
  // Rechargement complet : plus rien du compte ne reste en mémoire dans cet onglet.
  leave: (path: string) => window.location.assign(path),
};

/**
 * « Supprimer mon compte » : dialogue de confirmation (mot de passe + SUPPRIMER), Server Action
 * deleteMyAccount, puis, une fois le compte supprimé, effacement de sa copie locale, fermeture des
 * autres onglets du compte, et retour à l'accueil avec un message de confirmation
 * (submitAccountDeletion, qui fait ce nettoyage dans la suite de l'appel). Le dialogue demande
 * JavaScript : il n'y a pas d'envoi sans JavaScript.
 */
export default function DeleteAccountDialog({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const form = useForm({ resolver: zodResolver(deleteAccountSchema), defaultValues: { password: "", confirm: "" } });
  const [state, setState] = useState<AuthFormState>(INITIAL_AUTH_STATE);
  const [pending, startTransition] = useTransition();
  // Garde contre un double envoi ; reste vraie une fois le compte supprimé (la page va être quittée).
  const sending = useRef(false);
  const { errors } = form.formState;
  const deleted = state.status === "success";
  const busy = pending || deleted;

  function send(values: { password: string; confirm: string }) {
    if (sending.current) return;
    sending.current = true;
    const data = new FormData();
    data.append("account", userId);
    data.append("password", values.password);
    data.append("confirm", values.confirm);
    startTransition(async () => {
      const result = await submitAccountDeletion(userId, data, steps);
      setState(result);
      if (result.status === "success") return;
      sending.current = false;
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        if (message && (field === "password" || field === "confirm")) {
          form.setError(field, { type: "server", message }, { shouldFocus: true });
        }
      }
    });
  }

  // Validation zod dans le navigateur (revalidé par le serveur), puis envoi.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => void form.handleSubmit(send)(event);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Pas de fermeture pendant la suppression.
        if (busy) return;
        // Fermé (Annuler, Échap) : rien de la tentative ne reste (mot de passe, mot, messages).
        if (!next) {
          form.reset();
          setState(INITIAL_AUTH_STATE);
        }
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="panel" size="panel" className={dangerButton}>
          Supprimer mon compte
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form onSubmit={onSubmit} noValidate aria-busy={busy} className="grid gap-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="brut text-[22px] text-danger">Supprimer mon compte</AlertDialogTitle>
            <AlertDialogDescription className="text-[15px] text-foreground">
              Le compte <strong className="break-all">{email}</strong> et toutes ses cartes seront supprimés
              définitivement, et ses sessions prendront fin sur tous vos appareils. Pour garder vos cartes, téléchargez
              d’abord vos données.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className={formClass}>
            <AuthField
              id="delete-password"
              label="Mot de passe actuel"
              type="password"
              autoComplete="current-password"
              required
              error={errors.password?.message}
              {...form.register("password")}
            />
            <AuthField
              id="delete-confirm"
              label={`Tapez ${DELETE_CONFIRMATION_WORD} pour confirmer`}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              error={errors.confirm?.message}
              {...form.register("confirm")}
            />
            <FormMessage state={state} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={busy}>
              Annuler
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={busy}>
              {deleted ? "Compte supprimé…" : pending ? "Suppression…" : "Supprimer définitivement"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
