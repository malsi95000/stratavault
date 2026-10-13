import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_COOKIE } from "@/lib/supabase/cookies";
import { checkActiveUser } from "@/lib/supabase/user";
import { pageSession } from "./pageSession";
import type { PageSession } from "./pageSession";

/**
 * Mode de la page en cours (Server Components de /carte et /espace). La session est vérifiée auprès
 * de l'API Auth (checkActiveUser) : après « Se déconnecter », une copie du cookie n'ouvre plus ces pages.
 */
export const getPageSession = cache(async (): Promise<PageSession> => {
  const demo = (await cookies()).get(DEMO_COOKIE)?.value === "1";
  return pageSession(await checkActiveUser(), { accountsEnabled: isSupabaseConfigured(), demo });
});
