"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import AuthField from "@/components/auth/AuthField";
import { fieldError, fieldHint, form as formClass, input, label } from "@/components/auth/styles";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveProfile } from "../actions";
import { HANDLE_HINT, VISIBILITY_HINTS, VISIBILITY_LABELS } from "../messages";
import { profileSchema, type ProfileInput, type ProfileValues } from "../schemas";
import { HANDLE_MAX } from "../handle";
import { BIO_MAX, DISPLAY_NAME_MAX } from "../text";
import { PROFILE_VISIBILITIES, type ProfileFields } from "../types";
import ProfileFormMessage from "./ProfileFormMessage";
import { useProfileAction } from "./useProfileAction";

type Props = {
  /** Compte pour lequel la page a été ouverte (refusé par le serveur si la session a changé). */
  userId: string;
  /** Profil existant à modifier ; absent : formulaire de création. */
  profile?: ProfileFields;
};

const EMPTY: ProfileFields = { handle: "", displayName: "", bio: "", visibility: "members" };

/** Création (première visite de « Mon profil ») ou modification du profil. */
export default function ProfileForm({ userId, profile }: Props) {
  const creating = !profile;
  const form = useForm<ProfileInput, unknown, ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: profile ?? EMPTY,
  });
  const { state, onSubmit, pending } = useProfileAction(form, saveProfile, {
    account: userId,
    mode: creating ? "create" : "update",
  });
  const { errors } = form.formState;
  const bioError = errors.bio?.message;

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} className={cn(formClass, "gap-4")}>
      <AuthField
        id="profil-handle"
        label="Identifiant"
        hint={HANDLE_HINT}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={HANDLE_MAX + 1}
        required
        error={errors.handle?.message}
        {...form.register("handle")}
      />
      <AuthField
        id="profil-nom"
        label="Nom affiché"
        autoComplete="nickname"
        maxLength={DISPLAY_NAME_MAX * 2}
        required
        error={errors.displayName?.message}
        {...form.register("displayName")}
      />
      <div className="grid gap-[9px]">
        <label htmlFor="profil-bio" className={label}>
          Présentation (facultative)
        </label>
        <textarea
          id="profil-bio"
          rows={4}
          maxLength={BIO_MAX * 2}
          aria-invalid={bioError ? true : undefined}
          aria-describedby={cn("profil-bio-aide", bioError && "profil-bio-erreur")}
          className={cn(input, "w-full resize-y rounded-[3px] border")}
          {...form.register("bio")}
        />
        <p id="profil-bio-aide" className={fieldHint}>
          {BIO_MAX} caractères et 6 lignes au plus. Visible par ceux qui peuvent voir votre profil.
        </p>
        {bioError && (
          <p id="profil-bio-erreur" className={fieldError}>
            {bioError}
          </p>
        )}
      </div>
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className={cn(label, "mb-2")}>Qui peut voir mon profil</legend>
        {PROFILE_VISIBILITIES.map((value) => (
          <label key={value} className="flex items-start gap-3 text-[15px]">
            <input type="radio" value={value} className="mt-1 accent-acc" {...form.register("visibility")} />
            <span>
              {VISIBILITY_LABELS[value]}
              <span className="block text-[13px] text-mute">{VISIBILITY_HINTS[value]}</span>
            </span>
          </label>
        ))}
        {errors.visibility?.message && <p className={fieldError}>{errors.visibility.message}</p>}
      </fieldset>
      <ProfileFormMessage state={state} />
      <div>
        <Button type="submit" variant="panel" size="panel" disabled={pending}>
          {pending ? "Enregistrement…" : creating ? "Créer mon profil" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
