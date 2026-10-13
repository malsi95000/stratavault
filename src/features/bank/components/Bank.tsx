"use client";

import { useEffect, useRef, useState } from "react";
import { whenDialogsClosed } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { useBank } from "../useBank";
import type { BankItem } from "../bankItems";
import BankCard from "./BankCard";

const EMPTY =
  "Aucune carte enregistrée pour l’instant. Créez-en une, ou utilisez le bouton « Enregistrer dans la banque » depuis l’éditeur.";
const LOADING = "Chargement de vos cartes…";
const FAILED = "Impossible de lire les cartes enregistrées dans ce navigateur. Rechargez la page.";
const REMOTE_FAILED = "Impossible de charger vos cartes : vérifiez votre connexion, puis rechargez la page.";
const SIGNED_OUT = "Session expirée : reconnectez-vous pour retrouver vos cartes.";

const message = "mt-2.5 text-mute";

/**
 * Après une suppression, le bouton qui avait le focus a disparu : le focus va à la carte qui a pris
 * sa place (ou à la précédente), sinon à « + Nouvelle carte ». Rien ne bouge si le focus est ailleurs.
 */
function refocusAfterRemoval(list: HTMLUListElement | null, index: number, fallback: HTMLElement | null) {
  const active = document.activeElement;
  if (active && active !== document.body) return;
  const cards = list ? Array.from(list.children) : [];
  const card = cards[index] ?? cards[index - 1];
  (card?.querySelector<HTMLElement>("button") ?? fallback)?.focus();
}

/**
 * « + Nouvelle carte » et liste des cartes de la banque (bêta, #bankNew et #bankList).
 * `remote` : banque du compte (Supabase), sinon banque de ce navigateur (démo).
 */
export default function Bank({ remote }: { remote: boolean }) {
  const { state, newMap, continueMap, renameMap, deleteMap } = useBank();
  const listRef = useRef<HTMLUListElement>(null);
  const newMapRef = useRef<HTMLButtonElement>(null);
  // Position de la carte supprimée ; un nouvel objet à chaque suppression.
  const [removed, setRemoved] = useState<{ index: number } | null>(null);

  // Exécuté après l'affichage de la liste relue.
  useEffect(() => {
    if (removed) refocusAfterRemoval(listRef.current, removed.index, newMapRef.current);
  }, [removed]);

  const remove = async (item: BankItem, index: number) => {
    if (!(await deleteMap(item))) return;
    // Le dialogue rend d'abord le focus au bouton « Supprimer » (disparu) : attendre sa fermeture.
    await whenDialogsClosed();
    setRemoved({ index });
  };

  return (
    <>
      <Button ref={newMapRef} variant="panel" size="panel" className="mb-[26px]" onClick={newMap}>
        + Nouvelle carte
      </Button>

      {state.status === "loading" && (
        <p role="status" className={message}>
          {LOADING}
        </p>
      )}
      {state.status === "failed" && (
        <p role="alert" className={message}>
          {state.reason === "signed-out" ? SIGNED_OUT : remote ? REMOTE_FAILED : FAILED}
        </p>
      )}
      {state.status === "ready" && state.items.length === 0 && <p className={message}>{EMPTY}</p>}
      {state.status === "ready" && state.items.length > 0 && (
        <ul ref={listRef} className="m-0 grid list-none gap-3.5 p-0">
          {state.items.map((item, index) => (
            <li key={item.id}>
              <BankCard
                item={item}
                onContinue={() => continueMap(item)}
                onRename={() => renameMap(item)}
                onDelete={() => remove(item, index)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
