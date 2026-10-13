// Téléchargements des données en cours, en mémoire de l'instance du serveur : au plus un par compte,
// deux par adresse IP et un petit plafond pour tout le serveur. Chaque téléchargement garde une carte
// en mémoire à la fois (voir exportData.ts) ; ces bornes empêchent qu'un compte, ou quelques-uns, en
// lancent assez en parallèle pour saturer la mémoire du serveur, et la borne par IP empêche un seul
// visiteur (même avec plusieurs comptes) de prendre toutes les places.
//
// Une place est libérée à la fin du téléchargement, quand il échoue ou est abandonné, quand le
// navigateur cesse de le lire (exportData.ts : délais de lecture), et au plus tard EXPORT_SLOT_TTL_MS
// après son début : une minuterie efface alors l'entrée de la mémoire.

/** Téléchargements simultanés au plus, tous comptes confondus (par instance du serveur). */
export const MAX_CONCURRENT_EXPORTS = 4;
/** Téléchargements simultanés au plus depuis une même adresse IP (préfixe /64 en IPv6). */
export const MAX_EXPORTS_PER_IP = 2;
/**
 * Durée au-delà de laquelle une place est libérée et son entrée effacée, même si la fin du
 * téléchargement n'a pas été signalée (garde-fou : une place ne reste jamais prise indéfiniment).
 */
export const EXPORT_SLOT_TTL_MS = 15 * 60_000;

export type ExportSlot =
  | { status: "acquired"; release: () => void }
  /** Un téléchargement de ce compte est déjà en cours. */
  | { status: "account-busy" }
  /** Trop de téléchargements en cours depuis cette adresse IP. */
  | { status: "ip-busy" }
  /** Trop de téléchargements en cours sur le serveur. */
  | { status: "server-busy" };

type ActiveSlot = { token: symbol; ip: string; startedAt: number; timer: ReturnType<typeof setTimeout> };

const active = new Map<string, ActiveSlot>();

/** Efface la place du compte si c'est toujours celle de `token`. */
function forget(accountId: string, token: symbol) {
  const slot = active.get(accountId);
  if (slot?.token !== token) return;
  clearTimeout(slot.timer);
  active.delete(accountId);
}

/** Réserve une place pour un téléchargement du compte `accountId`, depuis l'adresse `ip` (clé de rateLimit.ts). */
export function acquireExportSlot(accountId: string, ip: string, now: () => number = Date.now): ExportSlot {
  const time = now();
  // Filet si une minuterie n'a pas pu s'exécuter (instance mise en pause, par exemple).
  for (const [id, slot] of active) if (time - slot.startedAt >= EXPORT_SLOT_TTL_MS) forget(id, slot.token);
  if (active.has(accountId)) return { status: "account-busy" };
  if (active.size >= MAX_CONCURRENT_EXPORTS) return { status: "server-busy" };
  let fromIp = 0;
  for (const slot of active.values()) if (slot.ip === ip) fromIp += 1;
  if (fromIp >= MAX_EXPORTS_PER_IP) return { status: "ip-busy" };
  const token = Symbol(accountId);
  const timer = setTimeout(() => forget(accountId, token), EXPORT_SLOT_TTL_MS);
  // La minuterie ne retient pas le processus (arrêt du serveur, fin des tests).
  timer.unref?.();
  active.set(accountId, { token, ip, startedAt: time, timer });
  return {
    status: "acquired",
    // Ne libère que sa propre place (pas celle d'un téléchargement suivant, après expiration).
    release: () => forget(accountId, token),
  };
}

/** Pour les tests : nombre d'entrées en mémoire. */
export const exportSlotCount = () => active.size;

/** Pour les tests : libère toutes les places. */
export function resetExportSlots(): void {
  for (const slot of active.values()) clearTimeout(slot.timer);
  active.clear();
}
