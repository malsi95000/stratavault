"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { DEMO_MODE, storageKey, storageModeOf } from "@/features/storage";
import type { Account } from "@/features/storage";
import { activateStorage, activeStorageMode, subscribeStorage } from "../storageSession";

const serverMode = () => null;

/**
 * Active le dépôt de la session (démo ou compte, d'après le Server Component) avant d'afficher
 * ses enfants : leurs effets (chargement de la carte, liste de la banque) trouvent toujours le bon
 * dépôt. `fallback` s'affiche pendant l'activation et après la déconnexion.
 */
export default function StorageScope({
  account,
  fallback = null,
  children,
}: {
  account: Account | null;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const userId = account?.userId ?? null;
  const key = storageKey(storageModeOf(account));
  const active = useSyncExternalStore(subscribeStorage, activeStorageMode, serverMode);

  useEffect(() => {
    activateStorage(userId ? { kind: "account", userId } : DEMO_MODE);
  }, [userId]);

  return active && storageKey(active) === key ? children : fallback;
}
