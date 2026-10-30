// Adresses des pages de profil et des avatars.
import { isHandleFormatOk, normalizeHandle } from "./handle";

/** « Mon profil » : le profil du compte connecté, modifiable. */
export const MY_PROFILE_PAGE = "/profil";

/** Page publique (pour les membres connectés) du profil `handle`, déjà normalisé. */
export const profilePath = (handle: string) => `${MY_PROFILE_PAGE}/${encodeURIComponent(handle)}`;

/** Image de l'avatar `avatarId`, servie par la route du site (src/app/avatars/[id]/route.ts). */
export const avatarPath = (avatarId: string) => `/avatars/${encodeURIComponent(avatarId)}`;

/**
 * Page du profil cherché par son identifiant exact (« @Alice » → /profil/alice) ; null si la saisie
 * n'a pas le format d'un identifiant (aucune requête inutile).
 */
export function searchTarget(raw: string): string | null {
  const handle = normalizeHandle(raw);
  return isHandleFormatOk(handle) ? profilePath(handle) : null;
}
