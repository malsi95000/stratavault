// En-têtes de sécurité. La CSP, qui dépend d'un nonce par requête, est posée par le proxy ;
// les autres en-têtes, fixes, sont déclarés dans next.config.ts pour toutes les réponses.

/**
 * Content-Security-Policy stricte pour les scripts : seuls ceux qui portent le nonce de la requête
 * (Next.js l'ajoute à ses propres scripts) et ceux qu'ils chargent ('strict-dynamic') s'exécutent.
 * Les styles restent en 'unsafe-inline' : attributs `style` de React et feuille injectée par sonner
 * (un nonce dans style-src désactiverait 'unsafe-inline').
 */
export function buildCsp(nonce: string, development: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    // En développement : WebSocket du rechargement à chaud.
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

/**
 * Chemins que le proxy ne traite pas (fichiers statiques, voir `config.matcher` de src/proxy.ts, à
 * garder identiques) : ils n'ont pas de CSP à nonce. Une URL absente de ce type renvoie pourtant la
 * page 404 HTML de Next : elle reçoit cette CSP fixe, sans nonce.
 */
export const STATIC_PATHS_SOURCE =
  "/:path(_next/static.*|_next/image.*|data/.*|favicon\\.ico.*|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|json|txt|xml|webmanifest))";

/** CSP des chemins statiques : aucun script en ligne (pas de nonce), rien d'extérieur, pas d'encadrement. */
export const STATIC_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Nonce aléatoire (128 bits), différent à chaque requête. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export type Header = { key: string; value: string };

export function securityHeaders(production: boolean): Header[] {
  const headers: Header[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
  ];
  // HSTS seulement en production (HTTPS) : en local, il bloquerait http://localhost.
  if (production) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  return headers;
}
