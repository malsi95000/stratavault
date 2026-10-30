// Adresses des pages du partage des cartes.

/** Éditeur coopératif d'une carte (propriétaire et membres). */
export const sharedMapPath = (mapId: string) => `/carte/partagee/${encodeURIComponent(mapId)}`;

/**
 * Éditeur coopératif où mener le propriétaire dont la carte active `activeMapId`, ouverte dans
 * l'éditeur habituel (/carte), a des membres (`sharedMapIds`) : elle s'y modifie avec le verrou
 * d'édition, comme depuis « Continuer » dans son espace. null : pas de carte active, ou sans membre.
 */
export const coopRedirectFor = (activeMapId: string | null, sharedMapIds: readonly string[]): string | null =>
  activeMapId !== null && sharedMapIds.includes(activeMapId) ? sharedMapPath(activeMapId) : null;

/** Page « Partager » d'une carte du compte (membres, invitations, liens). */
export const shareSettingsPath = (mapId: string) => `/espace/partage/${encodeURIComponent(mapId)}`;

/** Ancre du formulaire d'invitation d'un contact, sur la page « Partager ». */
export const INVITE_ANCHOR = "inviter";

/** Page qui ouvre un lien d'invitation (le jeton est dans le fragment, jamais envoyé au serveur par le navigateur). */
export const INVITATION_PAGE = "/invitation";

/** Lien d'invitation complet, à partir de l'origine du site et du jeton. */
export const invitationUrl = (origin: string, token: string) => `${origin}${INVITATION_PAGE}#${token}`;

/** Jeton lu dans le fragment d'une adresse (« #<jeton> ») ; null s'il n'a pas la bonne forme. */
export function tokenFromHash(hash: string): string | null {
  const token = hash.startsWith("#") ? hash.slice(1) : hash;
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}
