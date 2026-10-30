"use client";

import Link from "next/link";
import EditorFrame from "@/features/editor/components/EditorFrame";
import { navLink } from "@/components/auth/styles";
import { COOP_LOADING } from "../messages";
import CoopTopBar from "./CoopTopBar";
import { useCoopSession } from "./useCoopSession";

/**
 * Éditeur coopératif d'une carte partagée (propriétaire, éditeurs, lecteurs) : l'éditeur habituel,
 * avec sa propre barre du haut et sa session (verrou d'édition, enregistrement, rafraîchissement).
 * Carte introuvable ou plus accessible, ou lecture impossible : un message et un lien vers l'espace.
 */
export default function CoopEditor({ userId, mapId }: { userId: string; mapId: string }) {
  const { session, view } = useCoopSession(userId, mapId);

  if (view.phase === "gone" || view.phase === "failed") {
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

  return (
    <>
      <EditorFrame topBar={<CoopTopBar session={session} view={view} />} />
      {view.phase === "loading" && (
        <p role="status" className="sr-only">
          {COOP_LOADING}
        </p>
      )}
    </>
  );
}
