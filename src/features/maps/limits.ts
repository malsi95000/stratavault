// Bornes des cartes enregistrées dans un compte, partagées par le navigateur et le serveur.
// La base applique des bornes plus larges en dernier recours (supabase/migrations/).

/** Taille maximale d'une carte en JSON compact (octets UTF-8). */
export const MAX_MAP_BYTES = 4_000_000;
/** Texte affiché pour MAX_MAP_BYTES. */
export const MAX_MAP_SIZE_LABEL = "4 Mo";
/** Nombre maximal de cartes par compte (déclencheur de la migration). */
export const MAX_MAPS_PER_ACCOUNT = 500;
/** Volume total des cartes d'un compte (texte jsonb, octets ; déclencheur de la migration). */
export const MAX_ACCOUNT_BYTES = 50_000_000;
/** Texte affiché pour MAX_ACCOUNT_BYTES. */
export const MAX_ACCOUNT_SIZE_LABEL = "50 Mo";

/** Taille d'une valeur en JSON compact, en octets UTF-8. */
export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? "").length;
}
