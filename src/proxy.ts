import { NextResponse, type NextRequest } from "next/server";
import { decideAccess } from "@/features/auth/access";
import { checkAttempt, clientIp, trustedProxyHops } from "@/features/auth/rateLimit";
import { buildCsp, createNonce } from "@/lib/security/headers";
import { readSupabaseConfig, type SupabaseConfig } from "@/lib/supabase/config";
import { DEMO_COOKIE } from "@/lib/supabase/cookies";
import { REFRESH_LIMITED_HEADER, sessionNeedsRefresh } from "@/lib/supabase/refreshGuard";
import { refreshSession, type SessionRefresh } from "@/lib/supabase/session";

type GuardedSession = { session: SessionRefresh | null; refreshLimited: boolean };

/**
 * Rafraîchit la session, sauf si cette IP a déjà demandé trop de rafraîchissements (chacun coûte un
 * appel /token à Supabase, dont la limite est commune à tous les visiteurs : voir refreshGuard.ts).
 * Au-delà, la requête est traitée comme non connectée sans appeler Supabase, et marquée
 * (REFRESH_LIMITED_HEADER) pour que le rendu et les Server Actions qui suivent ne rafraîchissent pas
 * à leur tour. Les cookies restent dans le navigateur (un utilisateur réel derrière une IP partagée
 * retrouve sa session à la fenêtre suivante) et dans la requête : « Se déconnecter » les efface et
 * révoque quand même la session (src/features/auth/actions.ts).
 */
async function guardedRefresh(request: NextRequest, config: SupabaseConfig): Promise<GuardedSession> {
  if (await sessionNeedsRefresh(request.cookies.getAll())) {
    const ip = clientIp(request.headers, trustedProxyHops());
    if (checkAttempt("refresh", ip) === "limited") return { session: null, refreshLimited: true };
  }
  return { session: await refreshSession(request, config), refreshLimited: false };
}

/**
 * Avant chaque page : rafraîchit la session Supabase, applique les règles d'accès
 * (connexion exigée pour /espace, /carte et /compte quand les comptes sont actifs) et pose la CSP à nonce.
 */
export async function proxy(request: NextRequest) {
  const config = readSupabaseConfig();
  const { session, refreshLimited } = config
    ? await guardedRefresh(request, config)
    : { session: null, refreshLimited: false };

  const decision = decideAccess({
    pathname: request.nextUrl.pathname,
    accountsEnabled: config !== null,
    signedIn: session?.signedIn ?? false,
    demo: request.cookies.get(DEMO_COOKIE)?.value === "1",
    method: request.method,
  });

  const csp = buildCsp(createNonce(), process.env.NODE_ENV === "development");
  let response: NextResponse;
  if (decision.type === "redirect") {
    response = NextResponse.redirect(new URL(decision.to, request.url));
  } else {
    // Next.js lit la CSP de la requête pour ajouter le nonce à ses scripts.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("Content-Security-Policy", csp);
    // Seul le proxy décide de cette marque : celle qu'enverrait le navigateur est toujours retirée.
    requestHeaders.delete(REFRESH_LIMITED_HEADER);
    if (refreshLimited) requestHeaders.set(REFRESH_LIMITED_HEADER, "1");
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set("Content-Security-Policy", csp);
  session?.applyTo(response);
  return response;
}

export const config = {
  // Tout sauf les fichiers statiques : ressources de Next, géométries (/data) et fichiers avec extension.
  // À garder identique à STATIC_PATHS_SOURCE (src/lib/security/headers.ts), qui leur donne une CSP fixe :
  // les préfixes exclus ici (sans « / » final pour _next/static et _next/image) y sont suivis de « .* ».
  matcher: ["/((?!_next/static|_next/image|data/|favicon\\.ico|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|json|txt|xml|webmanifest)$).*)"],
};
