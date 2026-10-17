// Actions de la page « Mon espace stratégique » (bêta : ensureSynced, beginNewMap, openMap, renommer,
// supprimer). Les dépendances sont injectées pour être testées sans navigateur.
import type { AskAnswer, AskOptions, ConfirmOptions, PromptOptions } from "@/components/dialogs";
import { MAP_NAME_PROMPT, cleanMapName, defaultMapName } from "@/features/editor/persistence";
import type { Persistence } from "@/features/editor/persistence";
import type { MapCover } from "@/features/maps/cover";
import { MAX_MAP_NAME_LENGTH } from "@/features/storage";
import { COVER_SAVE_FAILED } from "./cover/texts";

export const UNSAVED_MAP_QUESTION =
  "Votre carte actuelle n’est pas enregistrée dans la banque. L’enregistrer avant de continuer ?";
export const RENAME_PROMPT = "Nouveau nom :";
export const DELETE_QUESTION = "Supprimer définitivement cette carte de la banque ?";
export const DISCARD_QUESTION =
  "Des modifications n’ont pas pu être enregistrées. Continuer quand même ? Elles seront perdues.";
export const BANK_SAVE_FAILED = "Enregistrement dans la banque impossible : votre carte actuelle n’a pas été remplacée.";
export const MAP_UNAVAILABLE = "Cette carte ne peut pas être ouverte : elle est illisible ou n’existe plus.";
export const MAP_MISSING = "Cette carte n’existe plus.";
export const BANK_UNAVAILABLE = "La banque est inaccessible : réessayez.";
export const LOAD_FAILED_QUESTION =
  "Votre carte précédente n’a pas pu être lue dans ce navigateur. La remplacer quand même ? Elle sera perdue.";
export const SIGN_OUT_UNSAVED_QUESTION =
  "Votre carte actuelle n’est pas enregistrée dans la banque : elle sera effacée de ce navigateur à la déconnexion. L’enregistrer avant de vous déconnecter ?";
export const SIGN_OUT_LOAD_FAILED_QUESTION =
  "Votre carte précédente n’a pas pu être lue dans ce navigateur : elle sera effacée à la déconnexion. Se déconnecter quand même ?";

/** Questions posées avant de quitter la carte en cours, selon l'action. */
type LeaveQuestions = { unsaved: string; loadFailed: string; loadFailedLabel: string };

const CONTINUE_QUESTIONS: LeaveQuestions = {
  unsaved: UNSAVED_MAP_QUESTION,
  loadFailed: LOAD_FAILED_QUESTION,
  loadFailedLabel: "Continuer",
};
const SIGN_OUT_QUESTIONS: LeaveQuestions = {
  unsaved: SIGN_OUT_UNSAVED_QUESTION,
  loadFailed: SIGN_OUT_LOAD_FAILED_QUESTION,
  loadFailedLabel: "Se déconnecter",
};

export type BankDeps = {
  persistence: Pick<
    Persistence,
    | "hydrate"
    | "loadFailed"
    | "isRemote"
    | "needsBankPrompt"
    | "saveToBank"
    | "openMap"
    | "newMap"
    | "renameMap"
    | "deleteMap"
    | "setMapCover"
  >;
  dialogs: {
    ask: (message: string, options: AskOptions) => Promise<AskAnswer>;
    confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
    prompt: (message: string, defaultValue?: string, options?: PromptOptions) => Promise<string | null>;
  };
  /** Message d'erreur ponctuel (toast). */
  notify: (message: string) => void;
};

/** Une erreur inattendue (base inaccessible…) est signalée, et l'action n'a pas lieu. */
async function guarded<T>(deps: BankDeps, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    deps.notify(BANK_UNAVAILABLE);
    return fallback;
  }
}

/**
 * Avant de quitter la carte en cours, sans la réécrire :
 * - si elle a du contenu sans être dans la banque, propose de l'enregistrer ;
 * - si la lecture a échoué au chargement, le brouillon stocké n'a pas pu être lu : on ne le remplace
 *   (ou ne l'efface) qu'avec l'accord de l'utilisateur (absent de la bêta).
 * Renvoie false si l'utilisateur annule ou si l'enregistrement échoue : rien n'est alors remplacé.
 * Contrairement à la bêta, annuler la saisie du nom annule tout, pour ne jamais perdre la carte.
 */
async function confirmLeavingMap(deps: BankDeps, questions: LeaveQuestions): Promise<boolean> {
  const { persistence, dialogs } = deps;
  await persistence.hydrate();
  if (persistence.needsBankPrompt()) return saveCurrentMap(deps, questions.unsaved);
  if (persistence.loadFailed()) {
    return dialogs.confirm(questions.loadFailed, { confirmLabel: questions.loadFailedLabel, destructive: true });
  }
  return true;
}

/**
 * Avant « + Nouvelle carte » (bêta, ensureSynced) : les questions de confirmLeavingMap, puis, en
 * démo comme dans la bêta, la carte active est réécrite dans la banque : elle est recréée si elle a
 * été supprimée dans un autre onglet et sa date de mise à jour remonte. Sans carte active, rien
 * n'est écrit.
 * Banque distante : rien n'est réécrit. La carte active a pu être modifiée ou supprimée depuis un
 * autre appareil ; la réécrire écraserait cette version ou annulerait la suppression. Seules les
 * modifications en attente partent (newMap), avec le contrôle de version.
 */
