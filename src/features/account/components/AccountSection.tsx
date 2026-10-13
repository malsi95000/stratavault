import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  /** Identifiant du titre (ancre de la rubrique). */
  id: string;
  title: string;
  /** Zone des actions irréversibles : bordure et titre rouges. */
  danger?: boolean;
  children: ReactNode;
};

/** Une rubrique de la page « Mon compte » (style des cartes de la banque). */
export default function AccountSection({ id, title, danger = false, children }: Props) {
  return (
    <section aria-labelledby={id}>
      <Card
        className={cn(
          "gap-3 rounded-[8px] border bg-panel px-5 py-4 text-[15px] text-ink shadow-none ring-0",
          danger ? "border-danger-line" : "border-line",
        )}
      >
        <h2 id={id} className={cn("brut m-0 text-[19px]", danger && "text-danger")}>
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}
