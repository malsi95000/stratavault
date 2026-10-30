"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import ReportContentLink from "@/components/legal/ReportContentLink";
import { Button } from "@/components/ui/button";
import { PANEL_WIDTH, hasFiche } from "@/features/editor/components/Panel";
import CategoriesButton from "@/features/editor/components/topbar/CategoriesButton";
import ExportButton from "@/features/editor/components/topbar/ExportButton";
import FiltersButton from "@/features/editor/components/filters/FiltersButton";
import { edgeMaskClass } from "@/features/editor/components/topbar/barScroll";
import { useBarScroll } from "@/features/editor/components/topbar/useBarScroll";
import { useEditorStore } from "@/features/editor/store";
import { COOP_RELEASE, COOP_TAKE, ROLE_LABELS } from "../messages";
import type { CoopSession, CoopView } from "./coopSession";

/** Lien « Mon espace » (la sortie enregistre ce qui reste et libère le verrou). */
const SPACE_PAGE = "/espace";

/**
 * Barre du haut de l'éditeur coopératif : marque, retour à l'espace, nom de la carte et rôle,
 * catégories (éditeur seulement), filtres, export, bouton pour prendre ou rendre la main, lien de
 * signalement (carte d'un autre membre), et état (« Vous modifiez cette carte », « X modifie cette
 * carte », enregistrement).
 */
export default function CoopTopBar({ session, view }: { session: CoopSession | null; view: CoopView }) {
  const panelOpen = useEditorStore((s) => hasFiche(s.selection));
  const { ref: barRef, edges: barEdges } = useBarScroll<HTMLDivElement>();
  const canTake = view.phase === "ready" && !view.editing && view.role !== null && view.role !== "reader" && view.lock.kind !== "other";
  const status = [view.message, view.saveStatus, view.notice].filter(Boolean).join(" ");

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
        <Link
          href={SPACE_PAGE}
          className="inline-flex h-8 shrink-0 items-center rounded border border-line bg-panel px-3 text-[13px] text-ink hover:border-mute"
        >
          Mon espace
        </Link>
        {view.name && (
          <span className="flex min-w-0 shrink-0 items-center gap-2 text-[13px]">
            <span className="brut max-w-[24ch] truncate text-[15px]">{view.name}</span>
            {view.role && <span className="rounded border border-line px-1.5 py-0.5 text-mute">{ROLE_LABELS[view.role]}</span>}
            {view.role !== "owner" && view.owner && <span className="max-w-[24ch] truncate text-mute">de {view.owner}</span>}
          </span>
        )}
        {view.name && view.role && view.role !== "owner" && (
          <ReportContentLink className="shrink-0" target={{ kind: "shared-map", mapName: view.name, owner: view.owner }} />
        )}
        <CategoriesButton />
        <FiltersButton />
        <ExportButton />
        {canTake && session && (
          <Button variant="panel" size="panel" onClick={() => void session.take()}>
            {COOP_TAKE}
          </Button>
        )}
        {view.editing && session && (
          <Button variant="panel" size="panel" onClick={() => void session.giveBack()}>
            {COOP_RELEASE}
          </Button>
        )}
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
