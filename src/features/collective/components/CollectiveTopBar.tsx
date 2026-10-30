"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import FiltersButton from "@/features/editor/components/filters/FiltersButton";
import { PANEL_WIDTH, hasFiche } from "@/features/editor/components/Panel";
import { edgeMaskClass } from "@/features/editor/components/topbar/barScroll";
import { useBarScroll } from "@/features/editor/components/topbar/useBarScroll";
import { useEditorStore } from "@/features/editor/store";
import { MY_PROFILE_PAGE } from "@/features/profiles/paths";
import { cn } from "@/lib/utils";
import {
  COLLECTIVE_TITLE,
  MODERATION_LINK,
  NOTICES_BUTTON,
  PROFILE_LINK,
  SPACE_LINK,
  WARNING_BUTTON,
} from "../messages";
import { MODERATION_PAGE } from "../paths";
import type { CollectiveView } from "../session/collectiveSession";

const NAV = "inline-flex h-8 shrink-0 items-center rounded border border-line bg-panel px-3 text-[13px] text-ink hover:border-mute";

type Props = { view: CollectiveView; onWarning: () => void; onNotices: () => void };

/**
 * Barre du haut de la carte collective : marque, retour à l'espace, titre, avertissement (COM-02),
 * avis de modération (nombre de non lus), modération (modérateurs), profil à créer pour contribuer,
 * filtres, et état de la publication.
 */
export default function CollectiveTopBar({ view, onWarning, onNotices }: Props) {
  const panelOpen = useEditorStore((s) => hasFiche(s.selection));
  const { ref: barRef, edges: barEdges } = useBarScroll<HTMLDivElement>();
  const status = [view.message, view.status, view.notice].filter(Boolean).join(" ");
  const notices = view.unreadNotices > 0 ? `${NOTICES_BUTTON} (${view.unreadNotices})` : NOTICES_BUTTON;

  return (
    <>
      <div
        ref={barRef}
        className={cn(
          "pointer-events-none absolute top-0 left-0 flex h-12 items-center gap-2 overflow-x-auto px-3 [scrollbar-width:none] *:pointer-events-auto",
          edgeMaskClass(barEdges),
        )}
        style={{ right: panelOpen ? PANEL_WIDTH : 0 }}
      >
        <span className="mr-2 flex items-center gap-2 text-[19px] tracking-[.03em]">
          <Logo className="size-[22px] text-acc" />
          <span className="brut">Stratavault</span>
        </span>
        <Link href="/espace" className={NAV}>
          {SPACE_LINK}
        </Link>
        <span className="brut shrink-0 text-[15px]">{COLLECTIVE_TITLE}</span>
        <Button variant="panel" size="panel" onClick={onWarning}>
          {WARNING_BUTTON}
        </Button>
        <Button variant="panel" size="panel" onClick={onNotices} className={cn(view.unreadNotices > 0 && "border-acc")}>
          {notices}
        </Button>
        {view.isModerator && (
          <Link href={MODERATION_PAGE} className={NAV}>
            {MODERATION_LINK}
          </Link>
        )}
        {view.phase === "ready" && !view.canContribute && !view.suspended && (
          <Link href={MY_PROFILE_PAGE} className={NAV}>
            {PROFILE_LINK}
          </Link>
        )}
        <FiltersButton />
        <span role="status" title={status} className="mr-1 ml-auto hidden min-w-[14rem] truncate text-right text-[13px] text-mute lg:block">
          {status}
        </span>
      </div>
      <p
        role="status"
        title={status}
        className="pointer-events-none absolute top-12 right-3 left-[76px] m-0 truncate text-right text-[12px] text-mute lg:hidden"
      >
        {status}
      </p>
    </>
  );
}
