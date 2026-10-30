// Libération du verrou d'édition à la fermeture de l'onglet (navigator.sendBeacon), par la route
// src/app/carte/partagee/[id]/verrou/route.ts.

/** Adresse de la route qui libère le verrou d'édition de la carte `mapId`. */
export const lockBeaconPath = (mapId: string) => `/carte/partagee/${encodeURIComponent(mapId)}/verrou`;

/** Taille maximale du corps (l'identifiant du compte attendu, 36 caractères). */
export const LOCK_BEACON_MAX_BYTES = 64;

/**
 * Vrai si la requête vient du site lui-même : en-tête Origin identique à l'hôte (x-forwarded-host
 * derrière le proxy de l'hébergeur, sinon host). Une page d'un autre site ne peut pas libérer le
 * verrou d'un membre (et ses requêtes n'emportent pas les cookies « lax » de toute façon).
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
