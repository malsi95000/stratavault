import { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import { DEFAULT_FLUX_OPACITY, FLUX_COLOR_IDS, FLUX_TOKENS, FLUX_WIDTH_FACTOR } from "@/features/map-doc/types";
import type { FluxColor, LonLat } from "@/features/map-doc/types";
import { onGround, routePath } from "@/features/editor/globe3d";
import type { GlobeView } from "@/features/editor/globe3d";
import { fluxBudgets, fluxRoute } from "@/features/editor/globeRoutes";
import { FLAT_FLUX_LAYER_BUDGET, MIN_LINE_POINTS, fitShape, shapeBudgets } from "@/features/editor/shapeBudget";
import { useEditorStore } from "@/features/editor/store";
import type { ShapeLayerProps } from "./shared";

/** Opacité de l'ombre au sol d'un flux, relative à celle du trait. */
const SHADOW_OPACITY = 0.3;

type Stroke = { id: string; color: FluxColor; width: number; opacity: number; points: readonly LonLat[] };

const strokeStyle = (color: FluxColor, opacity: number): CSSProperties => ({
  stroke: `var(${FLUX_TOKENS[color]})`,
  strokeOpacity: opacity,
});

/** Trait commun aux deux vues : épaisseur × 5 qui grossit avec le zoom, extrémités arrondies. */
function FluxPath({ d, stroke, hit, opacity }: { d: string; stroke: Stroke; hit: boolean; opacity: number }) {
  return (
    <path
      d={d}
      data-k={hit ? "flux" : undefined}
      data-id={hit ? stroke.id : undefined}
      className={hit ? "cursor-pointer fill-none" : "pointer-events-none fill-none"}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={stroke.width * FLUX_WIDTH_FACTOR}
      style={strokeStyle(stroke.color, opacity)}
    />
  );
}

/**
 * Vue globe : trait lissé et densifié le long des grands cercles, légèrement surélevé au-dessus de son
 * ombre au sol, coupé là où il passe derrière la Terre. Le tracé est calculé une fois par trait ; seule
 * sa projection suit la rotation.
 */
const GlobeFlux = memo(function GlobeFlux({ stroke, budget, view }: { stroke: Stroke; budget: number; view: GlobeView }) {
  const route = useMemo(() => fluxRoute(stroke.points, budget), [stroke.points, budget]);
  const ground = useMemo(() => onGround(route), [route]);
  return (
    <>
      <FluxPath d={routePath(ground, view)} stroke={stroke} hit={false} opacity={stroke.opacity * SHADOW_OPACITY} />
      <FluxPath d={routePath(route, view)} stroke={stroke} hit opacity={stroke.opacity} />
    </>
  );
});

type FluxLayerProps = ShapeLayerProps & {
  /** Vue globe : repère de la rotation courante (traits en relief) ; absent sur le planisphère. */
  globeView?: GlobeView | null;
};

/** Traits du pinceau flux : épaisseur × 5, opacité 0,65 ; ils grossissent avec le zoom. */
function FluxLayer({ shapePath, globeView }: FluxLayerProps) {
  const flux = useEditorStore((s) => s.doc.flux);
  const strokes = useMemo(
    () =>
      FLUX_COLOR_IDS.flatMap((color) =>
        (flux[color] ?? []).map(
          (f): Stroke => ({ id: f.id, color, width: f.width, opacity: f.opacity ?? DEFAULT_FLUX_OPACITY, points: f.points }),
        ),
      ),
    [flux],
  );
  const globe = Boolean(globeView);
  // Vue globe : nombre de points de tous les tracés borné (voir fluxBudgets).
  const budgets = useMemo(() => (globe ? fluxBudgets(strokes.map((s) => s.points)) : []), [strokes, globe]);
  // Planisphère : tracés densifiés et bornés (FLAT_FLUX_LAYER_BUDGET), mémoïsés sur la projection.
  const flat = useMemo(() => {
    if (globe) return [];
    const flatBudgets = shapeBudgets(
      strokes.map((s) => s.points),
      FLAT_FLUX_LAYER_BUDGET,
      MIN_LINE_POINTS,
    );
    return strokes.map(
      (s, i) => shapePath({ type: "LineString", coordinates: fitShape(s.points, flatBudgets[i], MIN_LINE_POINTS) }) ?? "",
    );
  }, [strokes, shapePath, globe]);
  return (
    <g>
      {strokes.map((s, i) =>
        globeView ? (
          <GlobeFlux key={s.id} stroke={s} budget={budgets[i]} view={globeView} />
        ) : (
          <FluxPath key={s.id} d={flat[i]} stroke={s} hit opacity={s.opacity} />
        ),
      )}
    </g>
  );
}

export default memo(FluxLayer);
