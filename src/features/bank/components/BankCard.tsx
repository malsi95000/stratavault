import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BankItem } from "../bankItems";

type Props = {
  item: BankItem;
  onContinue: () => void;
  onRename: () => void;
  onDelete: () => void;
};

/** Une carte de la banque (bêta, .bankcard) : nom, date et statistiques, actions. */
export default function BankCard({ item, onContinue, onRename, onDelete }: Props) {
  // Les boutons portent les libellés de la bêta ; le nom de la carte les décrit pour les lecteurs d'écran.
  const titleId = useId();

  return (
    <Card className="flex-row flex-wrap items-center gap-[6px_16px] rounded-[8px] border border-line bg-panel px-4 py-3.5 text-[15px] text-ink shadow-none ring-0">
      <h2 id={titleId} className="brut m-0 basis-full text-[17px]">
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
    </Card>
  );
}
