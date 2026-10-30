import { frenchDate } from "@/features/editor/components/fiches/format";
import { DECISION_LABELS, ITEM_KIND_LABELS, LOG_EMPTY, authorLabel, suspensionText } from "../messages";
import type { Decision } from "../types";

/**
 * Journal des décisions (200 dernières) : décision (ou retrait par l'auteur d'un élément masqué ou
 * signalé), élément, auteur, motif, suspension, modérateur, date.
 */
export default function ModerationLog({ log }: { log: readonly Decision[] }) {
  if (log.length === 0) return <p className="m-0 text-[14px] text-mute">{LOG_EMPTY}</p>;
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {log.map((d) => (
        <li key={d.id} className="grid gap-1 border-b border-line pb-3 text-[14px] last:border-b-0">
          <p className="m-0">
            <span className="brut">{DECISION_LABELS[d.action]}</span> · {ITEM_KIND_LABELS[d.itemKind]}
            {d.itemTitle && <> « {d.itemTitle} »</>}
            <span className="text-mute">
              {" "}
              · {authorLabel(d.authorHandle, d.authorName)} · {frenchDate(d.createdAt.slice(0, 10))}
            </span>
          </p>
          <p className="m-0 text-[13px] break-words whitespace-pre-wrap text-mute">
            Motif : {d.reason} · {d.reports} signalement{d.reports > 1 ? "s" : ""} traité{d.reports > 1 ? "s" : ""} ·{" "}
            {d.action === "withdraw" ? "par son auteur" : `par ${d.moderatorName ?? "un modérateur"}`}
            {d.suspendedUntil && <> · {suspensionText(d.suspendedUntil)}</>}
          </p>
        </li>
      ))}
    </ul>
  );
}
