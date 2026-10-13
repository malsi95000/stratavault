// Adresse publique de l'application, utilisée pour les liens envoyés par e-mail.
// Supabase n'accepte de toute façon que les URL de redirection déclarées dans son tableau de bord.

type OriginSources = {
  /** Variable SITE_URL (recommandée en production). */
  siteUrl?: string | null;
  /** En-tête Origin de la requête (contrôlé par Next.js pour les Server Actions). */
  origin?: string | null;
  host?: string | null;
  proto?: string | null;
};

function httpOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function resolveOrigin({ siteUrl, origin, host, proto }: OriginSources): string | null {
  return (
    httpOrigin(siteUrl) ??
    httpOrigin(origin) ??
    (host ? httpOrigin(`${proto === "https" ? "https" : "http"}://${host}`) : null)
  );
}
