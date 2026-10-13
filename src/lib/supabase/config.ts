// Configuration Supabase lue dans les variables d'environnement.
// Sans configuration valide, l'application fonctionne en mode démo local (IndexedDB).

export type SupabaseConfig = { url: string; publishableKey: string };

type RawEnv = { url?: string; key?: string };

function currentEnv(): RawEnv {
  // Accès littéraux : Next remplace les variables NEXT_PUBLIC_ au moment de la compilation.
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

/** Vrai si la clé donne des droits d'administration (clé secrète ou JWT « service_role »). */
export function isPrivilegedKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims === "object" && claims !== null && "role" in claims && claims.role === "service_role";
  } catch {
    return false;
  }
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// Le proxy relit la configuration à chaque requête : l'avertissement n'est écrit qu'une fois.
let privilegedKeyReported = false;

/** Renvoie la configuration si elle est complète et sûre, sinon `null` (mode démo). */
export function readSupabaseConfig(env: RawEnv = currentEnv()): SupabaseConfig | null {
  const url = env.url?.trim();
  const key = env.key?.trim();
  if (!url || !key || !isValidUrl(url)) return null;
  if (isPrivilegedKey(key)) {
    // Une clé d'administration ne doit jamais servir ici : on refuse plutôt que de l'exposer.
    if (!privilegedKeyReported) {
      privilegedKeyReported = true;
      console.error("[supabase] Clé refusée : utilisez la clé « publishable », jamais une clé secrète ou service_role.");
    }
    return null;
  }
  return { url, publishableKey: key };
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseConfig() !== null;
}
