import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { GeoProjection, ZoomTransform } from "d3";
import { extendDraft, startDraft } from "@/features/editor/drawing";
import { clientToLL, pointProjector } from "@/features/editor/projection";
import { useEditorStore } from "@/features/editor/store";

type SvgPointerEvent = ReactPointerEvent<SVGSVGElement>;

/**
 * Lasso et pinceau flux (bêta, lignes 761-784) : le glisser dessine, le relâchement crée la zone ou le
 * trait. Un seul pointeur trace à la fois (capturé par le <svg>) ; les autres sont ignorés.
 */
export function useDrawing(
  svgRef: RefObject<SVGSVGElement | null>,
  projection: GeoProjection | null,
  transformRef: RefObject<ZoomTransform>,
) {
  const tracingRef = useRef<number | null>(null);

  /** Position du pointeur → [lon, lat], ou null hors du globe. */
  function pointerLL(ev: SvgPointerEvent) {
    const svg = svgRef.current;
    if (!svg || !projection) return null;
    return clientToLL(projection, transformRef.current, svg.getBoundingClientRect(), ev.clientX, ev.clientY);
  }

  function onPointerDown(ev: SvgPointerEvent) {
    const state = useEditorStore.getState();
    if ((state.tool !== "lasso" && state.tool !== "flux") || ev.button !== 0 || tracingRef.current !== null) return;
    ev.preventDefault();
    const ll = pointerLL(ev);
    if (!ll) return;
    const draft = startDraft(state.tool, ll, state.fluxColor, state.fluxWidth);
    if (!draft) return;
    tracingRef.current = ev.pointerId;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    state.setDrawing(draft);
  }

  function onPointerMove(ev: SvgPointerEvent) {
    if (tracingRef.current !== ev.pointerId || !projection) return;
    const { drawing, setDrawing } = useEditorStore.getState();
    if (!drawing) return;
    const ll = pointerLL(ev);
    if (!ll) return;
    const next = extendDraft(drawing, ll, pointProjector(projection), transformRef.current.k);
    if (next !== drawing) setDrawing(next);
  }

  function onPointerUp(ev: SvgPointerEvent) {
    if (tracingRef.current !== ev.pointerId) return;
    tracingRef.current = null;
    const { drawing, tool, setDrawing, addZone, addFlux } = useEditorStore.getState();
    // Changement d'outil pendant le tracé : setTool a déjà effacé le brouillon.
    if (!drawing || drawing.kind !== tool) return;
    setDrawing(null);
    // Lasso : moins de 3 points → « Contour trop court… » ; sinon la zone est créée et sa fiche ouverte.
    if (drawing.kind === "lasso") return addZone(drawing.points);
    // Flux : un seul point (simple clic) est ignoré ; sinon le trait est ajouté à sa couleur.
    addFlux(drawing.points, drawing.color, drawing.width);
  }

  function onPointerCancel(ev: SvgPointerEvent) {
    if (tracingRef.current !== ev.pointerId) return;
    tracingRef.current = null;
    useEditorStore.getState().setDrawing(null);
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