export async function ensureSynced(deps: BankDeps): Promise<boolean> {
  const { persistence } = deps;
  await persistence.hydrate();
  if (persistence.needsBankPrompt() || persistence.loadFailed()) return confirmLeavingMap(deps, CONTINUE_QUESTIONS);
  if (persistence.isRemote()) return true;
  // Sans carte active ni nom, saveToBank() n'écrit rien (« needs-name »).
  return (await persistence.saveToBank()) !== "failed" || bankSaveFailed(deps);
}

/**
 * Avant « Se déconnecter » : la copie locale du compte va être effacée. Une carte hors banque est
 * proposée à l'enregistrement, un brouillon illisible n'est effacé qu'avec l'accord de l'utilisateur.
 */
export function confirmSignOut(deps: BankDeps): Promise<boolean> {
  return guarded(deps, false, () => confirmLeavingMap(deps, SIGN_OUT_QUESTIONS));
}

/** Propose d'enregistrer la carte en cours, absente de la banque. */
async function saveCurrentMap(deps: BankDeps, question: string): Promise<boolean> {
  const { persistence, dialogs } = deps;
  const answer = await dialogs.ask(question, { yesLabel: "Enregistrer", noLabel: "Ne pas enregistrer" });
  if (answer !== "yes") return answer === "no";
  const name = await dialogs.prompt(MAP_NAME_PROMPT, defaultMapName(), { maxLength: MAX_MAP_NAME_LENGTH });
  if (name === null || !cleanMapName(name)) return false;
  return (await persistence.saveToBank(name)) !== "failed" || bankSaveFailed(deps);
}

function bankSaveFailed(deps: BankDeps): false {
  deps.notify(BANK_SAVE_FAILED);
  return false;
}

/**
 * Des modifications n'ont pas pu être écrites : on ne les abandonne qu'avec l'accord de l'utilisateur.
 * Si la carte active vient d'être détachée (modifiée sur un autre appareil, banque distante), sa
 * version est hors banque : on propose de l'enregistrer sous un nouveau nom. true : continuer.
 */
function confirmDiscard(deps: BankDeps): Promise<boolean> {
  const { persistence } = deps;
  if (persistence.isRemote() && persistence.needsBankPrompt()) return saveCurrentMap(deps, UNSAVED_MAP_QUESTION);
  return deps.dialogs.confirm(DISCARD_QUESTION, { confirmLabel: "Continuer", destructive: true });
}

/** « + Nouvelle carte » : carte vierge, hors banque. true : ouvrir l'éditeur. */
export function startNewMap(deps: BankDeps): Promise<boolean> {
  return guarded(deps, false, async () => {
    if (!(await ensureSynced(deps))) return false;
    if ((await deps.persistence.newMap()) === "done") return true;
    if (!(await confirmDiscard(deps))) return false;
    await deps.persistence.newMap({ discard: true });
    return true;
  });
}

/**
 * « Continuer » : ouvre une carte de la banque. true : ouvrir l'éditeur. Comme dans la bêta, la carte
 * active n'est pas réécrite (sa date ne change pas) : openMap envoie seulement les modifications en attente.
 */
export function continueMap(deps: BankDeps, id: string): Promise<boolean> {
  return guarded(deps, false, async () => {
    if (!(await confirmLeavingMap(deps, CONTINUE_QUESTIONS))) return false;
    let result = await deps.persistence.openMap(id);
    if (result === "unsaved") {
      if (!(await confirmDiscard(deps))) return false;
      result = await deps.persistence.openMap(id, { discard: true });
    }
    if (result === "unavailable") {
      deps.notify(MAP_UNAVAILABLE);
      return false;
    }
    return true;
  });
}

/** « Renommer » : nouveau nom demandé, prérempli avec le nom actuel ; un nom vide ne change rien. */
export function renameMap(deps: BankDeps, map: { id: string; name: string }): Promise<void> {
  return guarded(deps, undefined, async () => {
    const name = await deps.dialogs.prompt(RENAME_PROMPT, map.name, { maxLength: MAX_MAP_NAME_LENGTH });
    if (name === null || !cleanMapName(name)) return;
    if (!(await deps.persistence.renameMap(map.id, name))) deps.notify(MAP_MISSING);
  });
}

/**
 * « Logo » : enregistre le logo ou l'aperçu choisi (null : le retirer). true s'il est enregistré ;
 * sinon le problème est signalé (carte disparue entre-temps, banque inaccessible).
 */
export async function setCover(deps: BankDeps, id: string, cover: MapCover | null): Promise<boolean> {
  try {
    if (await deps.persistence.setMapCover(id, cover)) return true;
    deps.notify(MAP_MISSING);
  } catch {
    deps.notify(COVER_SAVE_FAILED);
  }
  return false;
}

/** « Supprimer » après confirmation ; si c'était la carte active, elle ne l'est plus. true : carte supprimée. */
export function deleteMap(deps: BankDeps, id: string): Promise<boolean> {
  return guarded(deps, false, async () => {
    const confirmed = await deps.dialogs.confirm(DELETE_QUESTION, { confirmLabel: "Supprimer", destructive: true });
    if (confirmed) await deps.persistence.deleteMap(id);
    return confirmed;
  });
}
