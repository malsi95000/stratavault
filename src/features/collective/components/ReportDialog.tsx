"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FIELD, LABEL } from "@/features/editor/components/fiches/styles";
import { cn } from "@/lib/utils";
import { reportCollectiveItem } from "../actions";
import { INITIAL_COLLECTIVE_STATE, collectiveError, type CollectiveActionState } from "../actionState";
import { MAX_REASON_TEXT } from "../limits";
import CollectiveLegalLinks from "./CollectiveLegalLinks";
import {
  REPORT_DETAILS_LABEL,
  REPORT_DETAILS_REQUIRED,
  REPORT_GOOD_FAITH_LABEL,
  REPORT_GOOD_FAITH_REQUIRED,
  REPORT_ILLEGAL_DETAILS_LABEL,
  REPORT_ILLEGAL_HINT,
  REPORT_LEAD,
  REPORT_PENDING,
  REPORT_REASON_LABEL,
  REPORT_REASON_LABELS,
  REPORT_REASON_PLACEHOLDER,
  REPORT_REASON_REQUIRED,
  REPORT_SUBMIT,
  REPORT_TITLE,
} from "../messages";
import {
  reasonChoice,
  reportFormData,
  reportFormProblem,
  requiresNoticeElements,
  type ReportFormProblem,
  type ReportReasonChoice,
} from "../reportForm";
import { REPORT_REASONS } from "../types";

type Props = { userId: string; itemId: string; open: boolean; onOpenChange: (open: boolean) => void };

const PROBLEM_TEXT: Record<ReportFormProblem, string> = {
  reason: REPORT_REASON_REQUIRED,
  details: REPORT_DETAILS_REQUIRED,
  "good-faith": REPORT_GOOD_FAITH_REQUIRED,
};

/**
 * Signalement d'un élément d'un autre membre : motif (liste fermée, aucun présélectionné : le membre
 * le choisit) et précisions, facultatives sauf pour un contenu illicite, qui exige aussi la
 * déclaration de bonne foi (notification au sens de l'article 16 du DSA : reportForm.ts).
 */
export default function ReportDialog({ userId, itemId, open, onOpenChange }: Props) {
  const [reason, setReason] = useState<ReportReasonChoice>("");
  const [details, setDetails] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);
  const [state, setState] = useState<CollectiveActionState>(INITIAL_COLLECTIVE_STATE);
  const [pending, startTransition] = useTransition();
  const sent = state.status === "success";
  const notice = requiresNoticeElements(reason);
  const clearError = () => {
    if (state.status === "error") setState(INITIAL_COLLECTIVE_STATE);
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || sent) return;
    const problem = reportFormProblem(reason, details, goodFaith);
    const data = reportFormData(userId, itemId, reason, details, goodFaith);
    if (problem !== null || !data) {
      setState(collectiveError(PROBLEM_TEXT[problem ?? "reason"]));
      return;
    }
    startTransition(async () => setState(await reportCollectiveItem(INITIAL_COLLECTIVE_STATE, data)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="brut pr-8 text-xl">{REPORT_TITLE}</DialogTitle>
          <DialogDescription>{REPORT_LEAD}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-1">
          <label className={cn(LABEL, "mt-0")}>
            {REPORT_REASON_LABEL}
            <select
              className={FIELD}
              value={reason}
              required
              disabled={sent}
              onChange={(e) => {
                setReason(reasonChoice(e.target.value));
                clearError();
              }}
            >
              <option value="" disabled>
                {REPORT_REASON_PLACEHOLDER}
              </option>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REPORT_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            {notice ? REPORT_ILLEGAL_DETAILS_LABEL : REPORT_DETAILS_LABEL}
            <textarea
              className={cn(FIELD, "min-h-[96px] resize-y")}
              maxLength={MAX_REASON_TEXT}
              required={notice}
              value={details}
              disabled={sent}
              onChange={(e) => {
                setDetails(e.target.value);
                clearError();
              }}
            />
          </label>
          {notice && (
            <>
              <p className="m-0 text-[12px] text-mute">{REPORT_ILLEGAL_HINT}</p>
              <label className="mt-2 flex items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={goodFaith}
                  disabled={sent}
                  onChange={(e) => {
                    setGoodFaith(e.target.checked);
                    clearError();
                  }}
                />
                <span>{REPORT_GOOD_FAITH_LABEL}</span>
              </label>
            </>
          )}
          <div className="mt-2">
            <CollectiveLegalLinks />
          </div>
          <div aria-live="polite" className="min-h-5 empty:hidden">
            {state.message && (
              <p className={cn("m-0 mt-2 text-[13px]", state.status === "error" ? "text-danger" : "text-ink")}>{state.message}</p>
            )}
          </div>
          <DialogFooter className="mt-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {sent ? "Fermer" : "Annuler"}
            </Button>
            {!sent && (
              <Button type="submit" disabled={pending}>
                {pending ? REPORT_PENDING : REPORT_SUBMIT}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
