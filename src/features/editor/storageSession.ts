// Dépôt et persistance de la session en cours (navigateur uniquement). Le mode (démo ou compte)
// vient du Server Component de la page ; changer de mode (autre compte, démo) repart d'un éditeur
// vide, pour qu'aucune carte d'un compte ne s'affiche dans un autre. Une déconnexion (ou la
// suppression du compte) dans un autre onglet ferme aussi la session de celui-ci et recharge la page ;
// de même pour l'effacement des données de démo.
import { deleteDB } from "idb";
import { createMap, deleteMap, getMap, listMaps, renameMap, setMapCover, updateMap } from "@/features/maps/actions";
import { DEMO_MODE, createRepositoryFor, localDbName, purgeAccountCopies, storageKey } from "@/features/storage";
import type { MapRepository, RemoteMapsApi, StorageMode } from "@/features/storage";
import { createPersistence } from "./persistence";
import type { Persistence } from "./persistence";
import { persistenceOptionsFor } from "./saveProfiles";
import { useEditorStore } from "./store";
import { useViewStore } from "./viewStore";

type Session = { key: string; mode: StorageMode; repo: MapRepository; persistence: Persistence };

const remote: RemoteMapsApi = { listMaps, getMap, createMap, updateMap, renameMap, setMapCover, deleteMap };

let session: Session | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export function subscribeStorage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mode de la session active ; null avant activation ou après la déconnexion. */
export const activeStorageMode = (): StorageMode | null => session?.mode ?? null;

/** Messages entre les onglets de ce navigateur. */
const ACCOUNT_CHANNEL = "stratavault-comptes";
/** « signed-out » : déconnexion ou suppression du compte ; « demo-cleared » : données de démo effacées. */
type AccountMessage = { type: "signed-out"; userId: string } | { type: "demo-cleared" };

/** Clé de la session que le message `data` a fermée ; null pour tout autre message. */
function endedSessionKey(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as { type?: unknown; userId?: unknown };
  if (message.type === "signed-out" && typeof message.userId === "string") {
    return storageKey({ kind: "account", userId: message.userId });
  }
  return message.type === "demo-cleared" ? storageKey(DEMO_MODE) : null;
}

let channel: BroadcastChannel | null = null;

/** Canal partagé avec les autres onglets (navigateur uniquement). */
function accountChannel(): BroadcastChannel | null {
  if (channel || typeof window === "undefined" || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel(ACCOUNT_CHANNEL);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const key = endedSessionKey(event.data);
    if (key) endedElsewhere(key);
  };
  return channel;
}

/**
 * La session a pris fin dans un autre onglet (déconnexion, compte supprimé, base locale effacée) :
 * rien n'est plus écrit ici, l'éditeur est vidé et la page rechargée (le proxy mène à la connexion ;
 * en démo, la page repart d'une base vide).
 */
function endedElsewhere(key: string) {
  if (session?.key !== key) return;
  closeSession();
  notify();
  if (typeof window !== "undefined") window.location.reload();
}

/** Arrête la persistance en cours et vide l'éditeur (document, sélection, statut). */
function closeSession() {
  if (!session) return;
  session.persistence.dispose();
  session = null;
  useEditorStore.setState(useEditorStore.getInitialState(), true);
}

/** Active le dépôt du mode donné (sans effet s'il l'est déjà). À appeler depuis un effet. */
export function activateStorage(mode: StorageMode) {
  const key = storageKey(mode);
  if (session?.key === key) return;
  closeSession();
  // Toujours un éditeur vide au départ, même si rien n'était actif : rien d'une session précédente
  // (lecture terminée après sa fermeture…) ne peut s'afficher dans celle-ci.
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  const repo = createRepositoryFor(mode, { remote, onLocalDatabaseClosed: () => endedElsewhere(key) });
  session = { key, mode, repo, persistence: createPersistence(repo, useEditorStore, persistenceOptionsFor(mode)) };
  accountChannel();
  // Copies locales d'autres comptes restées dans ce navigateur (session expirée, déconnexion sans JavaScript…).
  void purgeAccountCopies(mode, { inUse: (name) => session?.key === name });
  notify();
}

/** Persistance de la session active (les composants qui l'utilisent sont rendus sous StorageScope). */
export function getPersistence(): Persistence {
  if (!session) throw new Error("Aucun dépôt actif : rendre ce composant sous <StorageScope>.");
  return session.persistence;
}

/** Force l'écriture de la sauvegarde en attente (avant une navigation) ; false si elle a échoué. */
export function flush(): Promise<boolean> {
  return session ? session.persistence.flush() : Promise.resolve(true);
}

const DELETE_TIMEOUT_MS = 3000;

/**
 * Issue de l'effacement d'une base locale :
 * - `deleted` : effacée ;
 * - `pending` : pas encore effacée au bout du délai, en général parce qu'un autre onglet garde la base
 *   ouverte ; la demande n'est pas annulée et aboutira dès que cette connexion se fermera ;
 * - `failed` : refusée par le navigateur, rien n'a été effacé.
 */
