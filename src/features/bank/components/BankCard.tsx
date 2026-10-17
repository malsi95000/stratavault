import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MapCover } from "@/features/maps/cover";
import type { MapDoc } from "@/features/map-doc/types";
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
};

/** Une carte de la banque (bêta, .bankcard) : logo ou aperçu, nom, date et statistiques, actions. */
export default function BankCard({ item, onContinue, onRename, onDelete, loadDoc, onCover }: Props) {
  // Les boutons portent les libellés de la bêta ; le nom de la carte les décrit pour les lecteurs d'écran.
  const titleId = useId();

  return (
    <Card className="flex-row items-center gap-4 rounded-[8px] border border-line bg-panel px-4 py-3.5 text-[15px] text-ink shadow-none ring-0 max-sm:items-start">
      <CoverImage cover={item.cover} className="w-[96px] max-sm:w-[72px]" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[6px_16px]">
        <h2 id={titleId} className="brut m-0 basis-full text-[17px] break-words">
          {item.name}
          {item.active && " — en cours"}
        </h2>
        <p className="m-0 flex-auto text-[12.5px] text-mute">{item.meta}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="panel" size="panel" aria-describedby={titleId} onClick={onContinue}>
            Continuer
          </Button>
          <Button variant="panel" size="panel" aria-describedby={titleId} onClick={onRename}>
            Renommer
          </Button>
          <CoverDialog name={item.name} cover={item.cover} describedBy={titleId} loadDoc={loadDoc} onSave={onCover} />
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
