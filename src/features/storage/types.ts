import type { MapDoc } from "@/features/map-doc/types";
import type { MapCover } from "@/features/maps/cover";

/** Longueur maximale du nom d'une carte de la banque. */
export const MAX_MAP_NAME_LENGTH = 120;

/**
 * Une carte de la banque, telle qu'elle vient d'être écrite. `updated` est une date ISO 8601.
 * `version` identifie la version du contenu dans la banque : elle change à chaque modification du
 * contenu (pas au renommage). Absente des entrées enregistrées avant son introduction.
 * `cover` : logo ou aperçu de la carte (bêta 2.1), déjà validé par le dépôt ; absent s'il n'y en a pas.
 */
export type MapEntry = { id: string; name: string; updated: string; version?: string; data: MapDoc; cover?: MapCover };

/** Version de la banque dont dérive le document d'une carte (contrôle des écritures concurrentes). */
export type SyncBase = { id: string; version: string };

/**
 * Le contenu de la carte a changé dans la banque depuis la version attendue (modification faite sur
 * un autre appareil ou dans un autre onglet) : l'écriture est refusée pour ne pas l'écraser.
 */
export class MapConflictError extends Error {
  constructor() {
    super("Carte modifiée ailleurs depuis la version attendue.");
    this.name = "MapConflictError";
  }
}

/**
 * Une carte relue depuis le dépôt : son contenu n'est pas validé (base corrompue, ancien format,
 * écriture d'une version future…). Le passer par parseMapDoc avant de l'utiliser comme MapDoc.
 */
export type StoredMapEntry = Omit<MapEntry, "data"> & {
  data: unknown;
  /**
   * Statistiques déjà calculées par le dépôt (null : carte illisible). Le dépôt distant ne transfère
   * pas le contenu des cartes pour la liste : `data` est alors null et seules ces statistiques comptent.
   */
  stats?: string | null;
};

/**
 * Dépôt des cartes : banque multi-cartes, brouillon courant et id de la carte active.
 * Les erreurs (quota, base indisponible…) remontent à l'appelant.
 */
export interface MapRepository {
  /** Toutes les cartes, de la plus récemment modifiée à la plus ancienne (contenu non validé). */
  list(): Promise<StoredMapEntry[]>;
  /** Une carte (contenu non validé) ; null si elle n'existe pas. */
  get(id: string): Promise<StoredMapEntry | null>;
  /**
   * Crée une carte. `id` n'est respecté que par le dépôt local (données de test) : la banque
   * distante choisit toujours l'identifiant, et l'application n'en propose jamais.
   */
  create(name: string, data: MapDoc, id?: string): Promise<MapEntry>;
  /**
   * Remplace le contenu d'une carte existante ; null si elle n'existe pas. Avec `expectedVersion`,
   * l'écriture n'a lieu que si le contenu est encore à cette version : sinon MapConflictError. La
   * banque distante l'exige : sans version attendue valide, elle répond aussi MapConflictError.
   */
  update(id: string, data: MapDoc, expectedVersion?: string): Promise<MapEntry | null>;
  /** Renomme une carte existante ; null si elle n'existe pas. */
  rename(id: string, name: string): Promise<StoredMapEntry | null>;
  /**
   * Remplace (ou retire, avec null) le logo ou l'aperçu d'une carte, sans changer sa date ni la
   * version de son contenu ; false si la carte n'existe pas.
   */
  setCover(id: string, cover: MapCover | null): Promise<boolean>;
  remove(id: string): Promise<void>;
  /** Brouillon courant (document non validé : à passer par parseMapDoc). */
  getDraft(): Promise<unknown>;
  setDraft(data: MapDoc): Promise<void>;
  /**
   * Déplace le brouillon courant (illisible), tel quel, sous une clé de côté, en une seule transaction :
   * la sauvegarde automatique ne l'écrasera pas et il n'est pas recopié à chaque chargement.
   */
  setAsideDraft(): Promise<void>;
  getActiveId(): Promise<string | null>;
  setActiveId(id: string | null): Promise<void>;
  /**
   * Vrai si le brouillon local contient des modifications de la carte active pas encore écrites dans
   * la banque (dépôt distant injoignable) : elles l'emportent alors sur la banque au chargement.
   */
  getPendingSync(): Promise<boolean>;
  setPendingSync(pending: boolean): Promise<void>;
  /**
   * Banque distante : version de la carte active dont dérive le brouillon local. Elle accompagne le
   * renvoi des modifications après un rechargement, pour ne pas écraser une version plus récente.
   */
  getSyncBase(): Promise<SyncBase | null>;
  setSyncBase(base: SyncBase | null): Promise<void>;
}

/** Partie « banque » d'un dépôt : les cartes elles-mêmes (sans le brouillon ni la carte active). */
export type MapBank = Pick<MapRepository, "list" | "get" | "create" | "update" | "rename" | "setCover" | "remove">;
