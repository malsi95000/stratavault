import type { Metadata } from "next";
import Link from "next/link";
import SessionProblem from "@/components/auth/SessionProblem";
import { navLink } from "@/components/auth/styles";
import AccountSection from "@/features/account/components/AccountSection";
import { getPageSession } from "@/features/auth/getPageSession";
import CollectiveNoAccount from "@/features/collective/components/CollectiveNoAccount";
import ModerationLog from "@/features/collective/components/ModerationLog";
import ModerationQueue from "@/features/collective/components/ModerationQueue";
import {
  COLLECTIVE_TITLE,
  LOG_TITLE,
  MODERATION_FORBIDDEN,
  MODERATION_LEAD,
  MODERATION_TITLE,
  QUEUE_NEXT,
  QUEUE_PAGE_EMPTY,
  QUEUE_PREVIOUS,
  queueTitle,
} from "@/features/collective/messages";
import { queuePageOf, queuePagePath, queuePages } from "@/features/collective/moderation";
import { COLLECTIVE_PAGE, MODERATION_PAGE } from "@/features/collective/paths";
import type { Decision, QueueItem } from "@/features/collective/types";
import ProfileShell from "@/features/profiles/components/ProfileShell";
import { CollectiveDataError, getModerationLog, getModerationQueue } from "@/lib/supabase/collective";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: MODERATION_TITLE, robots: { index: false } };

type Reading =
  | { kind: "ok"; queue: QueueItem[]; total: number; log: Decision[] }
  | { kind: "forbidden" }
  | { kind: "unavailable" };

/** Page `page` de la file, et journal ; « forbidden » pour un compte qui n'est pas modérateur (la base le vérifie). */
async function read(page: number): Promise<Reading> {
  const db = await createClient();
  if (!db) return { kind: "unavailable" };
  try {
    const { items: queue, total } = await getModerationQueue(db, page);
    const log = await getModerationLog(db);
    return { kind: "ok", queue, total, log };
  } catch (error) {
    if (error instanceof CollectiveDataError && error.kind === "forbidden") return { kind: "forbidden" };
    return { kind: "unavailable" };
  }
}

const text = "m-0 max-w-[62ch] text-[14px] text-mute";

/** Liens vers la page précédente et la suivante de la file (rien s'il n'y a qu'une page). */
function QueuePager({ page, pages }: { page: number; pages: number }) {
  if (page === 0 && pages <= 1) return null;
  return (
    <nav aria-label="Pages de la file" className="flex flex-wrap gap-4">
      {page > 0 && (
        <Link href={queuePagePath(Math.min(page, pages) - 1)} className={navLink}>
          {QUEUE_PREVIOUS}
        </Link>
      )}
      {page + 1 < pages && (
        <Link href={queuePagePath(page + 1)} className={navLink}>
          {QUEUE_NEXT}
        </Link>
      )}
    </nav>
  );
}

// Modération de la carte collective (modérateurs désignés dans public.moderators). Session vérifiée
// auprès de l'API Auth (getUser) ; le rôle est vérifié par la base à chaque lecture et décision.
// File par pages (« ?page=2 ») : aucun signalement en attente n'en disparaît, si nombreux soient-ils.
export default async function ModerationPage({ searchParams }: PageProps<"/carte-collective/moderation">) {
  const session = await getPageSession();
  if (session.kind === "unavailable" || session.kind === "signed-out") {
    return <SessionProblem kind={session.kind} retry={MODERATION_PAGE} />;
  }
  if (session.kind === "demo") return <CollectiveNoAccount />;
  const page = queuePageOf((await searchParams).page);
  const reading = await read(page);
  if (reading.kind === "unavailable") return <SessionProblem kind="unavailable" retry={MODERATION_PAGE} />;

  return (
    <ProfileShell title={MODERATION_TITLE}>
      <div>
        <Link href={COLLECTIVE_PAGE} className={navLink}>
          {COLLECTIVE_TITLE}
        </Link>
      </div>
      {reading.kind === "forbidden" ? (
        <p role="alert" className={text}>
          {MODERATION_FORBIDDEN}
        </p>
      ) : (
        <>
          <p className={text}>{MODERATION_LEAD}</p>
          <AccountSection id="file" title={queueTitle(reading.total, page, queuePages(reading.total))}>
            {page > 0 && reading.queue.length === 0 ? (
              <p className={text}>{QUEUE_PAGE_EMPTY}</p>
            ) : (
              <ModerationQueue queue={reading.queue} userId={session.account.userId} />
            )}
            <QueuePager page={page} pages={queuePages(reading.total)} />
          </AccountSection>
          <AccountSection id="journal" title={LOG_TITLE}>
            <ModerationLog log={reading.log} />
          </AccountSection>
        </>
      )}
    </ProfileShell>
  );
}
