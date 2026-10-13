// Limites de débit propres à l'application, appliquées par les Server Actions de compte.
//
// Pourquoi : Supabase Auth limite les tentatives par adresse IP, mais ici toutes les requêtes lui
// parviennent depuis le serveur Next. Sans limite côté application, un seul visiteur pourrait épuiser
// le quota commun (et bloquer tout le monde) ou s'acharner sur un compte. On limite donc par IP du
// visiteur et par couple (IP, adresse e-mail visée), avant d'appeler Supabase.
//
// Compteurs en mémoire, par instance du serveur : suffisant pour un serveur unique ; sur plusieurs
// instances, chaque instance applique sa propre limite (voir docs/supabase.md).

export type RateLimiter = {
  /** Compte une tentative pour `key` ; faux si la limite de la fenêtre en cours est déjà atteinte. */
  take(key: string): boolean;
  reset(): void;
};

type Options = { limit: number; windowMs: number; maxKeys?: number; now?: () => number };

export function createRateLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }: Options): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  function prune(time: number) {
    for (const [key, entry] of windows) if (entry.resetAt <= time) windows.delete(key);
    // Encore trop de clés (afflux d'adresses différentes) : on oublie les plus anciennes.
    for (const key of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(key);
    }
  }

  return {
    take(key) {
      const time = now();
      let entry = windows.get(key);
      if (!entry || entry.resetAt <= time) {
        if (!entry && windows.size >= maxKeys) prune(time);
        entry = { count: 0, resetAt: time + windowMs };
        windows.delete(key);
        windows.set(key, entry);
      }
      if (entry.count >= limit) return false;
      entry.count += 1;
      return true;
    },
    reset() {
      windows.clear();
    },
  };
}

/**
 * IP du visiteur. Les proxys inverses (nginx `$proxy_add_x_forwarded_for`, Caddy, Traefik…) AJOUTENT
 * l'adresse qu'ils voient à la fin de `x-forwarded-for` : les éléments de gauche viennent du client et
 * peuvent être falsifiés. On lit donc l'élément ajouté par le proxy de confiance le plus éloigné :
 * le dernier avec un seul proxy (`trustedHops` = 1, cas de Vercel, Netlify ou d'un proxy unique),
 * l'avant-dernier avec deux proxys en chaîne, etc. À défaut, `x-real-ip`.
 */
export function clientIp(headers: Headers, trustedHops = 1): string {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const forwarded = chain.length > 0 ? chain[Math.max(0, chain.length - Math.max(1, trustedHops))] : undefined;
  const ip = forwarded || headers.get("x-real-ip")?.trim();
  return ip ? ipRateKey(ip) : "inconnue";
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET = /^[0-9a-f]{1,4}$/;

/** Les 8 groupes de 16 bits d'une adresse IPv6 (forme abrégée « :: » et fin IPv4 comprises), ou null. */
function ipv6Groups(address: string): number[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === "") return [];
    const groups: number[] = [];
    const items = part.split(":");
    for (const [i, item] of items.entries()) {
      const v4 = i === items.length - 1 ? IPV4.exec(item) : null;
      if (v4) {
        const bytes = v4.slice(1).map(Number);
        if (bytes.some((b) => b > 255)) return null;
        groups.push((bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]);
      } else if (HEXTET.test(item)) {
        groups.push(parseInt(item, 16));
      } else {
        return null;
      }
    }
    return groups;
  };
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  return missing >= 1 ? [...head, ...Array<number>(missing).fill(0), ...tail] : null;
}

/**
 * Clé de limite de débit d'une adresse IP. Un abonnement ou un serveur reçoit en général tout un
 * préfixe IPv6 /64 (2^64 adresses) : compter chaque adresse à part permettrait de changer d'adresse
 * à chaque requête et d'échapper à toute limite par IP. Une adresse IPv6 est donc réduite à son /64 ;
 * une IPv4 « mappée » (::ffff:a.b.c.d) redevient l'IPv4. Port et crochets éventuels sont retirés.
 */
export function ipRateKey(raw: string): string {
  let address = raw.trim().toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(address);
  if (bracketed) address = bracketed[1];
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(address);
  if (v4WithPort) address = v4WithPort[1];
  if (!address.includes(":")) return address;
  address = address.replace(/%.*$/, ""); // identifiant de zone (fe80::1%eth0)
  const groups = ipv6Groups(address);
  if (!groups) return address;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}

