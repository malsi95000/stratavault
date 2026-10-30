// Formes des profils telles que l'application les manipule (voir src/lib/supabase/profiles.ts).

export const PROFILE_VISIBILITIES = ["members", "contacts"] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

/** Champs modifiables d'un profil (formulaire de « Mon profil »). */
export type ProfileFields = {
  handle: string;
  displayName: string;
  bio: string;
  visibility: ProfileVisibility;
};

/** Profil du compte connecté, lu dans sa propre ligne. */
export type OwnProfile = ProfileFields & {
  avatarId: string | null;
  /** Date du dernier changement d'identifiant (ou de la création du profil). */
  handleChangedAt: string;
  createdAt: string;
  updatedAt: string;
};

/** Profil d'un membre, tel que le renvoie la recherche par identifiant exact (aucun identifiant de compte). */
export type PublicProfile = {
  handle: string;
  displayName: string;
  bio: string;
  avatarId: string | null;
  isSelf: boolean;
};
