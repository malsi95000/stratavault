// Interface de la persistance de l'éditeur (voir persistence.ts) et textes de la banque partagés
// avec l'éditeur et la page « Mon espace stratégique ».
import { MAX_MAP_NAME_LENGTH } from "@/features/storage";
import type { StoredMapEntry } from "@/features/storage";
import type { MapDoc } from "@/features/map-doc/types";

export const bankUpdated = (name: string) => `Mis à jour dans la banque : « ${name} »`;
export const bankCreated = (name: string) => `Enregistré dans la banque : « ${name} »`;
/** Question posée pour nommer une nouvelle carte de la banque. */
export const MAP_NAME_PROMPT = "Nom de cette carte :";
/** Nom proposé pour une nouvelle carte de la banque. */
export const defaultMapName = (date: Date = new Date()) => `Carte du ${date.toLocaleDateString("fr-FR")}`;
/** Nom saisi, sans espaces superflus et borné ; chaîne vide si rien n'a été saisi. */
export const cleanMapName = (name: string) => name.trim().slice(0, MAX_MAP_NAME_LENGTH).trim();

export type BankSaveResult = "updated" | "created" | "needs-name" | "failed";
/** « unavailable » : carte absente ou illisible ; « unsaved » : des modifications n'ont pas pu être enregistrées. */
export type OpenMapResult = "opened" | "unavailable" | "unsaved";
export type NewMapResult = "done" | "unsaved";
/** discard : remplacer le document même si des modifications n'ont pas pu être enregistrées (perte confirmée). */
export type SwitchOptions = { discard?: boolean };

export type Persistence = {
  /**
   * Charge le brouillon et l'id de la carte active (une seule fois). Une donnée illisible n'est jamais
   * écrasée : un brouillon illisible est mis de côté, une carte illisible cesse d'être la carte active.
   * Si une lecture échoue, aucune carte n'est rattachée à la banque et la sauvegarde automatique reste
   * suspendue (rien n'est écrit) jusqu'à une action explicite : ouvrir une carte, nouvelle carte, importer
   * ou enregistrer dans la banque.
   */
  hydrate: () => Promise<void>;
  /**
   * Écrit immédiatement la sauvegarde en attente (avant une navigation) ; false si des modifications
   * ne sont pas enregistrées (échec d'écriture, ou sauvegarde suspendue après un échec de lecture).
   */
  flush: () => Promise<boolean>;
  /**
   * Vrai si la lecture a échoué au chargement et qu'aucune action explicite n'a encore repris la
   * sauvegarde : le brouillon stocké n'a peut-être pas été lu, le remplacer pourrait le perdre.
   */
  loadFailed: () => boolean;
  /**
   * Vrai avec une banque distante (mode compte) : elle est partagée avec les autres appareils du
   * compte, qui peuvent modifier ou supprimer la carte active à tout moment.
   */
  isRemote: () => boolean;
  /**
   * Vrai si la dernière écriture n'a échoué qu'à l'envoi vers la banque distante : les modifications
   * sont dans le brouillon local, marquées « à envoyer » (nouvel essai, ou renvoi au chargement).
   */
  keptLocally: () => boolean;
  /** Vrai si la carte en cours a du contenu sans être dans la banque (proposer de l'enregistrer). À appeler après hydrate(). */
  needsBankPrompt: () => boolean;
  /**
   * « Enregistrer dans la banque » / « Mettre à jour la banque ». Sans carte active, un nom est requis.
   * Banque distante : si la carte active a été modifiée ailleurs, elle n'est pas écrasée mais détachée
   * (« failed », la version de ce navigateur reste dans l'éditeur, hors banque). Si elle a été
   * supprimée ailleurs, elle est recréée sous un nouvel identifiant (« created »).
   */
  saveToBank: (name?: string) => Promise<BankSaveResult>;
  /**
   * Ouvre une carte de la banque dans l'éditeur. Rien ne change si elle n'existe pas ou est illisible
   * (« unavailable »), ni si les modifications en cours n'ont pas pu être enregistrées (« unsaved » :
   * proposer d'exporter, puis rappeler avec { discard: true } si l'utilisateur accepte la perte).
   * Banque distante : « unsaved » aussi si la carte active vient d'être détachée (supprimée ou
   * modifiée sur un autre appareil) : needsBankPrompt() est alors vrai, proposer de l'enregistrer.
   */
  openMap: (id: string, options?: SwitchOptions) => Promise<OpenMapResult>;
  /** Démarre une carte vierge, hors banque ; « unsaved » comme pour openMap. */
  newMap: (options?: SwitchOptions) => Promise<NewMapResult>;
  /**
   * Remplace le document par une carte importée (la carte active est conservée, comme dans la bêta).
   * Attend la fin de l'hydratation, pour que le brouillon chargé ne remplace pas l'import.
   */
  importDoc: (doc: MapDoc) => Promise<void>;
  /** Cartes de la banque, de la plus récemment modifiée à la plus ancienne (contenu non validé). */
  listMaps: () => Promise<StoredMapEntry[]>;
  /** Renomme une carte ; false si le nom est vide ou si la carte n'existe plus. */
  renameMap: (id: string, name: string) => Promise<boolean>;
  /** Supprime une carte ; si c'était la carte active, elle ne l'est plus (le document reste dans l'éditeur). */
  deleteMap: (id: string) => Promise<void>;
  /**
   * Vrai si des modifications ne sont ni dans la banque ni dans le brouillon, ou (banque distante)
   * seulement dans le brouillon local. À appeler après flush().
   */
  hasUnsentChanges: () => boolean;
  /** Arrête la sauvegarde automatique. */
  dispose: () => void;
};
