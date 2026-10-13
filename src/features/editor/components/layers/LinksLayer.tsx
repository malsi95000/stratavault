import { memo, useMemo } from "react";
import { linkAnchors } from "@/features/map-doc/refs";
import type { CountryAnchor } from "@/features/map-doc/refs";
import { useEditorStore } from "@/features/editor/store";
import { onGround, routePath } from "@/features/editor/globe3d";
import type { GlobeView } from "@/features/editor/globe3d";
import { arcRoute, arcSegmentCap } from "@/features/editor/globeRoutes";
import type { LayerProps } from "./shared";

type LinkPathProps = Pick<LayerProps, "path"> & {
  id: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  selected: boolean;
};

/**
 * Un lien : trait visible (2 px, 3,5 px en blanc s'il est sélectionné) et trait transparent de 14 px
 * pour le clic. Mémoïsé sur ses extrémités : saisir le titre ou les notes ne recalcule aucun tracé.
 */
const LinkPath = memo(function LinkPath({ path, id, ax, ay, bx, by, selected }: LinkPathProps) {
  // Arc de grand cercle entre les deux ancres (géodésique, découpé par la projection).
  const d = useMemo(
    () =>
      path({
        type: "LineString",
        coordinates: [
          [ax, ay],
          [bx, by],
        ],
      }) ?? "",
    [path, ax, ay, bx, by],
  );
  return (
    <g>
      <path
        d={d}
        className={`pointer-events-none fill-none ${selected ? "stroke-white" : "stroke-acc"}`}
        strokeWidth={selected ? 3.5 : 2}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        data-k="l"
        data-id={id}
        className="cursor-pointer fill-none stroke-transparent [pointer-events:stroke]"
        strokeWidth={14}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
});

type ArcLinkProps = Omit<LinkPathProps, "path"> & { view: GlobeView; maxSegments: number };

/**
 * Vue globe : le lien devient un arc aérien au-dessus du grand cercle, avec son ombre au sol (même
 * couleur, très atténuée) pour lire sa hauteur. L'arc est calculé une fois ; seule sa projection suit
 * la rotation du globe.
 */
const ArcLink = memo(function ArcLink({ view, maxSegments, id, ax, ay, bx, by, selected }: ArcLinkProps) {
  const route = useMemo(() => arcRoute([ax, ay], [bx, by], maxSegments), [ax, ay, bx, by, maxSegments]);
  const ground = useMemo(() => onGround(route), [route]);
  const d = routePath(route, view);
  const stroke = selected ? "stroke-white" : "stroke-acc";
  return (
    <g>
      <path
        d={routePath(ground, view)}
        className={`pointer-events-none fill-none ${stroke} opacity-30`}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        className={`pointer-events-none fill-none ${stroke}`}
        strokeWidth={selected ? 3.5 : 2}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        data-k="l"
        data-id={id}
        className="cursor-pointer fill-none stroke-transparent [pointer-events:stroke]"
        strokeWidth={14}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
});

type LinksLayerProps = Pick<LayerProps, "path"> & {
  countryAnchor: CountryAnchor;
  /** Vue globe : repère de la rotation courante (arcs aériens) ; absent sur le planisphère. */
  globeView?: GlobeView | null;
};

/** Liens entre deux éléments (pays, balise, point, zone, texte). */
function LinksLayer({ path, countryAnchor, globeView }: LinksLayerProps) {
  // Pas d'abonnement au document entier : les notes et dates des pays ne concernent pas ce calque.
  const links = useEditorStore((s) => s.doc.links);
  const pings = useEditorStore((s) => s.doc.pings);
  const points = useEditorStore((s) => s.doc.points);
  const zones = useEditorStore((s) => s.doc.zones);
  const texts = useEditorStore((s) => s.doc.texts);
  const selected = useEditorStore((s) => (s.selection?.k === "l" ? s.selection.id : null));
  const lines = useMemo(
    () => linkAnchors({ links, pings, points, zones, texts }, countryAnchor),
    [links, pings, points, zones, texts, countryAnchor],
  );
  // Vue globe : nombre de points de tous les arcs borné (voir arcSegmentCap).
  const maxSegments = arcSegmentCap(lines.length);
  return (
    <g>
      {lines.map(({ id, a, b }) =>
        globeView ? (
          <ArcLink key={id} view={globeView} maxSegments={maxSegments} id={id} ax={a[0]} ay={a[1]} bx={b[0]} by={b[1]} selected={id === selected} />
        ) : (
          <LinkPath key={id} path={path} id={id} ax={a[0]} ay={a[1]} bx={b[0]} by={b[1]} selected={id === selected} />
        ),
      )}
    </g>
  );
}

export default memo(LinksLayer);
