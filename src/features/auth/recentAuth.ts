// Changement de mot de passe : on exige une authentification récente, pas seulement une session.
// Une session ouverte depuis longtemps (appareil resté allumé, cookie volé) ne suffit donc pas pour
// changer le mot de passe sans connaître l'ancien. Le lien de réinitialisation ouvre une session
// toute neuve : il passe ce contrôle pendant la durée ci-dessous.

/** Délai pendant lequel la session ouverte par un lien (ou une connexion) permet de changer le mot de passe. */
export const RECENT_AUTH_MS = 30 * 60_000;

type AmrClaim = ReadonlyArray<{ method?: unknown; timestamp?: unknown } | string> | undefined;

/**
 * Vrai si la dernière authentification de la session (claim `amr` du jeton, qui n'est pas renouvelé
 * au rafraîchissement) date de moins de `RECENT_AUTH_MS`. Les sessions anonymes ne comptent pas.
 */
export function isRecentAuthentication(amr: AmrClaim, nowMs: number = Date.now()): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const { method, timestamp } = entry;
    if (method === "anonymous" || typeof timestamp !== "number") return false;
    const ageMs = nowMs - timestamp * 1000;
    return ageMs >= -60_000 && ageMs <= RECENT_AUTH_MS;
  });
}
