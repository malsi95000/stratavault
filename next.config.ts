import type { NextConfig } from "next";
import { assertLegalReadyForProduction } from "./src/lib/legalReadiness";
import { STATIC_CSP, STATIC_PATHS_SOURCE, securityHeaders } from "./src/lib/security/headers";

// Pas de mise en production avec des informations légales incomplètes (docs/legal.md).
assertLegalReadyForProduction();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Une carte peut peser jusqu'à 4 Mo (src/features/maps/limits.ts), plus l'enveloppe de la requête.
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    // La Content-Security-Policy (nonce par requête) est posée par src/proxy.ts ; les chemins qu'il
    // ne traite pas (fichiers statiques, et leur page 404) reçoivent une CSP fixe.
    return [
      { source: "/:path*", headers: securityHeaders(process.env.NODE_ENV === "production") },
      { source: STATIC_PATHS_SOURCE, headers: [{ key: "Content-Security-Policy", value: STATIC_CSP }] },
    ];
  },
};

export default nextConfig;
