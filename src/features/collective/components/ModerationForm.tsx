"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { dialogs } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { FIELD, LABEL } from "@/features/editor/components/fiches/styles";
import { cn } from "@/lib/utils";
import { moderateCollectiveItem } from "../actions";
import { INITIAL_COLLECTIVE_STATE, collectiveError, type CollectiveActionState } from "../actionState";
import {
  GROUND_LABELS,
  MAX_DECISION_FACTS,
  MAX_LEGAL_BASIS,
  MIN_LEGAL_BASIS,
  groundsFor,
  legalBasisText,
  needsLegalBasis,
  type DecisionGround,
} from "../decisionGrounds";
import {
  ACTION_LABELS,
  DECISION_DELETE_CONFIRM,
  DECISION_GROUND_LABEL,
  DECISION_GROUND_PLACEHOLDER,
  DECISION_GROUND_REQUIRED,
  DECISION_LABEL,
  DECISION_LEGAL_BASIS_LABEL,
  DECISION_LEGAL_BASIS_PLACEHOLDER,
  DECISION_LEGAL_BASIS_REQUIRED,
  DECISION_PENDING,
  DECISION_REASON_LABEL,
  DECISION_REASON_PLACEHOLDER,
  DECISION_SUBMIT,
  SUSPEND_HINT,
  SUSPEND_LABEL,
} from "../messages";
import { availableActions } from "../moderation";
import { SUSPENDING_ACTIONS, type ModerationAction, type QueueStatus } from "../types";

type Props = { userId: string; itemId: string; status: QueueStatus; openReports: number };

/**
 * Décision sur un élément de la file : action proposée selon son état, règle en cause (aucune
 * présélectionnée pour masquer ou supprimer ; « aucun manquement » pour rétablir ou classer), texte de
 * loi en cause pour un contenu illicite (DSA art. 17, paragraphe 3, d) et faits retenus obligatoires ; avec un masquage ou une suppression, suspension facultative des contributions
 * de l'auteur. Succès : un toast, et la page relit la file et le journal (refresh côté serveur) ;
 * échec : le message ici.
 */
export default function ModerationForm({ userId, itemId, status, openReports }: Props) {
  const actions = availableActions(status, openReports);
  const [action, setAction] = useState<ModerationAction>(actions[0]);
  const [ground, setGround] = useState<DecisionGround | "">("");
  const [legalBasis, setLegalBasis] = useState("");
  const [reason, setReason] = useState("");
  const [suspend, setSuspend] = useState(false);
  const [state, setState] = useState<CollectiveActionState>(INITIAL_COLLECTIVE_STATE);
  const [pending, startTransition] = useTransition();
  const chosen = actions.includes(action) ? action : actions[0];
  const grounds = groundsFor(chosen);
  const chosenGround = grounds.length === 1 ? grounds[0] : ground !== "" && grounds.includes(ground) ? ground : "";
  const canSuspend = SUSPENDING_ACTIONS.includes(chosen);
  const withLegalBasis = needsLegalBasis(chosenGround);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (chosenGround === "") {
      setState(collectiveError(DECISION_GROUND_REQUIRED));
      return;
    }
    if (withLegalBasis && [...legalBasisText(legalBasis.trim())].length < MIN_LEGAL_BASIS) {
      setState(collectiveError(DECISION_LEGAL_BASIS_REQUIRED));
      return;
    }
    if (chosen === "delete" && !(await dialogs.confirm(DECISION_DELETE_CONFIRM, { confirmLabel: "Supprimer", destructive: true }))) return;
    const data = new FormData();
    data.append("account", userId);
    data.append("item", itemId);
    data.append("action", chosen);
    data.append("ground", chosenGround);
    data.append("legalBasis", withLegalBasis ? legalBasis : "");
    data.append("reason", reason);
    data.append("suspend", canSuspend && suspend ? "on" : "");
    startTransition(async () => {
      const result = await moderateCollectiveItem(INITIAL_COLLECTIVE_STATE, data);
      if (result.status === "success") {
        toast.success(result.message);
        setGround("");
        setLegalBasis("");
        setReason("");
        setSuspend(false);
        setState(INITIAL_COLLECTIVE_STATE);
      } else {
        setState(result);
      }
    });
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-1">
      <label className={cn(LABEL, "mt-0")}>
        {DECISION_LABEL}
        <select className={FIELD} value={chosen} onChange={(e) => setAction(e.target.value as ModerationAction)}>
          {actions.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        {DECISION_GROUND_LABEL}
        <select
          className={FIELD}
          value={chosenGround}
          required
          onChange={(e) => {
            setGround(grounds.find((g) => g === e.target.value) ?? "");
            if (state.status === "error") setState(INITIAL_COLLECTIVE_STATE);
          }}
        >
          {grounds.length > 1 && (
            <option value="" disabled>
              {DECISION_GROUND_PLACEHOLDER}
            </option>
          )}
          {grounds.map((g) => (
            <option key={g} value={g}>
              {GROUND_LABELS[g]}
            </option>
          ))}
        </select>
      </label>
      {withLegalBasis && (
        <label className={LABEL}>
          {DECISION_LEGAL_BASIS_LABEL}
          <input
            type="text"
            className={FIELD}
            required
            minLength={MIN_LEGAL_BASIS}
            maxLength={MAX_LEGAL_BASIS}
            placeholder={DECISION_LEGAL_BASIS_PLACEHOLDER}
            value={legalBasis}
            onChange={(e) => setLegalBasis(e.target.value)}
          />
        </label>
      )}
      <label className={LABEL}>
        {DECISION_REASON_LABEL}
        <textarea
          className={cn(FIELD, "min-h-[72px] resize-y")}
          required
          minLength={3}
          maxLength={MAX_DECISION_FACTS}
          placeholder={DECISION_REASON_PLACEHOLDER}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {canSuspend && (
        <label className="mt-2 flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5" checked={suspend} onChange={(e) => setSuspend(e.target.checked)} />
          <span>
            {SUSPEND_LABEL}
            <span className="block text-mute">{SUSPEND_HINT}</span>
          </span>
        </label>
      )}
      <div aria-live="polite" className="empty:hidden">
        {state.message && <p className="m-0 mt-1 text-[13px] text-danger">{state.message}</p>}
      </div>
      <div className="mt-2">
        <Button type="submit" variant="panel" size="panel" disabled={pending}>
          {pending ? DECISION_PENDING : DECISION_SUBMIT}
        </Button>
      </div>
    </form>
  );
}
