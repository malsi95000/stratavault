"use client";

import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { geoPath } from "d3";
import type { GeoProjection } from "d3";
import { dialogs } from "@/components/dialogs";
import { countryByCode } from "@/data/countries";
import { ROUTE_STEP_PX, globeView } from "@/features/editor/globe3d";
import { detailLevels, globeGeometries, restEpsilon } from "@/features/editor/globeDetail";
import type { DragView } from "@/features/editor/globeDetail";
import { routeMapClick, toTarget } from "@/features/editor/mapClick";
import type { MapClickAction, MapTarget } from "@/features/editor/mapClick";
import {
  NO_ROTATION,
  clientToLL,
  globeRadius,
  makeProjection,
  rotationCenteredOn,
  screenCenterLL,
} from "@/features/editor/projection";
import type { Rotation } from "@/features/editor/projection";
import { useEditorStore } from "@/features/editor/store";
import { dragMode, mapCursorClass } from "@/features/editor/tools";
import { rehydrateView, useViewStore } from "@/features/editor/viewStore";
import { countryAnchorFor, hoverLabel } from "@/features/editor/world";
import type { World } from "@/features/editor/world";
import BackgroundLayer from "./layers/BackgroundLayer";
import CapitalsLayer from "./layers/CapitalsLayer";
import CountriesLayer from "./layers/CountriesLayer";
import DraftLayer from "./layers/DraftLayer";
import FluxLayer from "./layers/FluxLayer";
import LinksLayer from "./layers/LinksLayer";
import PingsLayer from "./layers/PingsLayer";
import PointsLayer from "./layers/PointsLayer";
import TextsLayer from "./layers/TextsLayer";
import ZonesLayer from "./layers/ZonesLayer";
import { gommeConfirm } from "./fiches/texts";
import Tooltip from "./Tooltip";
import type { TooltipHandle } from "./Tooltip";
import { useDrawing } from "./useDrawing";
import { useGlobeDrag } from "./useGlobeDrag";
import { useMapZoom } from "./useMapZoom";
import type { Size } from "./useMapZoom";

/** Dernière orientation du globe : retrouvée en revenant dans l'éditeur. */
let lastRotation: Rotation = NO_ROTATION;

/** Élément cliquable sous le pointeur (délégation, comme la bêta) : attributs data-k et data-id. */
function hit(target: EventTarget | null, selector = "[data-k]"): MapTarget {
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  return toTarget(el?.getAttribute("data-k"), el?.getAttribute("data-id"));
}

/**
 * Carte SVG, en planisphère ou en globe. React rend les calques ; le zoom d3 est appliqué directement
 * au viewBox (useMapZoom), sans re-rendu. En vue globe, le glisser fait tourner le globe (useGlobeDrag) :
 * la projection change, et les calques sont redessinés au plus une fois par image.
 */
