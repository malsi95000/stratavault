"use client";

import { useId } from "react";
import type { ComponentProps } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tutorialFor } from "@/features/editor/help/tutorials";
import type { HelpTopic } from "@/features/editor/help/tutorials";
import { cn } from "@/lib/utils";
import TutorialCard from "./TutorialCard";

type Side = ComponentProps<typeof PopoverContent>["side"];
type Align = ComponentProps<typeof PopoverContent>["align"];

/** Libellé accessible du bouton d'aide d'un sujet. */
export const helpLabel = (topic: HelpTopic) => `Aide : ${tutorialFor(topic).title}`;

/**
 * Petit bouton « ? » qui affiche le tutoriel d'un outil, d'une vue, des filtres ou des catégories
 * (EDI-10), dans une fenêtre non modale (Popover) : Entrée ou Espace l'ouvre, le focus y entre,
 * Échap ou un clic ailleurs la ferme et le focus revient au bouton.
 */
export default function HelpButton({
  topic,
  className,
  side = "right",
  align = "start",
}: {
  topic: HelpTopic;
  className?: string;
  side?: Side;
  align?: Align;
}) {
  const titleId = useId();
  const label = helpLabel(topic);
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          // Zone de clic de 24 px, pastille visible de 18 px : discrète, pleine au survol et au focus.
          "group/help grid size-6 cursor-pointer place-items-center rounded-full outline-none",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-[18px] place-items-center rounded-full border border-line bg-panel text-[11px] leading-none font-semibold text-mute opacity-80 transition-[opacity,color,border-color] duration-150 group-hover/help:border-mute group-hover/help:text-ink group-hover/help:opacity-100 group-focus-visible/help:border-acc group-focus-visible/help:text-ink group-focus-visible/help:opacity-100 group-focus-visible/help:outline-2 group-focus-visible/help:outline-acc group-aria-expanded/help:border-acc group-aria-expanded/help:text-ink group-aria-expanded/help:opacity-100 motion-reduce:transition-none"
        >
          ?
        </span>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        collisionPadding={12}
        aria-labelledby={titleId}
        className="w-[min(20rem,calc(100vw-24px))]"
        // Échap ferme la fenêtre d'aide seulement : il ne remonte pas au panneau ou à la fiche qui la contient.
        onKeyDown={(e) => {
          if (e.key === "Escape") e.stopPropagation();
        }}
      >
        <TutorialCard tutorial={tutorialFor(topic)} titleId={titleId} />
      </PopoverContent>
    </Popover>
  );
}