/** Nombre de proxys de confiance devant le serveur (`TRUSTED_PROXY_HOPS`, 1 par défaut). */
export function trustedProxyHops(value: string | undefined = process.env.TRUSTED_PROXY_HOPS): number {
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 1 && hops <= 10 ? hops : 1;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const MINUTE = 60_000;

/**
 * Limites retenues (largement au-dessus d'un usage normal, bien en dessous d'une attaque).
 *
 * La limite stricte par adresse e-mail est indexée par le couple (IP, adresse) : un tiers qui
 * s'acharne sur l'adresse d'une victime n'épuise que son propre quota et ne bloque pas la victime,
 * qui se connecte depuis une autre IP. Seul un plafond par adresse, beaucoup plus haut, reste commun
 * à toutes les IP (garde-fou contre une attaque distribuée sur un même compte).
 * Les IP sont comptées par préfixe /64 en IPv6 (voir ipRateKey). Limite connue : une dizaine
 * d'IP (ou de préfixes /64) suffit à atteindre ce plafond de connexion et à bloquer la victime, de
 * façon renouvelable à chaque fenêtre. La parade est le CAPTCHA de Supabase (docs/supabase.md).
 */
const limiters = {
  signInByIp: createRateLimiter({ limit: 20, windowMs: 5 * MINUTE }),
  signInByIpAndEmail: createRateLimiter({ limit: 10, windowMs: 15 * MINUTE }),
  signInByEmail: createRateLimiter({ limit: 100, windowMs: 15 * MINUTE }),
  signUpByIp: createRateLimiter({ limit: 10, windowMs: 60 * MINUTE }),
  resetByIp: createRateLimiter({ limit: 10, windowMs: 60 * MINUTE }),
  resetByIpAndEmail: createRateLimiter({ limit: 3, windowMs: 60 * MINUTE }),
  resetByEmail: createRateLimiter({ limit: 10, windowMs: 60 * MINUTE }),
  updatePasswordByIp: createRateLimiter({ limit: 10, windowMs: 15 * MINUTE }),
  // Lien reçu par e-mail : chaque essai consomme la limite « token verifications » (ou celle de
  // /token, qui sert aussi aux connexions et au rafraîchissement des sessions) de Supabase.
  confirmByIp: createRateLimiter({ limit: 10, windowMs: 15 * MINUTE }),
  // Rafraîchissement de session par le proxy (cookie expiré) : chacun coûte un appel /token à
  // Supabase (voir src/lib/supabase/refreshGuard.ts). Un visiteur normal en fait un par heure environ
  // (quelques-uns en parallèle au chargement d'une page) ; la marge couvre une IP partagée (NAT).
  refreshByIp: createRateLimiter({ limit: 30, windowMs: 5 * MINUTE }),
  // Déconnexion alors que la limite précédente est atteinte : la session doit quand même être
  // révoquée, ce qui peut coûter un dernier rafraîchissement (/token). Quota séparé et petit, pour
  // qu'un faux cookie envoyé en boucle à « Se déconnecter » n'épuise pas /token à son tour.
  signOutByIp: createRateLimiter({ limit: 10, windowMs: 15 * MINUTE }),
  // Page « Mon compte » : suppression du compte (vérifie le mot de passe auprès de Supabase, donc
  // coûte un appel /token) et téléchargement des données (lit toutes les cartes du compte).
  deleteAccountByIp: createRateLimiter({ limit: 10, windowMs: 15 * MINUTE }),
  exportByIp: createRateLimiter({ limit: 20, windowMs: 15 * MINUTE }),
};

export type AuthAttempt =
  | "signIn"
  | "signUp"
  | "reset"
  | "updatePassword"
  | "confirm"
  | "refresh"
  | "signOut"
  | "deleteAccount"
  | "export";

/**
 * - `allowed` : la tentative peut être faite ;
 * - `limited` : refusée, le visiteur voit « Trop de tentatives » ;
 * - `silenced` : demande de réinitialisation au-delà du plafond de l'adresse : on répond comme si
 *   l'e-mail était parti, sans rien envoyer (la victime n'est ni bloquée ni inondée d'e-mails).
 */
export type AttemptVerdict = "allowed" | "limited" | "silenced";

const byIpLimiters = {
  signIn: limiters.signInByIp,
  signUp: limiters.signUpByIp,
  reset: limiters.resetByIp,
  updatePassword: limiters.updatePasswordByIp,
  confirm: limiters.confirmByIp,
  refresh: limiters.refreshByIp,
  signOut: limiters.signOutByIp,
  deleteAccount: limiters.deleteAccountByIp,
  export: limiters.exportByIp,
};

const byEmailLimiters: Partial<Record<AuthAttempt, { pair: RateLimiter; ceiling: RateLimiter }>> = {
  signIn: { pair: limiters.signInByIpAndEmail, ceiling: limiters.signInByEmail },
  reset: { pair: limiters.resetByIpAndEmail, ceiling: limiters.resetByEmail },
};

/**
 * Compte la tentative dans chaque limite concernée : par IP, puis par couple (IP, adresse), puis
 * dans le plafond par adresse.
 */
export function checkAttempt(attempt: AuthAttempt, ip: string, email?: string): AttemptVerdict {
  if (!byIpLimiters[attempt].take(ip)) return "limited";
  const byEmail = byEmailLimiters[attempt];
  if (!byEmail || email === undefined) return "allowed";
  const address = normalizeEmail(email);
  if (!byEmail.pair.take(`${ip}|${address}`)) return "limited";
  if (!byEmail.ceiling.take(address)) return attempt === "reset" ? "silenced" : "limited";
  return "allowed";
}

/**
 * Limites par compte (identifiant vérifié par getUser), communes à toutes les IP : appliquées après
 * la limite par IP (checkAttempt), une fois l'utilisateur connu. Elles bornent ce qu'un tiers muni
 * d'une copie du cookie de session pourrait faire en changeant d'IP : deviner le mot de passe pour
 * supprimer le compte, ou relire sans fin toutes ses cartes.
 */
const accountLimiters = {
  deleteAccount: createRateLimiter({ limit: 5, windowMs: 60 * MINUTE }),
  export: createRateLimiter({ limit: 10, windowMs: 60 * MINUTE }),
};

export type AccountAttempt = keyof typeof accountLimiters;

/** Compte la tentative du compte `accountId` ; faux si sa limite est atteinte. */
export function checkAccountAttempt(attempt: AccountAttempt, accountId: string): boolean {
  return accountLimiters[attempt].take(accountId);
}

/** Pour les tests : remet tous les compteurs à zéro. */
export function resetAuthRateLimits(): void {
  for (const limiter of [...Object.values(limiters), ...Object.values(accountLimiters)]) limiter.reset();
}
