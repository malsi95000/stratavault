// Plusieurs onglets de l'éditeur sur la même base locale de ce navigateur.
//
// Pourquoi : la carte en cours (brouillon) est une seule entrée de la base locale. En mode démo,
// rien ne contrôle les versions : deux onglets ouverts s'écrasent l'un l'autre, la dernière écriture
// l'emporte (comme dans la bêta). En mode compte, la banque distante détecte le conflit, mais le
// brouillon local reste commun. On ne bloque rien ; chaque onglet prévient l'utilisateur dès qu'un
// autre onglet de l'éditeur utilise la même base.

/** Mode démo : rien ne contrôle les versions, le dernier enregistrement l'emporte. */
export const OTHER_TAB_WARNING =
  "L’éditeur est aussi ouvert dans un autre onglet de ce navigateur : les deux onglets partagent la carte en cours et le dernier enregistrement écrase l’autre. Gardez un seul onglet ouvert.";

/**
 * Mode compte : la banque refuse d'écraser une version plus récente (l'onglet en retard est détaché),
 * mais le brouillon de ce navigateur reste commun aux deux onglets.
 */
export const OTHER_TAB_WARNING_ACCOUNT =
  "L’éditeur est aussi ouvert dans un autre onglet de ce navigateur : la banque n’écrase pas une version plus récente, mais les deux onglets partagent la copie de ce navigateur. Gardez un seul onglet ouvert.";

/** Avertissement adapté au mode de la session (compte : banque distante, sinon démo). */
export const otherTabWarning = (account: boolean): string => (account ? OTHER_TAB_WARNING_ACCOUNT : OTHER_TAB_WARNING);

/** Canal des onglets de l'éditeur (BroadcastChannel). */
export const EDITOR_TABS_CHANNEL = "stratavault-editeur";

/** « hello » : un onglet s'ouvre ; « here » : réponse d'un onglet déjà ouvert. */
type PresenceMessage = { type: "hello" | "here"; key: string; tab: string };

/** Ce dont on a besoin d'un BroadcastChannel (remplaçable dans les tests). */
export type PresenceChannel = {
  postMessage: (message: PresenceMessage) => void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
};

const isPresence = (data: unknown): data is PresenceMessage => {
  if (typeof data !== "object" || data === null) return false;
  const message = data as Partial<PresenceMessage>;
  return (message.type === "hello" || message.type === "here") && typeof message.key === "string" && typeof message.tab === "string";
};

/**
 * Annonce cet onglet sur `channel` pour la base `key` et appelle `onOtherTab` chaque fois qu'un autre
 * onglet de l'éditeur utilise la même base (celui qui s'ouvre comme celui qui l'était déjà).
 * Renvoie la fonction qui arrête l'écoute.
 */
export function watchOtherTabs(
  channel: PresenceChannel,
  key: string,
  onOtherTab: () => void,
  // Simple étiquette de l'onglet (crypto.randomUUID n'existe qu'en contexte sécurisé).
  tab: string = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
): () => void {
  channel.onmessage = (event) => {
    const message = event.data;
    if (!isPresence(message) || message.key !== key || message.tab === tab) return;
    if (message.type === "hello") channel.postMessage({ type: "here", key, tab });
    onOtherTab();
  };
  channel.postMessage({ type: "hello", key, tab });
  return () => {
    channel.onmessage = null;
  };
}
