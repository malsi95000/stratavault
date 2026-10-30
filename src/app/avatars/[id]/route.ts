import { headers } from "next/headers";
import { checkAttempt, clientIp, trustedProxyHops } from "@/features/auth/rateLimit";
import { sanitizeStoredAvatar } from "@/features/profiles/avatarImage";
import { avatarHeaders } from "@/features/profiles/avatarResponse";
import { downloadAvatarObject, openAvatarRead } from "@/lib/supabase/profiles";
import { createClient } from "@/lib/supabase/server";
import { checkActiveUser } from "@/lib/supabase/user";

// GET /avatars/<avatar_id> : image de l'avatar d'un profil, réservée aux comptes connectés.
//
// - Session vérifiée auprès de l'API Auth (getUser) ; la lecture est ouverte pour une minute par la
//   base (open_avatar_read), seulement s'il s'agit de l'avatar actuel d'un profil visible pour ce
//   compte (ou du sien), puis le fichier est relu dans le compartiment PRIVÉ « avatars » de Supabase
//   Storage avec le jeton du compte qui le demande. Le navigateur ne s'adresse qu'au site : la CSP
//   (img-src 'self') n'a pas à autoriser Supabase.
// - Toute absence (pas de session, identifiant mal formé, avatar inconnu, profil masqué, fichier
//   manquant) donne la même réponse 404 : rien ne révèle qu'un avatar existe.
// - Le fichier n'est jamais servi tel quel : un compte peut envoyer n'importe quels octets
//   directement à l'API Storage. Il doit être un WebP de 256 × 256 pixels, d'une seule image, de
//   100 Ko au plus, et il est RÉ-ENCODÉ avant d'être servi (sanitizeStoredAvatar), avec son type
//   exact, `nosniff`, une CSP qui interdit tout contenu actif s'il était ouvert seul, et une mise en
//   cache privée et courte (un changement de visibilité s'applique vite ; un nouvel avatar a un
//   nouvel identifiant).
// - Limite par IP (une lecture dans Storage par image). HEAD est refusé.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const NO_STORE = { "Cache-Control": "no-store" };

const notFound = () => new Response(null, { status: 404, headers: NO_STORE });

export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET", ...NO_STORE } });
}

export async function GET(_request: Request, context: RouteContext<"/avatars/[id]">): Promise<Response> {
  const { id } = await context.params;
  if (!UUID.test(id)) return notFound();
  if (checkAttempt("avatarRead", clientIp(await headers(), trustedProxyHops())) !== "allowed") {
    return new Response(null, { status: 429, headers: NO_STORE });
  }
  const check = await checkActiveUser();
  if (check.status === "unavailable") return new Response(null, { status: 503, headers: NO_STORE });
  if (check.status === "signed-out") return notFound();
  const db = await createClient();
  if (!db) return notFound();

  let stored: Uint8Array | null;
  try {
    if (!(await openAvatarRead(db, id))) return notFound();
    stored = await downloadAvatarObject(db, id);
  } catch {
    return notFound();
  }
  const bytes = stored && (await sanitizeStoredAvatar(stored));
  if (!bytes) return notFound();
  return new Response(bytes as BodyInit, { status: 200, headers: avatarHeaders(bytes.length) });
}
