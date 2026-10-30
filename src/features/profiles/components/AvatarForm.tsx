"use client";

import { useActionState, useState, type ChangeEvent, type FormEvent } from "react";
import { fieldError, label } from "@/components/auth/styles";
import { Button } from "@/components/ui/button";
import { removeAvatar, uploadAvatar } from "../actions";
import { INITIAL_PROFILE_STATE } from "../formState";
import { AVATAR_TOO_LARGE } from "../messages";
import ProfileAvatar from "./ProfileAvatar";
import ProfileFormMessage from "./ProfileFormMessage";

/** Taille maximale du fichier choisi (vérifiée aussi par le serveur, avatarImage.ts). */
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp";

type Props = {
  userId: string;
  avatarId: string | null;
  displayName: string;
  /** Fichiers d'avatar restés après un effacement qui a échoué : le bouton d'effacement reste proposé. */
  leftoverFiles?: boolean;
};

/**
 * Avatar du profil : envoi d'une image (PNG, JPEG ou WebP, 2 Mo au plus), ré-encodée par le serveur
 * en WebP 256 × 256 sans métadonnées, ou retrait. Fonctionne aussi sans JavaScript.
 */
export default function AvatarForm({ userId, avatarId, displayName, leftoverFiles = false }: Props) {
  const [uploadState, uploadAction, uploading] = useActionState(uploadAvatar, INITIAL_PROFILE_STATE);
  const [removeState, removeAction, removing] = useActionState(removeAvatar, INITIAL_PROFILE_STATE);
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = uploading || removing;
  const error = localError ?? uploadState.fieldErrors.avatar;

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setLocalError(file && file.size > MAX_BYTES ? AVATAR_TOO_LARGE : null);
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (busy || localError) event.preventDefault();
  };

  return (
    <div className="flex flex-wrap items-start gap-5">
      <ProfileAvatar avatarId={avatarId} displayName={displayName} />
      <div className="grid min-w-0 flex-1 gap-3">
        <form action={uploadAction} onSubmit={onSubmit} aria-busy={uploading} className="grid gap-2">
          <input type="hidden" name="account" value={userId} />
          <label htmlFor="profil-avatar" className={label}>
            Image (PNG, JPEG ou WebP, 2 Mo au plus)
          </label>
          <input
            id="profil-avatar"
            name="avatar"
            type="file"
            accept={ACCEPT}
            required
            onChange={onChange}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "profil-avatar-erreur" : undefined}
            className="max-w-full text-[14px] text-mute file:mr-3 file:rounded file:border file:border-line file:bg-panel file:px-3 file:py-1.5 file:text-ink"
          />
          {error && (
            <p id="profil-avatar-erreur" className={fieldError}>
              {error}
            </p>
          )}
          <p className="m-0 text-xs text-mute">
            L’image est recadrée en carré et réenregistrée par le serveur : ses métadonnées (lieu de la photo, appareil…)
            ne sont pas conservées.
          </p>
          <div>
            <Button type="submit" variant="panel" size="panel" disabled={busy}>
              {uploading ? "Envoi…" : avatarId ? "Remplacer l’avatar" : "Ajouter un avatar"}
            </Button>
          </div>
        </form>
        <ProfileFormMessage state={uploadState.fieldErrors.avatar ? INITIAL_PROFILE_STATE : uploadState} />
        {!avatarId && leftoverFiles && (
          <p className="m-0 text-xs text-mute">
            Un ancien fichier de votre avatar n’a pas encore pu être effacé : il le sera au prochain envoi, ou dès
            maintenant avec le bouton ci-dessous.
          </p>
        )}
        {(avatarId || leftoverFiles) && (
          <form action={removeAction} aria-busy={removing}>
            <input type="hidden" name="account" value={userId} />
            <Button type="submit" variant="panel" size="panel" disabled={busy}>
              {removing ? "Retrait…" : avatarId ? "Retirer l’avatar" : "Effacer les fichiers de l’avatar"}
            </Button>
          </form>
        )}
        <ProfileFormMessage state={removeState} />
      </div>
    </div>
  );
}
