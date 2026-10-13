import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { select, zoom, zoomIdentity } from "d3";
import type { D3ZoomEvent, ZoomBehavior, ZoomTransform } from "d3";
import { ZOOM_MAX, ZOOM_MIN } from "@/features/editor/projection";
import { useEditorStore } from "@/features/editor/store";
import { zoomAccepts } from "@/features/editor/tools";
import { useViewStore } from "@/features/editor/viewStore";

export type Size = { width: number; height: number };

export type MapZoom = {
  /** Transformation courante du zoom : à combiner avec screenToLL (projection.ts) pour les placements. */
  transformRef: RefObject<ZoomTransform>;
  /** Remet le zoom à 1 (changement de vue). */
  reset: () => void;
  /**
   * Zoome de `ratio` autour d'un point du conteneur (pincement sur écran tactile, vue globe), sans signaler
   * de fin de geste : appeler endGesture au relâchement des doigts.
   */
  scaleBy: (ratio: number, point: [number, number]) => void;
  /** Fin d'un geste mené par scaleBy : signale l'échelle atteinte (onZoomEnd). */
  endGesture: () => void;
};

/** Dernier cadrage de la carte : retrouvé en revenant dans l'éditeur (la bêta gardait son <svg>). */
let lastTransform: ZoomTransform = zoomIdentity;

/**
 * Cadrage du zoom appliqué au viewBox (et non par un transform sur un <g>) : le navigateur redessine
 * les tracés en vectoriel à chaque cran au lieu d'agrandir une image, d'où une carte nette pendant le zoom.
 */
function applyView(svg: SVGSVGElement, t: ZoomTransform, { width, height }: Size) {
  if (width && height) svg.setAttribute("viewBox", `${-t.x / t.k} ${-t.y / t.k} ${width / t.k} ${height / t.k}`);
  svg.style.setProperty("--k", String(t.k));
}

/**
 * Zoom d3 impératif, créé une fois : appliqué directement au viewBox et à --k (échelle courante, lue par
 * les éléments en contre-échelle), sans re-rendu React. Il écoute le conteneur HTML et non le <svg> :
 * sur un <svg>, d3 lirait la position du pointeur dans les coordonnées du viewBox (déjà zoomées) et le
 * zoom ne se centrerait plus sous la souris.
 */
export function useMapZoom(
  containerRef: RefObject<HTMLDivElement | null>,
  svgRef: RefObject<SVGSVGElement | null>,
  { width, height }: Size,
  onZoom: () => void,
  /** Fin d'un geste de zoom (molette arrêtée, pincement relâché, cadrage imposé), avec l'échelle atteinte. */
  onZoomEnd: (k: number) => void = () => {},
  /** Vrai quand le zoom doit être ignoré, molette comprise (rotation du globe en cours : cadrage figé). */
  paused: () => boolean = () => false,
): MapZoom {
  const behaviorRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const onZoomRef = useRef(onZoom);
  const onZoomEndRef = useRef(onZoomEnd);
  const pausedRef = useRef(paused);
  // Le cadrage précédent est réappliqué une fois, dès que l'étendue du zoom est connue.
  const restoredRef = useRef(false);
  // Vrai pendant un scaleBy : d3 y émet « end » à chaque appel, qui n'est pas la fin du geste (pincement).
  const quietRef = useRef(false);

  useLayoutEffect(() => {
    onZoomRef.current = onZoom;
    onZoomEndRef.current = onZoomEnd;
    pausedRef.current = paused;
  });

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;
    svg.style.setProperty("--k", String(transformRef.current.k));
    const behavior = zoom<HTMLDivElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      // Lasso et pinceau : le glisser dessine ; vue globe : il fait tourner le globe. La molette zoome toujours.
      .filter((ev: MouseEvent) => {
        if (pausedRef.current()) {
          // Molette ignorée, mais sans faire défiler ni zoomer la page.
          if (ev.type === "wheel") ev.preventDefault();
          return false;
        }
        return zoomAccepts(ev, useEditorStore.getState().tool, useViewStore.getState().view);
      })
      .on("zoom", (e: D3ZoomEvent<HTMLDivElement, unknown>) => {
        transformRef.current = e.transform;
        lastTransform = e.transform;
        applyView(svg, e.transform, sizeRef.current);
        onZoomRef.current();
      })
      .on("end", (e: D3ZoomEvent<HTMLDivElement, unknown>) => {
        if (!quietRef.current) onZoomEndRef.current(e.transform.k);
      });
    behaviorRef.current = behavior;
    const selection = select(container);
    selection.call(behavior).on("dblclick.zoom", null);
    return () => {
      selection.on(".zoom", null);
      behaviorRef.current = null;
    };
  }, [containerRef, svgRef]);

  // Avant l'affichage : le viewBox suit la nouvelle taille et le cadrage précédent est réappliqué sans image intermédiaire.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const behavior = behaviorRef.current;
    if (!container || !behavior || !width || !height) return;
    sizeRef.current = { width, height };
    behavior.extent([[0, 0], [width, height]]).translateExtent([[0, 0], [width, height]]);
    if (!restoredRef.current) {
      restoredRef.current = true;
      behavior.transform(select(container), lastTransform);
    }
    // Ramène la vue dans les nouvelles limites.
    behavior.translateBy(select(container), 0, 0);
  }, [containerRef, width, height]);

  return useMemo(
    () => ({
      transformRef,
      reset: () => {
        const container = containerRef.current;
        if (container && behaviorRef.current) behaviorRef.current.transform(select(container), zoomIdentity);
      },
      scaleBy: (ratio, point) => {
        const container = containerRef.current;
        const behavior = behaviorRef.current;
        if (!container || !behavior) return;
        // Sur une sélection, d3 émet start, zoom et end aussitôt : end est ignoré jusqu'à endGesture.
        quietRef.current = true;
        try {
          behavior.scaleBy(select(container), ratio, point);
        } finally {
          quietRef.current = false;
        }
      },
      endGesture: () => onZoomEndRef.current(transformRef.current.k),
    }),
    [containerRef],
  );
}
