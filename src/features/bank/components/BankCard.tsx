import Link from "next/link";
import { useId } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MapCover } from "@/features/maps/cover";
import type { MapDoc } from "@/features/map-doc/types";
import { INVITE_ANCHOR, shareSettingsPath, sharedMapPath } from "@/features/sharing/paths";
import type { BankItem } from "../bankItems";
import CoverDialog from "./cover/CoverDialog";
import CoverImage from "./cover/CoverImage";

type Props = {
  item: BankItem;
  onContinue: () => void;
  onRename: () => void;
  onDelete: () => void;
  /** Contenu de la carte, pour calculer son aperçu. */
  loadDoc: () => Promise<MapDoc | null>;
  /** Enregistre son logo (null : le retirer) ; true si c'est fait. */
  onCover: (cover: MapCover | null) => Promise<boolean>;
  /** Mode compte : boutons « Partager », « Inviter » et « Coopérer » (CMY-02). */
  sharing?: boolean;
  /**
   * Carte qui a des membres : « Continuer » ouvre l'éditeur coopératif (verrou d'édition, lecture seule
   * pendant qu'un membre la modifie) au lieu de l'éditeur habituel.
   */
  shared?: boolean;
};

/** Une carte de la banque (bêta, .bankcard) : logo ou aperçu, nom, date et statistiques, actions. */
export default function BankCard({ item, onContinue, onRename, onDelete, loadDoc, onCover, sharing = false, shared = false }: Props) {
  // Les boutons portent les libellés de la bêta ; le nom de la carte les décrit pour les lecteurs d'écran.
  const titleId = useId();

  return (
    <Card className="flex-row items-center gap-4 rounded-[8px] border border-line bg-panel px-4 py-3.5 text-[15px] text-ink shadow-none ring-0 max-sm:items-start">
      <CoverImage cover={item.cover} className="w-[96px] max-sm:w-[72px]" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[6px_16px]">
        <h2 id={titleId} className="brut m-0 basis-full text-[17px] break-words">
          {item.name}
          {item.active && " — en cours"}
          {shared && " — partagée"}
        </h2>
        <p className="m-0 flex-auto text-[12.5px] text-mute">{item.meta}</p>
        <div className="flex flex-wrap gap-2">
          {shared ? (
            <Link href={sharedMapPath(item.id)} className={buttonVariants({ variant: "panel", size: "panel" })} aria-describedby={titleId}>
              Continuer
            </Link>
          ) : (
            <Button variant="panel" size="panel" aria-describedby={titleId} onClick={onContinue}>
              Continuer
            </Button>
          )}
          <Button variant="panel" size="panel" aria-describedby={titleId} onClick={onRename}>
            Renommer
          </Button>
          <CoverDialog name={item.name} cover={item.cover} describedBy={titleId} loadDoc={loadDoc} onSave={onCover} />
          {sharing && (
            <>
              <Link href={shareSettingsPath(item.id)} className={buttonVariants({ variant: "panel", size: "panel" })} aria-describedby={titleId}>
                Partager
              </Link>
              <Link
                href={`${shareSettingsPath(item.id)}#${INVITE_ANCHOR}`}
                className={buttonVariants({ variant: "panel", size: "panel" })}
                aria-describedby={titleId}
              >
                Inviter
              </Link>
              <Link href={sharedMapPath(item.id)} className={buttonVariants({ variant: "panel", size: "panel" })} aria-describedby={titleId}>
                Coopérer
              </Link>
            </>
          )}
          <Button
            variant="panel"
            size="panel"
            className="border-danger-line text-danger hover:border-danger"
            aria-describedby={titleId}
            onClick={onDelete}
          >
            Supprimer
          </Button>
        </div>
      </div>
    </Card>
  );
}
