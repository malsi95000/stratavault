import { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import { linkAnchors } from "@/features/map-doc/refs";
import { colorsOf } from "@/features/map-doc/styles";
import { colorCss } from "@/features/map-doc/types";
import type { CountryAnchor } from "@/features/map-doc/refs";
import { useEditorStore } from "@/features/editor/store";
import { selectVisibility } from "@/features/editor/storeFilters";
import { onGround, routePath } from "@/features/editor/globe3d";
import type { GlobeView } from "@/features/editor/globe3d";
import { arcRoute, arcSegmentCap } from "@/features/editor/globeRoutes";
import { shown } from "./shared";
import type { LayerProps } from "./shared";

type LinkPathProps = Pick<LayerProps, "path"> & {
  id: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  selected: boolean;
  /** Couleur choisie pour le lien (valeur CSS), ou celle de sa catégorie ; undefined : couleur d'accent. */
  color?: string;
};

/**
 * Trait visible d'un lien : accent (blanc s'il est sélectionné) ; un lien coloré garde sa couleur,
 * sélectionné, il s'épaissit sur un liseré blanc (LinkHalo).
 */
function stroke(color: string | undefined, selected: boolean): { className: string; style?: CSSProperties } {
  if (color !== undefined) return { className: "", style: { stroke: color } };
  return { className: selected ? "stroke-white" : "stroke-acc" };
}

/** Liseré blanc sous un lien coloré sélectionné. */
function LinkHalo({ d }: { d: string }) {
  return (
    <path d={d} className="pointer-events-none fill-none stroke-white opacity-80" strokeWidth={6} vectorEffect="non-scaling-stroke" />
  );
}

/**
 * Un lien : trait visible (2 px, 3,5 px en blanc s'il est sélectionné) et trait transparent de 14 px
 * pour le clic. Mémoïsé sur ses extrémités : saisir le titre ou les notes ne recalcule aucun tracé.
 */
const LinkPath = memo(function LinkPath({ path, id, ax, ay, bx, by, selected, color }: LinkPathProps) {
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
  const line = stroke(color, selected);
  return (
    <g>
      {color !== undefined && selected && <LinkHalo d={d} />}
      <path
        d={d}
        className={`pointer-events-none fill-none ${line.className}`}
        style={line.style}
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
const ArcLink = memo(function ArcLink({ view, maxSegments, id, ax, ay, bx, by, selected, color }: ArcLinkProps) {
  const route = useMemo(() => arcRoute([ax, ay], [bx, by], maxSegments), [ax, ay, bx, by, maxSegments]);
  const ground = useMemo(() => onGround(route), [route]);
  const d = routePath(route, view);
  const line = stroke(color, selected);
  return (
    <g>
      <path
        d={routePath(ground, view)}
        className={`pointer-events-none fill-none ${line.className} opacity-30`}
        style={line.style}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {color !== undefined && selected && <LinkHalo d={d} />}
      <path
        d={d}
        className={`pointer-events-none fill-none ${line.className}`}
        style={line.style}
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

/** Liens entre deux éléments (pays, balise, point, zone, texte), à la couleur choisie pour chacun (EDI-04). */
function LinksLayer({ path, countryAnchor, globeView }: LinksLayerProps) {
  // Pas d'abonnement au document entier : les notes et dates des pays ne concernent pas ce calque.
  const links = useEditorStore((s) => s.doc.links);
  const pings = useEditorStore((s) => s.doc.pings);
  const points = useEditorStore((s) => s.doc.points);
  const zones = useEditorStore((s) => s.doc.zones);
  const texts = useEditorStore((s) => s.doc.texts);
  const selected = useEditorStore((s) => (s.selection?.k === "l" ? s.selection.id : null));
  const styles = useEditorStore((s) => s.doc.styles);
  const categories = useEditorStore((s) => s.doc.categories);
  const colors = useMemo(() => colorsOf({ styles, categories }, "l"), [styles, categories]);
  const visibility = useEditorStore(selectVisibility);
  const anchored = useMemo(
    () => linkAnchors({ links, pings, points, zones, texts }, countryAnchor),
    [links, pings, points, zones, texts, countryAnchor],
  );
  // Liens écartés par le filtre : non rendus.
  const lines = useMemo(
    () => (visibility ? anchored.filter((l) => shown(visibility, "l", l.id, selected)) : anchored),
    [anchored, visibility, selected],
  );
  // Vue globe : nombre de points de tous les arcs borné (voir arcSegmentCap).
  const maxSegments = arcSegmentCap(lines.length);
  return (
    <g>
      {lines.map(({ id, a, b }) => {
        const color = colors.get(id);
        const common = { id, ax: a[0], ay: a[1], bx: b[0], by: b[1], selected: id === selected, color: color && colorCss(color) };
        return globeView ? (
          <ArcLink key={id} view={globeView} maxSegments={maxSegments} {...common} />
        ) : (
          <LinkPath key={id} path={path} {...common} />
        );
      })}
    </g>
  );
}

export default memo(LinksLayer);
