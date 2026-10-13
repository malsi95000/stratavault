"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { dialogs } from "@/components/dialogs";
import { getPersistence } from "@/features/editor/storageSession";
import { useEditorStore } from "@/features/editor/store";
import { RemoteBankError } from "@/features/storage";
import type { StoredMapEntry } from "@/features/storage";
import * as actions from "./bankActions";
import type { BankDeps } from "./bankActions";
import { toBankItems } from "./bankItems";
import type { BankItem } from "./bankItems";

/** Échec de lecture de la liste ; « signed-out » : session expirée (banque du compte). */
export type BankFailure = "unavailable" | "signed-out";

export type BankState =
  | { status: "loading" }
  | { status: "failed"; reason: BankFailure }
  | { status: "ready"; items: BankItem[] };

const failureOf = (error: unknown): BankFailure =>
  error instanceof RemoteBankError && error.reason === "unauthorized" ? "signed-out" : "unavailable";

const deps = (): BankDeps => ({
  persistence: getPersistence(),
  dialogs,
  notify: (message) => toast.error(message),
});

/**
 * Banque de la page « Mon espace stratégique » : liste des cartes (la carte active est celle de
 * l'éditeur) et actions. « Nouvelle carte » et « Continuer » mènent à l'éditeur.
 */
export function useBank() {
  const router = useRouter();
  const hydrated = useEditorStore((s) => s.hydrated);
  const activeMapId = useEditorStore((s) => s.activeMapId);
  const [entries, setEntries] = useState<StoredMapEntry[] | null>(null);
  const [failed, setFailed] = useState<BankFailure | null>(null);
  // Une action à la fois (double clic, clic pendant un dialogue).
  const busy = useRef(false);

  const reload = useCallback(
    () =>
      getPersistence()
        .listMaps()
        .then(
          (list) => {
            setEntries(list);
            setFailed(null);
          },
          (error: unknown) => setFailed(failureOf(error)),
        ),
    [],
  );

  // La carte en cours (brouillon et carte active) est chargée comme dans l'éditeur.
  useEffect(() => {
    // Page de nouveau affichée : une navigation lancée depuis cette page n'est plus en cours.
    busy.current = false;
    void getPersistence().hydrate();
    void reload();
  }, [reload]);

  const state = useMemo<BankState>(() => {
    if (failed) return { status: "failed", reason: failed };
    if (!hydrated || entries === null) return { status: "loading" };
    return { status: "ready", items: toBankItems(entries, activeMapId) };
  }, [failed, hydrated, entries, activeMapId]);

  /** Lance une action si aucune autre n'est en cours, puis relit la liste. */
  const exclusive = useCallback(
    async <T>(fallback: T, action: (d: BankDeps) => Promise<T>): Promise<T> => {
      if (busy.current) return fallback;
      busy.current = true;
      try {
        const result = await action(deps());
        await reload();
        return result;
      } finally {
        busy.current = false;
      }
    },
    [reload],
  );

  /**
   * Action qui mène à l'éditeur si elle réussit. Le verrou reste pris pendant la navigation : un autre
   * clic avant l'affichage de l'éditeur remplacerait la carte qui vient d'être ouverte.
   */
  const openEditor = useCallback(
    async (action: (d: BankDeps) => Promise<boolean>) => {
      if (busy.current) return;
      busy.current = true;
      let navigating = false;
      try {
        navigating = await action(deps());
        if (navigating) router.push("/carte");
        else await reload();
      } finally {
        if (!navigating) busy.current = false;
      }
    },
    [reload, router],
  );

  return {
    state,
    newMap: () => openEditor(actions.startNewMap),
    continueMap: (item: BankItem) => openEditor((d) => actions.continueMap(d, item.id)),
    renameMap: (item: BankItem) => exclusive(undefined, (d) => actions.renameMap(d, item)),
    /** true si la carte a été supprimée (la liste est déjà relue). */
    deleteMap: (item: BankItem) => exclusive(false, (d) => actions.deleteMap(d, item.id)),
  };
}
