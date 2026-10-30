import { headers } from "next/headers";
import { isSameOrigin, LOCK_BEACON_MAX_BYTES } from "@/features/sharing/coop/lockBeacon";
import { releaseLock } from "@/lib/supabase/sharing";
import { createClient } from "@/lib/supabase/server";
import { checkActiveUser } from "@/lib/supabase/user";

// POST /carte/partagee/<id>/verrou : libère le verrou d'édition de la carte <id> à la fermeture de
// l'onglet de l'éditeur coopératif (navigator.sendBeacon, qui part même quand la page se ferme ; une
// Server Action n'aurait pas cette garantie). Sans cette requête, le bail expire seul en deux minutes.
//
// - Même origine exigée (en-tête Origin) ; corps : l'identifiant du compte pour lequel la page a été
//   ouverte (36 caractères), refusé s'il ne correspond plus à la session (autre compte ouvert).
// - Session vérifiée auprès de l'API Auth (getUser) ; la base ne libère que le verrou tenu par ce
//   compte (release_map_lock), et compte l'appel avec les prises de verrou.
// - Réponse sans corps, jamais mise en cache ; elle ne dit rien de la carte.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NO_STORE = { "Cache-Control": "no-store" };
const answer = (status: number) => new Response(null, { status, headers: NO_STORE });

/** Corps de la requête, lu au plus jusqu'à `max` octets ; null s'il est plus long (lecture abandonnée). */
async function readBounded(request: Request, max: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request, context: RouteContext<"/carte/partagee/[id]/verrou">): Promise<Response> {
  if (!isSameOrigin(await headers())) return answer(403);
  const { id } = await context.params;
  if (!UUID.test(id)) return answer(404);
  const body = await readBounded(request, LOCK_BEACON_MAX_BYTES);
  if (body === null) return answer(413);
  const check = await checkActiveUser();
  if (check.status !== "signed-in" || check.user.id !== body) return answer(204);
  const db = await createClient();
  if (!db) return answer(204);
  try {
    await releaseLock(db, id);
  } catch {
    // Rien à faire : le bail expirera seul.
  }
  return answer(204);
}
