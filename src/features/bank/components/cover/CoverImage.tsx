import { MapIcon } from "lucide-react";
import { coverDataUrl } from "@/features/maps/cover";
import type { MapCover } from "@/features/maps/cover";
import { colorCss } from "@/features/map-doc/palette";
import { cn } from "@/lib/utils";
import { COVER_ICON_DEFS } from "../../cover/coverIcons";

/**
 * Logo ou aperçu d'une carte, décoratif (le nom de la carte la désigne). L'aperçu est un SVG affiché
 * UNIQUEMENT comme image, par une adresse data: (coverDataUrl revalide son contenu) : il n'est jamais
 * inséré dans la page, n'exécute rien et ne charge rien. Sans logo : un cadre vide discret.
 */
export default function CoverImage({ cover, className }: { cover: MapCover | null | undefined; className?: string }) {
  const frame = cn(
    "grid aspect-[180/112] shrink-0 place-items-center overflow-hidden rounded-[6px] border border-line bg-bg",
    className,
  );
  if (cover?.kind === "preview") {
    const src = coverDataUrl(cover.svg);
    return (
      <span aria-hidden="true" className={frame}>
        {/* Image data: locale, déjà dimensionnée : next/image n'apporterait rien (et refuse le SVG par défaut). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt="" width={180} height={112} className="size-full object-cover" draggable={false} />}
      </span>
    );
  }
  if (cover?.kind === "icon") {
    const { Icon } = COVER_ICON_DEFS[cover.icon];
    return (
      <span aria-hidden="true" className={frame} style={{ color: colorCss(cover.color) }}>
        <Icon className="size-[45%]" strokeWidth={1.8} />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={cn(frame, "border-dashed text-line")}>
      <MapIcon className="size-[35%]" strokeWidth={1.5} />
    </span>
  );
}
