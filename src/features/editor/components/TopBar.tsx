"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { dialogs } from "@/components/dialogs";
import Logo from "@/components/Logo";
import SignOutButton from "@/components/auth/SignOutButton";
import { Button } from "@/components/ui/button";
import { idleStatus } from "@/features/editor/saveProfiles";
import { MAP_CONFLICT, MAP_GONE } from "@/features/editor/saveStatus";
import { flush, getPersistence } from "@/features/editor/storageSession";
import { storageModeOf } from "@/features/storage";
import type { Account } from "@/features/storage";
import { useEditorStore } from "@/features/editor/store";
import { PANEL_WIDTH, hasFiche } from "./Panel";
import BankSaveButton from "./topbar/BankSaveButton";
import CategoriesButton from "./topbar/CategoriesButton";
import FiltersButton from "./filters/FiltersButton";
import ExportButton from "./topbar/ExportButton";
import ImportButton from "./topbar/ImportButton";
import { edgeMaskClass } from "./topbar/barScroll";
import { useBarScroll } from "./topbar/useBarScroll";

const LEAVE_UNSAVED = "Des modifications n’ont pas pu être enregistrées. Quitter l’éditeur quand même ?";
export const LEAVE_STILL_SENDING =
  "Enregistrement toujours en cours : il se poursuit en arrière-plan. Gardez cet onglet ouvert quelques instants.";
/** Mode compte : au-delà, « Accueil » n'attend plus la fin d'un envoi lent (la navigation garde la page chargée). */
const LEAVE_WAIT_MS = 5000;

/**
 * Barre du haut : marque, Accueil, Exporter, Importer, banque, catégories de la carte, filtres, et statut d'enregistrement à droite
 * (la barre s'arrête au bord du panneau ouvert). En mode compte : e-mail et « Se déconnecter ».
 */
export default function TopBar({ account }: { account: Account | null }) {
  const router = useRouter();
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const panelOpen = useEditorStore((s) => hasFiche(s.selection));
  const hasActiveMap = useEditorStore((s) => s.activeMapId !== null);
  const status = saveStatus || idleStatus(storageModeOf(account), hasActiveMap);
  const { ref: barRef, edges: barEdges } = useBarScroll<HTMLDivElement>();

  // Carte détachée de la banque : message important, doublé d'une notification (le statut est
  // tronqué s'il est long).
  useEffect(() => {
    if (saveStatus === MAP_CONFLICT || saveStatus === MAP_GONE) toast.warning(saveStatus);
  }, [saveStatus]);

  async function goHome() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<"slow">((resolve) => (timer = setTimeout(() => resolve("slow"), LEAVE_WAIT_MS)));
    // Seul l'envoi vers le compte peut être lent ; en démo, l'écriture locale est toujours attendue.
    const saved = await (account ? Promise.race([flush(), slow]) : flush());
    clearTimeout(timer);
    if (saved === "slow") {
      // Envoi lent (grosse carte, réseau faible) : la navigation reste dans la page, l'écriture
      // continue, et des modifications non envoyées repartiront au prochain chargement.
      toast.warning(LEAVE_STILL_SENDING);
    } else if (!saved) {
      // Mode compte : seul l'envoi a échoué, les modifications sont gardées dans ce navigateur et
      // repartiront plus tard. Rien n'est perdu en quittant l'éditeur : le statut est rappelé.
      if (getPersistence().keptLocally()) toast.warning(useEditorStore.getState().saveStatus);
      else if (!(await dialogs.confirm(LEAVE_UNSAVED, { confirmLabel: "Quitter" }))) return;
    }
    router.push("/");
  }

  return (
    <>
      {/* Écran étroit : la barre défile horizontalement (au doigt, à la molette, ou au focus clavier) au
          lieu de déborder, et un dégradé signale les boutons cachés (useBarScroll). Fiche ouverte : la
          barre s'arrête au bord du panneau, aucun bouton n'est caché dessous. */}
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
        <Button variant="panel" size="panel" onClick={goHome}>
          Accueil
        </Button>
        {/* Catégories et Filtres avant les boutons de fichier : visibles même quand une fiche
            ouverte réduit la barre (icône seule sous xl). */}
        <CategoriesButton />
        <FiltersButton />
        <ExportButton />
        <ImportButton />
        <BankSaveButton />
        {account && (
          <span className="ml-2 flex min-w-0 items-center gap-2 text-[13px] text-mute">
            {account.email && <span className="max-w-[22ch] truncate text-ink">{account.email}</span>}
            <SignOutButton userId={account.userId} />
          </span>
        )}
        {/* Écran large : statut à droite de la barre (au bord du panneau ouvert). */}
        <span role="status" title={status} className="mr-1 ml-auto hidden min-w-[14rem] truncate text-right text-[13px] text-mute lg:block">
          {status}
        </span>
      </div>
      {/* Écran étroit : le statut (un conflit, par exemple) reste visible sous la barre, sans la faire défiler. */}
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
