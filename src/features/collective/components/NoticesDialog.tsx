"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { dialogs } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { frenchDate } from "@/features/editor/components/fiches/format";
import { deleteOwnCollectiveItem } from "../actions";
import { INITIAL_COLLECTIVE_STATE } from "../actionState";
import {
  COLLECTIVE_UNAVAILABLE,
  DELETE_HIDDEN,
  DELETE_HIDDEN_CONFIRM,
  HIDDEN_ITEMS_LEAD,
  HIDDEN_ITEMS_TITLE,
  NOTICES_BUTTON,
  NOTICES_EMPTY,
  NOTICE_CONTEST,
  NOTICE_CONTEST_EMAIL,
  NOTICE_COURTS,
  NOTICE_REASON,
  NOTICE_RULES_LINK,
  NOTICE_STILL_HIDDEN,
  hiddenItemLabel,
  noticeOrigin,
  noticeText,
  suspensionText,
} from "../messages";
import { COLLECTIVE_RULES_PAGE } from "../paths";
import { listCollectiveNotices, listHiddenCollectiveItems, markCollectiveNoticesRead } from "../syncActions";
import type { CollectiveNotice, HiddenItem } from "../types";

type Props = { userId: string; open: boolean; onOpenChange: (open: boolean) => void; onRead: () => void };

/**
 * Avis de modération du compte (information de l'auteur d'un élément masqué, rétabli ou supprimé, avec
 * le motif, l'origine de la décision, la suspension éventuelle de ses contributions, et des membres qui
 * l'avaient signalé), avec l'adresse pour contester une décision, le recours aux juridictions et le
 * lien vers les règles (exposé des motifs, DSA art. 17). Ouvrir la fenêtre les marque comme lus.
 * Les éléments du compte encore masqués sont listés à part et peuvent être supprimés définitivement
 * d'ici, même quand leur avis a été effacé (un an après la décision, ou au-delà des 100 avis récents).
 */
export default function NoticesDialog({ userId, open, onOpenChange, onRead }: Props) {
  const [notices, setNotices] = useState<CollectiveNotice[] | null>(null);
  const [hidden, setHidden] = useState<HiddenItem[]>([]);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [result, hiddenResult] = await Promise.all([listCollectiveNotices(userId), listHiddenCollectiveItems(userId)]);
      if (cancelled) return;
      if (hiddenResult.ok) setHidden(hiddenResult.value);
      if (!result.ok || !hiddenResult.ok) setMessage(COLLECTIVE_UNAVAILABLE);
      if (!result.ok) return;
      setNotices(result.value);
      if (result.value.some((n) => n.readAt === null) && (await markCollectiveNoticesRead(userId)).ok) onRead();
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId, onRead]);

  async function remove(item: HiddenItem) {
    if (pending || !(await dialogs.confirm(DELETE_HIDDEN_CONFIRM, { confirmLabel: "Supprimer", destructive: true }))) return;
    const data = new FormData();
    data.append("account", userId);
    data.append("item", item.id);
    startTransition(async () => {
      const result = await deleteOwnCollectiveItem(INITIAL_COLLECTIVE_STATE, data);
      setMessage(result.message);
      if (result.status === "success") {
        setHidden((list) => list.filter((h) => h.id !== item.id));
        setNotices((list) => list?.map((n) => (n.itemId === item.id ? { ...n, itemHidden: false } : n)) ?? null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="brut pr-8 text-xl">{NOTICES_BUTTON}</DialogTitle>
          <DialogDescription>
            {NOTICE_CONTEST}{" "}
            <a href={`mailto:${NOTICE_CONTEST_EMAIL}`} className="underline underline-offset-2">
              {NOTICE_CONTEST_EMAIL}
            </a>
            . {NOTICE_COURTS}{" "}
            <Link href={COLLECTIVE_RULES_PAGE} className="underline underline-offset-2">
              {NOTICE_RULES_LINK}
            </Link>
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-1 grid gap-3 overflow-y-auto px-1">
          <div aria-live="polite" className="empty:hidden">
            {message && <p className="m-0 text-[13px]">{message}</p>}
          </div>
          {hidden.length > 0 && (
            <section aria-labelledby="hidden-items-title" className="grid gap-2 border-b border-line pb-3">
              <h3 id="hidden-items-title" className="m-0 text-[14px] font-semibold">
                {HIDDEN_ITEMS_TITLE}
              </h3>
              <p className="m-0 text-[13px] text-mute">{HIDDEN_ITEMS_LEAD}</p>
              <ul className="m-0 grid list-none gap-2 p-0">
                {hidden.map((item) => (
                  <li key={item.id} className="grid gap-1 text-[14px]">
                    <p className="m-0">{hiddenItemLabel(item.kind, item.title)}</p>
                    <div>
                      <Button type="button" variant="panel" size="panel" disabled={pending} onClick={() => void remove(item)}>
                        {DELETE_HIDDEN}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {notices === null && !message && <p className="m-0 text-[13px] text-mute">Chargement…</p>}
          {notices?.length === 0 && <p className="m-0 text-[13px] text-mute">{NOTICES_EMPTY}</p>}
          {notices && notices.length > 0 && (
            <ul className="m-0 grid list-none gap-3 p-0">
              {notices.map((notice) => (
                <li key={notice.id} className="grid gap-1 border-b border-line pb-3 text-[14px]">
                  <p className="m-0">
                    {noticeText(notice.role, notice.action, notice.itemKind, notice.itemTitle)}
                    <span className="text-mute"> · {frenchDate(notice.createdAt.slice(0, 10))}</span>
                  </p>
                  <p className="m-0 text-[13px] text-mute">
                    {NOTICE_REASON} : {notice.reason}
                  </p>
                  {notice.reports !== null && <p className="m-0 text-[13px] text-mute">{noticeOrigin(notice.reports)}</p>}
                  {notice.suspendedUntil && <p className="m-0 text-[13px]">{suspensionText(notice.suspendedUntil)}</p>}
                  {notice.itemHidden && <p className="m-0 text-[13px]">{NOTICE_STILL_HIDDEN}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
