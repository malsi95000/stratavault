// Formes de la carte collective telles que l'application les manipule (voir
// src/lib/supabase/collective.ts). Les autres membres n'y sont désignés que par leur nom affiché et leur
// identifiant public (@handle, unique : c'est lui qui distingue deux auteurs du même nom) ; jamais par
// leur identifiant de compte.
import type { FluxColor, LonLat, PingType, Ref } from "@/features/map-doc/types";

/** Sortes d'éléments de la carte collective (même liste que la base). */
export const ITEM_KINDS = ["ping", "point", "text", "zone", "link", "flux"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const isItemKind = (value: unknown): value is ItemKind => (ITEM_KINDS as readonly unknown[]).includes(value);

/** Fiche d'un élément : titre, notes, date facultative (AAAA-MM-JJ). */
type Fiche = { title: string; note: string; date?: string };

export type PingData = Fiche & { ll: LonLat; type: PingType };
export type PointData = Fiche & { ll: LonLat };
export type TextData = Fiche & { ll: LonLat; size?: number };
export type ZoneData = Fiche & { ring: LonLat[] };
export type LinkData = Fiche & { a: Ref; b: Ref };
export type FluxData = { color: FluxColor; points: LonLat[]; width: number; opacity?: number };

export type ItemDataOf = {
  ping: PingData;
  point: PointData;
  text: TextData;
  zone: ZoneData;
  link: LinkData;
  flux: FluxData;
};

/** Élément (sorte, identifiant, contenu) tel qu'il s'écrit dans la base. */
export type ItemContent = { [K in ItemKind]: { kind: K; id: string; data: ItemDataOf[K] } }[ItemKind];

/** Élément de la carte tel que le compte connecté le voit. */
export type CollectiveItem = ItemContent & {
  /** Nom affiché de l'auteur ; null s'il n'a plus de profil. */
  authorName: string | null;
  /** Identifiant public de l'auteur (unique) ; null s'il n'a plus de profil. */
  authorHandle: string | null;
  /** Élément du compte connecté. */
  mine: boolean;
  createdAt: string;
  updatedAt: string;
};

/** État de la carte pour le compte connecté. */
export type CollectiveState = {
  revision: number;
  isModerator: boolean;
  /** Il faut un profil pour ajouter ou modifier un élément (il est signé de son nom affiché). */
  hasProfile: boolean;
  unreadNotices: number;
  myItems: number;
  /** Fin de la suspension de ses contributions par la modération (ISO) ; null s'il n'est pas suspendu. */
  suspendedUntil: string | null;
};

/** Réponses des écritures. */
export const CREATE_RESULTS = ["created", "suspended", "id-taken", "invalid-link", "author-full", "daily-full", "map-full"] as const;
export type CreateStatus = (typeof CREATE_RESULTS)[number];
/**
 * Version de la carte juste avant (`from`) et juste après (`to`) une écriture du compte, lues sous le
 * verrou de la carte ; null pour une réponse donnée avant le verrou. Si `from` est la version que la
 * session connaît, personne d'autre n'a changé la carte : elle n'a pas à la relire.
 */
export type RevisionStep = { from: number; to: number };
export type CreateResult = { status: CreateStatus; authorName: string | null; createdAt: string | null; step: RevisionStep | null };
export const UPDATE_RESULTS = ["updated", "unchanged", "suspended", "not-found", "invalid", "author-full", "daily-full", "map-full"] as const;
export type UpdateStatus = (typeof UPDATE_RESULTS)[number];
export type UpdateResult = { status: UpdateStatus; step: RevisionStep | null };
export const DELETE_RESULTS = ["deleted", "not-found"] as const;
export type DeleteStatus = (typeof DELETE_RESULTS)[number];
export type DeleteResult = { status: DeleteStatus; step: RevisionStep | null };
export const REPORT_RESULTS = ["reported", "already-reported", "own-item", "not-found"] as const;
export type ReportResult = (typeof REPORT_RESULTS)[number];
/** Réponses du blocage de l'auteur d'un élément (block_collective_author). */
export const BLOCK_AUTHOR_RESULTS = ["blocked", "blocks-full", "own-item", "not-found"] as const;
export type BlockAuthorResult = (typeof BLOCK_AUTHOR_RESULTS)[number];

/** Motifs d'un signalement (même liste que la base). */
export const REPORT_REASONS = ["illegal", "hate", "harassment", "personal-data", "misinformation", "spam", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Décisions qu'un modérateur peut prendre (même liste que la base). */
export const MODERATION_ACTIONS = ["hide", "restore", "delete", "dismiss"] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];
/** Décisions qui peuvent s'accompagner d'une suspension des contributions de l'auteur. */
export const SUSPENDING_ACTIONS: readonly ModerationAction[] = ["hide", "delete"];
/**
 * Entrées du journal : décisions des modérateurs, et « withdraw », retrait par son auteur d'un élément
 * masqué ou signalé (inscrit par la base, sans modérateur).
 */
export const DECISION_ACTIONS = [...MODERATION_ACTIONS, "withdraw"] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];
export const isDecisionAction = (value: unknown): value is DecisionAction =>
  (DECISION_ACTIONS as readonly unknown[]).includes(value);
