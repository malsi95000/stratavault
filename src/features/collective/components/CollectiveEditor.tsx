"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { navLink } from "@/components/auth/styles";
import EditorFrame from "@/features/editor/components/EditorFrame";
import type { Selection } from "@/features/map-doc/types";
import { COLLECTIVE_LOADING } from "../messages";
import { useCollectiveSession } from "../session/useCollectiveSession";
import CollectiveTopBar from "./CollectiveTopBar";
import ContributionInfo from "./ContributionInfo";
import NoticesDialog from "./NoticesDialog";
import WarningDialog from "./WarningDialog";

/**
 * Carte collective (mode compte) : l'éditeur habituel, avec sa propre barre du haut, sa session (règles
 * d'édition, publication, rafraîchissement) et, en tête de chaque fiche, l'auteur de l'élément et le
 * bouton « Signaler ». L'avertissement (COM-02) s'ouvre à l'entrée. Lecture impossible : un message et
 * un lien vers l'espace.
 */
export default function CollectiveEditor({ userId }: { userId: string }) {
  const { session, view } = useCollectiveSession(userId);
  const [warningOpen, setWarningOpen] = useState(true);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const onNoticesRead = useCallback(() => session?.setUnreadNotices(0), [session]);

  if (view.phase === "failed") {
    return (
      <main className="mx-auto grid max-w-[60ch] gap-4 px-6 pt-16">
        <p role="alert" className="m-0">
          {view.message}
        </p>
        <div>
          <Link href="/espace" className={navLink}>
            Retour à mon espace
          </Link>
        </div>
      </main>
    );
  }

  const aside = session
    ? (selection: Selection) => <ContributionInfo session={session} userId={userId} selection={selection} version={view.version} />
    : undefined;

  return (
    <>
      <EditorFrame
        topBar={<CollectiveTopBar view={view} onWarning={() => setWarningOpen(true)} onNotices={() => setNoticesOpen(true)} />}
        ficheAside={aside}
      />
      {view.phase === "loading" && (
        <p role="status" className="sr-only">
          {COLLECTIVE_LOADING}
        </p>
      )}
      <WarningDialog open={warningOpen} onOpenChange={setWarningOpen} />
      <NoticesDialog userId={userId} open={noticesOpen} onOpenChange={setNoticesOpen} onRead={onNoticesRead} />
    </>
  );
}
