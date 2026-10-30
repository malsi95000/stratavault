// Décisions proposées dans la file de modération selon l'état d'un élément (mêmes cas que la base :
// une décision sans effet y répond « unchanged », masquer ou rétablir un élément retiré « not-found »).
import { MAX_MODERATION_PAGE, MODERATION_PAGE_SIZE } from "./limits";
import { MODERATION_PAGE } from "./paths";
import type { ModerationAction, QueueStatus } from "./types";

/** Décisions utiles pour un élément `status` qui a `openReports` signalements en attente. */
export function availableActions(status: QueueStatus, openReports: number): ModerationAction[] {
  if (status === "withdrawn") return ["delete", "dismiss"];
  const actions: ModerationAction[] = status === "visible" ? ["hide", "delete"] : ["restore", "delete"];
  if (openReports > 0) actions.push("dismiss");
  return actions;
}

/** Page de la file demandée dans l'adresse (« ?page=2 », numérotée à partir de 1) : 0 par défaut ou si elle est invalide. */
export function queuePageOf(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,4}$/.test(value)) return 0;
  return Math.min(Number(value) - 1, MAX_MODERATION_PAGE);
}

/** Nombre de pages de la file pour `total` éléments (au moins une). */
export const queuePages = (total: number) => Math.max(1, Math.ceil(total / MODERATION_PAGE_SIZE));

/** Adresse de la page `page` (à partir de 0) de la file. */
export const queuePagePath = (page: number) => (page === 0 ? `${MODERATION_PAGE}#file` : `${MODERATION_PAGE}?page=${page + 1}#file`);
