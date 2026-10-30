import { frenchDate } from "@/features/editor/components/fiches/format";
import {
  CONTENT_NOT_KEPT,
  CONTENT_UNREADABLE,
  QUEUE_EMPTY,
  REPORTED_VERSION,
  REPORT_REASON_LABELS,
  STATUS_LABELS,
  WITHDRAWN_NOTE,
  authorLabel,
  reportsLabel,
} from "../messages";
import { summarizeItem, type ItemSummary } from "../summary";
import type { QueueItem } from "../types";
import ModerationForm from "./ModerationForm";

const day = (iso: string) => frenchDate(iso.slice(0, 10));

/** Contenu d'un élément de la file : non conservé (élément retiré sans copie), illisible, ou résumé. */
function ItemBody({ item, summary }: { item: QueueItem; summary: ItemSummary | null }) {
  if (item.data === null) return <p className="m-0 text-[13px] text-mute">{CONTENT_NOT_KEPT}</p>;
  return <SummaryBody summary={summary} />;
}

/** Contenu résumé d'un élément : emplacement, date, notes (texte brut, jamais interprété). */
function SummaryBody({ summary }: { summary: ItemSummary | null }) {
  if (!summary) return <p className="m-0 text-[13px] text-danger">{CONTENT_UNREADABLE}</p>;
  return (
    <>
      <p className="m-0 text-[13px] text-mute">
        {summary.where}
        {summary.date && <> · daté du {frenchDate(summary.date)}</>}
      </p>
      {summary.note && <p className="m-0 max-h-40 overflow-y-auto break-words whitespace-pre-wrap">{summary.note}</p>}
    </>
  );
}

/**
 * Contenus signalés que l'auteur a modifiés depuis : la décision porte aussi sur eux (l'auteur pourrait
 * remettre ce qui a été signalé).
 */
function ReportedVersions({ item }: { item: QueueItem }) {
  if (item.reportedData.length === 0) return null;
  return (
    <div className="grid gap-2 rounded-[6px] border border-danger-line p-2.5">
      <p className="m-0 text-[13px] text-danger">{REPORTED_VERSION}</p>
      {item.reportedData.map((data, i) => {
        const summary = summarizeItem(item.kind, item.id, data);
        return (
          <div key={i} className="grid gap-1">
            {summary?.title && <p className="m-0">« {summary.title} »</p>}
            <SummaryBody summary={summary} />
          </div>
        );
      })}
    </div>
  );
}

/** Un élément de la file : contenu résumé (texte brut, jamais interprété), auteur, signalements, décision. */
function QueueEntry({ item, userId }: { item: QueueItem; userId: string }) {
  const summary = item.data === null ? null : summarizeItem(item.kind, item.id, item.data);
  return (
    <li className="grid gap-2 border-b border-line pb-4 text-[14px] last:border-b-0">
      <p className="m-0">
        <span className="brut">{summary?.kind ?? item.kind}</span>
        {summary?.title && <> · « {summary.title} »</>}
        <span className="text-mute">
          {" "}
          · {STATUS_LABELS[item.status]} · {authorLabel(item.authorHandle, item.authorName)}
          {item.createdAt && <> · ajouté le {day(item.createdAt)}</>}
        </span>
      </p>
      {item.status === "withdrawn" && <p className="m-0 text-[13px] text-danger">{WITHDRAWN_NOTE}</p>}
      <ItemBody item={item} summary={summary} />
      <ReportedVersions item={item} />
      <p className="m-0 text-[13px]">
        {reportsLabel(item.openReports)}
        {item.reasons.length > 0 && <> : {item.reasons.map((r) => REPORT_REASON_LABELS[r]).join(", ")}</>}
        {item.lastReportAt && <span className="text-mute"> · dernier le {day(item.lastReportAt)}</span>}
      </p>
      {item.details.length > 0 && (
        <ul className="m-0 grid list-disc gap-1 pl-5 text-[13px] text-mute">
          {item.details.map((detail, i) => (
            <li key={i} className="break-words whitespace-pre-wrap">
              {detail}
            </li>
          ))}
        </ul>
      )}
      <ModerationForm key={`${item.status}-${item.openReports}`} userId={userId} itemId={item.id} status={item.status} openReports={item.openReports} />
    </li>
  );
}

/** File de modération : éléments signalés, puis masqués. */
export default function ModerationQueue({ queue, userId }: { queue: readonly QueueItem[]; userId: string }) {
  if (queue.length === 0) return <p className="m-0 text-[14px] text-mute">{QUEUE_EMPTY}</p>;
  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {queue.map((item) => (
        <QueueEntry key={item.id} item={item} userId={userId} />
      ))}
    </ul>
  );
}
