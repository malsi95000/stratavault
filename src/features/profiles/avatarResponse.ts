// En-têtes d'une image d'avatar servie par /avatars/<id> (src/app/avatars/[id]/route.ts).
import { AVATAR_CONTENT_TYPE } from "./avatarImage";

/**
 * Durée pendant laquelle le navigateur considère un avatar de son cache comme à jour, avant de le
 * redemander (secondes ; page Cookies). Ce n'est pas une durée de stockage : la copie peut rester dans le
 * cache jusqu'à son éviction.
 */
export const AVATAR_CACHE_MAX_AGE_S = 300;

/**
 * Type exact (le fichier est un WebP ré-encodé par le serveur à la lecture), jamais deviné par
 * le navigateur (nosniff), affiché comme image et non comme document ; ouvert seul, il ne peut rien
 * exécuter (CSP « sandbox »). Cache privé et court ; lisible seulement par les pages du site.
 */
export function avatarHeaders(length: number): Record<string, string> {
  return {
    "Content-Type": AVATAR_CONTENT_TYPE,
    "Content-Length": String(length),
    "Content-Disposition": 'inline; filename="avatar.webp"',
    "Cache-Control": `private, max-age=${AVATAR_CACHE_MAX_AGE_S}`,
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
