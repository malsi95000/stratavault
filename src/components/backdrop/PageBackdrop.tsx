import "server-only";

import { backdropLayers } from "@/features/backdrops/variants";
import { BACKDROP_HEIGHT, BACKDROP_WIDTH, type BackdropTone, type BackdropVariant } from "@/features/backdrops/types";

const TONES: Record<BackdropTone, string> = {
  line: "stroke-backdrop-line",
  strong: "stroke-backdrop-strong",
  accent: "stroke-backdrop-accent",
};

/**
 * Fond de page thématique (ANN-01) : motif topographique fixe, derrière tout le contenu (le `body`
 * isole son empilement : voir layout.tsx), décoratif et ignoré des lecteurs d'écran. Les traits
 * s'estompent au centre, là où se trouve le texte, pour ne pas gêner la lecture. Il n'est pas imprimé.
 */
export default function PageBackdrop({ variant }: { variant: BackdropVariant }) {
  return (
    <div
      aria-hidden="true"
      data-backdrop={variant}
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden [mask-image:radial-gradient(ellipse_55%_65%_at_50%_45%,rgb(0_0_0/.3),#000)]"
    >
      <svg
        viewBox={`0 0 ${BACKDROP_WIDTH} ${BACKDROP_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
        className="size-full fill-none"
      >
        {backdropLayers(variant).map((layer, i) => (
          <path
            key={i}
            d={layer.d}
            className={TONES[layer.tone]}
            strokeWidth={1}
            strokeDasharray={layer.dash}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