export type LocalDeletion = "deleted" | "pending" | "failed";

/** Efface une base locale ; n'attend pas indéfiniment un autre onglet qui la garderait ouverte. */
function deleteLocalDatabase(name: string): Promise<LocalDeletion> {
  const timeout = new Promise<LocalDeletion>((resolve) => setTimeout(() => resolve("pending"), DELETE_TIMEOUT_MS));
  const deleted = deleteDB(name).then(
    (): LocalDeletion => "deleted",
    (): LocalDeletion => "failed",
  );
  return Promise.race([deleted, timeout]);
}

/** Questions posées avant la déconnexion ; chacune renvoie false si l'utilisateur reste connecté. */
export type SignOutChecks = {
  /** Carte en cours absente de la banque, ou brouillon illisible : proposer de l'enregistrer, ou confirmer. */
  beforeLeave: (persistence: Persistence) => Promise<boolean>;
  /** Des modifications n'ont pas pu être envoyées (ici ou dans un autre onglet) : confirmer leur perte. */
  confirmLoss: () => Promise<boolean>;
};

/** Drapeau « à envoyer » de la base locale (il peut venir d'un autre onglet du même compte). */
async function storedPendingSync(repo: MapRepository): Promise<boolean> {
  try {
    return await repo.getPendingSync();
  } catch {
    return false;
  }
}

/**
 * Première étape de la déconnexion, avant l'appel au serveur : pose les questions (`checks`), envoie
 * les modifications en attente, puis ferme la session de l'éditeur (plus rien n'est écrit). Rien
 * n'est effacé : si la déconnexion échoue ensuite, `activateStorage` rouvre le compte tel quel.
 * false : l'utilisateur a choisi de rester connecté, la session reste ouverte.
 */
export async function prepareSignOut(userId: string, checks: SignOutChecks): Promise<boolean> {
  const mode: StorageMode = { kind: "account", userId };
  activateStorage(mode);
  const current = session;
  if (!current) return true;
  if (!(await checks.beforeLeave(current.persistence))) return false;
  const outOfBank = current.persistence.needsBankPrompt();
  await current.persistence.flush();
  // Carte active détachée pendant l'envoi (modifiée sur un autre appareil) : la version de cet
  // appareil n'est plus dans la banque, elle est proposée à l'enregistrement avant d'être effacée.
  if (!outOfBank && current.persistence.needsBankPrompt() && !(await checks.beforeLeave(current.persistence))) {
    return false;
  }
  const unsent = current.persistence.hasUnsentChanges() || (await storedPendingSync(current.repo));
  if (unsent && !(await checks.confirmLoss())) return false;
  // Une déconnexion dans un autre onglet a pu fermer la session pendant les questions.
  if (session === current) {
    closeSession();
    notify();
  }
  return true;
}

/**
 * Seconde étape, une fois la session fermée côté serveur : les autres onglets du compte sont
 * fermés et la copie locale du compte est effacée de ce navigateur.
 */
export async function finishSignOut(userId: string): Promise<void> {
  const message: AccountMessage = { type: "signed-out", userId };
  accountChannel()?.postMessage(message);
  await deleteLocalDatabase(localDbName({ kind: "account", userId }));
}

/** Ferme la session de l'éditeur si elle utilise la base `key` (plus rien n'y est écrit). */
function closeSessionOf(key: string) {
  if (session?.key !== key) return;
  closeSession();
  notify();
}

/**
 * Après la suppression du compte (page « Mon compte ») : comme une déconnexion, les autres onglets
 * du compte sont fermés et la copie locale du compte est effacée de ce navigateur.
 */
export async function forgetDeletedAccount(userId: string): Promise<void> {
  // Session encore ouverte dans cet onglet (navigation depuis /espace) : fermée d'abord, pour que
  // l'effacement de sa base ne recharge pas la page.
  closeSessionOf(storageKey({ kind: "account", userId }));
  await finishSignOut(userId);
}

/**
 * Mode démo, « Effacer les données de ce navigateur » : ferme la session de démo (ici et dans les
 * autres onglets, qui se rechargent) et efface la base IndexedDB de la démo, puis la vue mémorisée
 * (localStorage), sauf si l'effacement de la base a échoué (rien n'est alors effacé). Si la base
 * n'est pas effacée tout de suite (`pending` : un autre onglet la garde ouverte) ou ne peut pas
 * l'être, la session de démo est rouverte ; dans le premier cas, elle repartira d'une base vide une
 * fois l'effacement terminé.
 */
export async function clearDemoData(): Promise<LocalDeletion> {
  closeSessionOf(storageKey(DEMO_MODE));
  const message: AccountMessage = { type: "demo-cleared" };
  accountChannel()?.postMessage(message);
  const result = await deleteLocalDatabase(localDbName(DEMO_MODE));
  if (result !== "failed") useViewStore.persist.clearStorage();
  if (result !== "deleted") activateStorage(DEMO_MODE);
  return result;
}
