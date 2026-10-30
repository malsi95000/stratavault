"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatAccountDate } from "@/features/account/format";
import { acceptLink, previewLink } from "../actions";
import { INITIAL_SHARING_STATE, type SharingActionState } from "../actionState";
import { JOIN_DISCLOSURE, JOIN_MESSAGES, ROLE_LABELS, ownerLabel } from "../messages";
import { sharedMapPath, tokenFromHash } from "../paths";
import SharingMessage from "./SharingMessage";
import { HELP } from "./styles";

const INCOMPLETE = "Ce lien d’invitation est incomplet : copiez-le en entier depuis le message reçu.";

/**
 * Ouverture d'un lien d'invitation (« /invitation#<jeton> ») par un compte connecté. Le jeton est lu
 * dans le fragment de l'adresse (que le navigateur n'envoie jamais au serveur ni aux autres sites),
 * puis retiré de la barre d'adresse et de l'historique ; il ne part qu'avec les Server Actions
 * d'aperçu et d'acceptation.
 */
export default function JoinByLink({ userId }: { userId: string }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<SharingActionState>(INITIAL_SHARING_STATE);
  const [joined, setJoined] = useState<SharingActionState>(INITIAL_SHARING_STATE);
  const [pending, startTransition] = useTransition();
  // Le fragment n'est lu qu'une fois : il est effacé aussitôt. En développement, React rejoue l'effet
  // de montage (Strict Mode) ; le second passage trouverait une adresse sans jeton et afficherait
  // « incomplet » (et demanderait un second aperçu, compté dans la limite).
  const read = useRef(false);

  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const found = tokenFromHash(window.location.hash);
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    // Lecture unique au montage : l'adresse n'existe que dans le navigateur.
    setToken(found);
    if (!found) return;
    const data = new FormData();
    data.append("account", userId);
    data.append("token", found);
    startTransition(async () => setPreview(await previewLink(INITIAL_SHARING_STATE, data)));
  }, [userId]);

  function join() {
    if (!token || pending) return;
    const data = new FormData();
    data.append("account", userId);
    data.append("token", token);
    startTransition(async () => {
      const result = await acceptLink(INITIAL_SHARING_STATE, data);
      setJoined(result);
      if (result.status === "success" && result.mapId) router.push(sharedMapPath(result.mapId));
    });
  }

  if (token === undefined || (token && preview.status === "idle")) {
    return (
      <p role="status" className={HELP}>
        Lecture de l’invitation…
      </p>
    );
  }
  if (token === null) return <p className={HELP}>{INCOMPLETE}</p>;
  const details = preview.preview;
  if (!details) return <SharingMessage state={preview} />;

  return (
    <div className="grid gap-4">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
        <dt className="text-mute">Carte</dt>
        <dd className="brut m-0 break-words">{details.mapName}</dd>
        <dt className="text-mute">Propriétaire</dt>
        <dd className="m-0 break-words">{ownerLabel(details.ownerHandle, details.ownerName)}</dd>
        <dt className="text-mute">Rôle proposé</dt>
        <dd className="m-0">{ROLE_LABELS[details.role]}</dd>
        <dt className="text-mute">Valable jusqu’au</dt>
        <dd className="m-0">{formatAccountDate(details.expiresAt)}</dd>
      </dl>
      {details.myRole ? (
        <>
          <p className={HELP}>
            {details.myRole === "owner" ? JOIN_MESSAGES.owner : `${JOIN_MESSAGES["already-member"]} (${ROLE_LABELS[details.myRole]})`}
          </p>
          <div>
            <Button type="button" variant="panel" size="panel" disabled={pending} onClick={join}>
              {pending ? "Ouverture…" : "Ouvrir la carte"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={HELP}>{JOIN_DISCLOSURE}</p>
          <div>
            <Button type="button" variant="panel" size="panel" disabled={pending} onClick={join}>
              {pending ? "Entrée…" : "Rejoindre la carte"}
            </Button>
          </div>
        </>
      )}
      <SharingMessage state={joined} />
    </div>
  );
}