export default function MapCanvas({ world }: { world: World | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<TooltipHandle>(null);
  // Dernière projection affichée et taille : lues au changement de vue (hors rendu).
  const projectionRef = useRef<GeoProjection | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [rotation, setRotation] = useState<Rotation>(lastRotation);
  // Cadrage figé pendant une rotation (dessin allégé), null au repos (pleine résolution).
  const [dragView, setDragView] = useState<DragView | null>(null);
  // Échelle du zoom à la fin du dernier geste : résolution du globe au repos et des tracés en relief.
  const [zoomK, setZoomK] = useState(1);
  const tool = useEditorStore((s) => s.tool);
  const view = useViewStore((s) => s.mapView);
  const globe = view === "globe";

  // Vrai pendant une rotation du globe : la molette est alors ignorée, le cadrage (résolution, calotte
  // visible, sensibilité) étant figé jusqu'au relâchement.
  const rotatingRef = useRef(false);

  const hideTip = useCallback(() => tipRef.current?.hide(), []);
  const onZoomEnd = useCallback((k: number) => setZoomK(k), []);
  const zoomPaused = useCallback(() => rotatingRef.current, []);
  const zoom = useMapZoom(containerRef, svgRef, size, hideTip, onZoomEnd, zoomPaused);

  // Taille du SVG : la projection est recalculée quand elle change.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;
  const projection = useMemo(
    () => (width && height ? makeProjection(width, height, view, globe ? rotation : NO_ROTATION) : null),
    [width, height, view, globe, rotation],
  );
  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);
  // Zones et flux : même projection, sans rééchantillonnage (leurs tracés sont bornés : shapeBudget.ts).
  const shapePath = useMemo(
    () =>
      width && height
        ? geoPath(makeProjection(width, height, view, globe ? rotation : NO_ROTATION, { resample: false }))
        : null,
    [width, height, view, globe, rotation],
  );
  // Vue globe : repère 3D de la rotation courante (liens en arcs aériens, flux en relief).
  const frame = useMemo(
    () => (globe && projection ? globeView(projection, ROUTE_STEP_PX / zoomK) : null),
    [globe, projection, zoomK],
  );
  const countryAnchor = useMemo(() => (world ? countryAnchorFor(world) : null), [world]);
  // Vue globe : pays de la face visible seulement, en version allégée pendant une rotation.
  const levels = useMemo(() => (globe && world ? detailLevels(world) : null), [globe, world]);
  const restEps = useMemo(() => (width && height ? restEpsilon(globeRadius(width, height), zoomK) : 0), [width, height, zoomK]);
  const geometries = useMemo(
    () => (levels && projection ? globeGeometries(levels, projection, dragView, restEps) : null),
    [levels, projection, dragView, restEps],
  );

  useLayoutEffect(() => {
    projectionRef.current = projection;
  }, [projection]);

  // Changement de vue : vers le globe, il se centre sur le point au centre de l'écran ; zoom remis à 1.
  useEffect(
    () =>
      useViewStore.subscribe((state, prev) => {
        // L'ouverture de la frise ne change pas la carte (elle reste en dessous, telle quelle).
        if (state.mapView === prev.mapView) return;
        const current = projectionRef.current;
        // Premier affichage (vue mémorisée lue avant que la taille soit connue) : rien à recentrer.
        if (!current) return;
        if (state.mapView === "globe") {
          const svg = svgRef.current;
          const center = svg && screenCenterLL(current, zoom.transformRef.current, svg.clientWidth, svg.clientHeight);
          if (center) {
            lastRotation = rotationCenteredOn(center);
            setRotation(lastRotation);
          }
        }
        setDragView(null);
        zoom.reset();
        tipRef.current?.hide();
      }),
    [zoom],
  );

  // Vue mémorisée dans ce navigateur : lue une fois monté (le rendu serveur affiche le planisphère).
  useEffect(() => rehydrateView(), []);

  const globeDrag = useGlobeDrag({
    active: () => dragMode(useEditorStore.getState().tool, useViewStore.getState().mapView) === "rotate",
    start: () => {
      if (!projection || !world) return null;
      const t = zoom.transformRef.current;
      const viewport = { x: -t.x / t.k, y: -t.y / t.k, width: width / t.k, height: height / t.k };
      return { rotation, radius: projection.scale(), drag: { k: t.k, viewport } };
    },
    onRotate: (next) => {
      lastRotation = next;
      setRotation(next);
      tipRef.current?.hide();
    },
    // Le retour à la pleine résolution peut attendre : il est interrompu si une nouvelle rotation commence.
    onDragChange: (drag) => {
      rotatingRef.current = drag !== null;
      if (drag) setDragView(drag);
      else startTransition(() => setDragView(null));
    },
    onPinch: (ratio, clientX, clientY) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) zoom.scaleBy(ratio, [clientX - rect.left, clientY - rect.top]);
    },
    // L'échelle n'est prise en compte (résolution des tracés) qu'au relâchement : aucun re-rendu pendant le pincement.
    onPinchEnd: () => zoom.endGesture(),
  });

  /** Exécute l'action décrite par routeMapClick (bêta, lignes 785-806). */
  function run(action: MapClickAction, clientX: number, clientY: number) {
    const state = useEditorStore.getState();
    switch (action.type) {
      case "open":
        return state.open(action.k, action.id);
      case "close":
        return state.close();
      case "pick":
        return state.pick(action.ref);
      case "cancelPending":
        return state.cancelPending();
      case "place": {
        const svg = svgRef.current;
        if (!svg || !projection) return;
        // Hors du globe : ll vaut null et le store affiche « Cliquez à l’intérieur de la carte. »
        const ll = clientToLL(projection, zoom.transformRef.current, svg.getBoundingClientRect(), clientX, clientY);
        if (action.tool === "ping") return state.placePing(ll);
        if (action.tool === "point") return state.placePoint(ll);
        return state.placeText(ll);
      }
      case "erase": {
        // Même opération que les boutons « Supprimer… » des fiches (cascade des liens), plus le texte d'aide.
        // Effacement immédiat, sauf s'il emporte des fiches supplémentaires : on demande confirmation.
        const confirmText = gommeConfirm(state.doc, action.k, action.id);
        if (!confirmText) return state.gomme(action.k, action.id);
        void dialogs.confirm(confirmText, { confirmLabel: "Supprimer", destructive: true }).then((ok) => {
          if (ok) useEditorStore.getState().gomme(action.k, action.id);
        });
        return;
      }
      case "none":
        return;
    }
  }

  function onClick(ev: ReactMouseEvent<SVGSVGElement>) {
    // Fin d'une rotation du globe : ce n'est pas un clic.
    if (globeDrag.consumeClick()) return;
    // Rien avant que la carte soit prête (hydratation en cours : l'ajout serait perdu).
    if (!world) return;
    const { tool: current, pending } = useEditorStore.getState();
    run(routeMapClick(current, hit(ev.target), pending), ev.clientX, ev.clientY);
  }

  // Lasso et pinceau : le glisser dessine. Vue globe, autres outils : il fait tourner le globe.
  const drawing = useDrawing(svgRef, projection, zoom.transformRef);
  const pointer = {
    onPointerDown(ev: ReactPointerEvent<SVGSVGElement>) {
      if (!world) return;
      globeDrag.onPointerDown(ev);
      drawing.onPointerDown(ev);
    },
    onPointerMove(ev: ReactPointerEvent<SVGSVGElement>) {
      globeDrag.onPointerMove(ev);
      drawing.onPointerMove(ev);
    },
    onPointerUp(ev: ReactPointerEvent<SVGSVGElement>) {
      globeDrag.onPointerUp(ev);
      drawing.onPointerUp(ev);
    },
    onPointerCancel(ev: ReactPointerEvent<SVGSVGElement>) {
      globeDrag.onPointerCancel(ev);
      drawing.onPointerCancel(ev);
    },
  };

  function onMouseMove(ev: ReactMouseEvent<SVGSVGElement>) {
    // Pas d'infobulle pendant une rotation du globe.
    if (dragView) return;
    const target = hit(ev.target, '[data-k="c"]');
    const country = target ? countryByCode.get(target.id) : undefined;
    if (!country) return tipRef.current?.hide();
    tipRef.current?.show(hoverLabel(country), ev.clientX, ev.clientY);
  }

  const ready = world && projection && path && shapePath && countryAnchor;

  return (
    <div ref={containerRef} className="absolute inset-0 touch-none">
      <svg
        ref={svgRef}
        role="img"
        aria-label={globe ? "Carte du monde en globe (projection orthographique)" : "Carte du monde en projection Winkel tripel"}
        className={`block size-full touch-none select-none ${mapCursorClass(tool, view)}`}
        onClick={onClick}
        {...pointer}
        onMouseMove={onMouseMove}
        onMouseLeave={() => tipRef.current?.hide()}
      >
        <g>
          {path && <BackgroundLayer path={path} />}
          {ready && (
            <>
              <CountriesLayer world={world} path={path} geometries={geometries} />
              <ZonesLayer shapePath={shapePath} />
              <LinksLayer path={path} countryAnchor={countryAnchor} globeView={frame} />
              <CapitalsLayer projection={projection} />
              <PingsLayer projection={projection} />
              <PointsLayer projection={projection} />
              <TextsLayer projection={projection} />
              <FluxLayer shapePath={shapePath} globeView={frame} />
              <DraftLayer path={path} />
            </>
          )}
        </g>
      </svg>
      <Tooltip ref={tipRef} />
    </div>
  );
}
