import { headers } from "next/headers";
import { accountExportFileName, createAccountExportStream } from "@/features/account/exportData";
import { acquireExportSlot } from "@/features/account/exportSlots";
import {
  ACCOUNT_PAGE,
  EXPORT_IN_PROGRESS_PATH,
  EXPORT_RATE_LIMITED_PATH,
  EXPORT_SERVER_BUSY_PATH,
  EXPORT_UNAVAILABLE_PATH,
} from "@/features/account/notices";
import { checkAccountAttempt, checkAttempt, clientIp, trustedProxyHops } from "@/features/auth/rateLimit";
import { LOGIN_PAGE } from "@/features/auth/redirects";
import { listMapsForExport, readMapDataText } from "@/lib/supabase/account";
import { createClient } from "@/lib/supabase/server";
import { verifyAccount } from "@/lib/supabase/user";

// « Télécharger mes données » (RGPD, articles 15 et 20) : GET /compte/export renvoie un fichier JSON
// avec la fiche du compte et toutes ses cartes.
//
// - Requête venue d'un autre site (en-tête Sec-Fetch-Site) : renvoyée vers /compte sans rien lire ni
//   compter. Un site tiers ne peut pas lire le fichier (politique de même origine), mais il pourrait
//   sinon épuiser le quota de téléchargements de la personne en l'y envoyant à son insu.
// - Utilisateur vérifié auprès de l'API Auth (getUser) ; limite par IP avant tout appel à Supabase,
//   puis par compte ; un seul téléchargement à la fois par compte, deux par IP et un petit plafond pour
//   le serveur (exportSlots.ts).
// - Fichier produit en flux, carte par carte, en JSON compact (exportData.ts) : la mémoire du serveur
//   reste bornée par la taille d'une carte. Un fichier que le navigateur ne lit pas, ou plus, est
//   abandonné après un court délai et sa place libérée. Réponse jamais mise en cache.
// - HEAD est refusé (405) sans rien réserver ni compter : sans ce handler, Next.js répondrait à HEAD
//   avec GET, dont le corps n'est jamais lu, ce qui garderait une place sans rien télécharger.
// En cas d'échec avant le début du fichier, retour à /compte avec un message.

/** Aucun cache, ni dans le navigateur ni chez un intermédiaire : le fichier contient des données personnelles. */
const NO_STORE = { "Cache-Control": "no-store" };

/** Redirection 303 (GET) vers une page de l'application. */
const redirectTo = (path: string) => new Response(null, { status: 303, headers: { Location: path, ...NO_STORE } });

/**
 * Vrai si la requête vient d'une autre origine. Les navigateurs récents envoient Sec-Fetch-Site :
 * `same-origin` pour le lien de /compte, `none` pour une adresse tapée ou un favori. Sans cet en-tête
 * (navigateur ancien, outil en ligne de commande), la requête est acceptée.
 */
function isCrossSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

/** HEAD : refusé, sans session lue, place réservée ni tentative comptée. */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET", ...NO_STORE } });
}

export async function GET(request: Request): Promise<Response> {
  if (isCrossSite(request)) return redirectTo(ACCOUNT_PAGE);
  const supabase = await createClient();
  if (!supabase) return redirectTo(ACCOUNT_PAGE);
  const ip = clientIp(await headers(), trustedProxyHops());
  if (checkAttempt("export", ip) !== "allowed") {
    return redirectTo(EXPORT_RATE_LIMITED_PATH);
  }

  const check = await verifyAccount(supabase);
  if (check.status === "unavailable") return redirectTo(EXPORT_UNAVAILABLE_PATH);
  if (check.status === "signed-out") return redirectTo(LOGIN_PAGE);
  const { account } = check;

  // Place réservée avant de compter la tentative : un double clic ne consomme pas le quota.
  const slot = acquireExportSlot(account.id, ip);
  if (slot.status === "account-busy") return redirectTo(EXPORT_IN_PROGRESS_PATH);
  if (slot.status !== "acquired") return redirectTo(EXPORT_SERVER_BUSY_PATH);
  if (!checkAccountAttempt("export", account.id)) {
    slot.release();
    return redirectTo(EXPORT_RATE_LIMITED_PATH);
  }

  let maps;
  try {
    maps = await listMapsForExport(supabase, account.id);
  } catch {
    slot.release();
    // Seul le type d'erreur est journalisé, jamais de donnée.
    console.error("[account] Lecture des cartes impossible pour l’export.");
    return redirectTo(EXPORT_UNAVAILABLE_PATH);
  }

  const now = new Date();
  const body = createAccountExportStream({
    account,
    maps,
    now,
    readData: async (mapId) => {
      try {
        return await readMapDataText(supabase, account.id, mapId);
      } catch (error) {
        console.error("[account] Lecture d’une carte impossible pendant l’export : téléchargement interrompu.");
        throw error;
      }
    },
    onEnd: slot.release,
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${accountExportFileName(now)}"`,
      ...NO_STORE,
    },
  });
}