export const MODERATE_RESULTS = ["hidden", "restored", "deleted", "dismissed", "unchanged", "own-item", "not-found"] as const;
export type ModerateResult = (typeof MODERATE_RESULTS)[number];

/** Avis de modération du compte connecté. */
export type CollectiveNotice = {
  id: string;
  /** « author » : décision sur l'un de ses éléments ; « reporter » : son signalement a été traité. */
  role: "author" | "reporter";
  action: DecisionAction;
  itemId: string;
  itemKind: ItemKind;
  itemTitle: string;
  reason: string;
  /**
   * Avis d'auteur : nombre de signalements traités par la décision (0 : décision prise à l'initiative
   * de la modération) ; avis d'un membre qui a signalé : null.
   */
  reports: number | null;
  /** Fin de la suspension de ses contributions prononcée avec la décision (avis d'auteur) ; sinon null. */
  suspendedUntil: string | null;
  /** L'élément du compte est encore masqué : il peut le supprimer. */
  itemHidden: boolean;
  createdAt: string;
  readAt: string | null;
};

/**
 * Élément masqué du compte connecté, proposé à la suppression dans la fenêtre des avis (même
 * après l'effacement de son avis).
 */
export type HiddenItem = { id: string; kind: ItemKind; title: string; updatedAt: string };

/**
 * États d'un élément de la file : visible, masqué, ou « withdrawn » (retiré par son auteur alors
 * qu'il avait des signalements en attente : ils restent à juger).
 */
export const QUEUE_STATUSES = ["visible", "hidden", "withdrawn"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/** Élément de la file de modération. */
export type QueueItem = {
  id: string;
  kind: ItemKind;
  /** Contenu actuel ; pour un élément retiré, le dernier contenu signalé (null s'il n'a pas été copié). */
  data: unknown;
  status: QueueStatus;
  authorHandle: string | null;
  authorName: string | null;
  /** Null pour un élément retiré. */
  createdAt: string | null;
  updatedAt: string | null;
  openReports: number;
  reasons: ReportReason[];
  details: string[];
  lastReportAt: string | null;
  /**
   * Autres contenus signalés, qui diffèrent de `data` (l'auteur a modifié l'élément depuis), du plus
   * ancien au plus récent ; à revalider avant affichage.
   */
  reportedData: unknown[];
};

/** Décision du journal de modération. */
export type Decision = {
  id: string;
  action: DecisionAction;
  itemId: string;
  itemKind: ItemKind;
  itemTitle: string;
  reason: string;
  reports: number;
  /** Fin de la suspension de l'auteur prononcée avec la décision ; null : aucune. */
  suspendedUntil: string | null;
  /** Nom affiché du modérateur ; null pour un retrait par l'auteur ou un modérateur sans profil. */
  moderatorName: string | null;
  authorHandle: string | null;
  authorName: string | null;
  createdAt: string;
};
