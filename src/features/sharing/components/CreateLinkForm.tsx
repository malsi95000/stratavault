"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createLink } from "../actions";
import { INITIAL_SHARING_STATE, type SharingActionState } from "../actionState";
import { ROLE_LABELS } from "../messages";
import { invitationUrl } from "../paths";
import { LINK_DURATIONS, LINK_USES } from "../schemas";
import { MEMBER_ROLES, type MemberRole } from "../types";
import SharingMessage from "./SharingMessage";
import { FIELD_LABEL, SELECT } from "./styles";

const DURATION_LABELS: Record<(typeof LINK_DURATIONS)[number], string> = { 24: "1 jour", 168: "7 jours", 720: "30 jours" };

const COPIED = "Lien copié.";
const COPY_FAILED = "Copie impossible : sélectionnez le lien et copiez-le vous-même.";

/**
 * « Créer un lien d'invitation » : rôle, nombre d'usages et durée. Le lien n'est affiché qu'une fois,
 * juste après sa création (la base n'en garde que l'empreinte) ; son jeton est dans le fragment de
 * l'adresse (« #… »), que le navigateur n'envoie jamais au serveur.
 */
export default function CreateLinkForm({ userId, mapId }: { userId: string; mapId: string }) {
  const linkId = useId();
  const [role, setRole] = useState<MemberRole>("reader");
  const [maxUses, setMaxUses] = useState<string>("5");
  const [hours, setHours] = useState<string>("168");
  const [state, setState] = useState<SharingActionState>(INITIAL_SHARING_STATE);
  const [pending, startTransition] = useTransition();
  const url = state.link ? invitationUrl(window.location.origin, state.link) : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData();
    data.append("account", userId);
    data.append("map", mapId);
    data.append("role", role);
    data.append("maxUses", maxUses);
    data.append("hours", hours);
    startTransition(async () => setState(await createLink(INITIAL_SHARING_STATE, data)));
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(COPIED);
    } catch {
      toast.warning(COPY_FAILED);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className={FIELD_LABEL}>
          Rôle
          <select
            className={SELECT}
            value={role}
            onChange={(event) => setRole(MEMBER_ROLES.find((r) => r === event.target.value) ?? "reader")}
          >
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD_LABEL}>
          Usages
          <select className={SELECT} value={maxUses} onChange={(event) => setMaxUses(event.target.value)}>
            {LINK_USES.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1 personne" : `${n} personnes`}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD_LABEL}>
          Validité
          <select className={SELECT} value={hours} onChange={(event) => setHours(event.target.value)}>
            {LINK_DURATIONS.map((h) => (
              <option key={h} value={h}>
                {DURATION_LABELS[h]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="panel" size="panel" disabled={pending}>
          {pending ? "Création…" : "Créer un lien"}
        </Button>
      </div>
      <SharingMessage state={state} />
      {url && (
        <div className="grid gap-1.5">
          <label htmlFor={linkId} className="text-xs tracking-[.08em] text-mute uppercase">
            Lien d’invitation (affiché une seule fois)
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={linkId}
              readOnly
              value={url}
              className="min-w-0 flex-1 rounded border border-line bg-field px-2 py-1.5 font-mono text-[12px] text-ink"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button type="button" variant="panel" size="panel" onClick={() => void copy(url)}>
              Copier
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
