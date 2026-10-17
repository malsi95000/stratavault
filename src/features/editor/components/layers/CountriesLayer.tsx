import { memo, useMemo } from "react";
import { colorsOf } from "@/features/map-doc/styles";
import { colorCss } from "@/features/map-doc/types";
import { isVisible } from "@/features/filters/visibility";
import { useEditorStore } from "@/features/editor/store";
import { selectVisibility } from "@/features/editor/storeFilters";
import type { CountryFeature, World } from "@/features/editor/world";
import type { LayerProps } from "./shared";

type CountryPathProps = {
  d: string;
  code: string | null;
  name: string;
  selected: boolean;
  pending: boolean;
  /** Couleur choisie pour le pays (valeur CSS), ou celle de sa catégorie ; undefined : couleur par défaut. */
  color?: string;
  /** Écarté par le filtre : couleur par défaut, atténuée (il reste cliquable). */
  dimmed?: boolean;
};

const BASE = "stroke-map-border [stroke-linejoin:round]";
/** Pays coloré : teinte un peu atténuée (les frontières restent lisibles), pleine au survol et sélectionné. */
const COLORED = "[fill-opacity:0.72] hover:[fill-opacity:0.9]";
const COLORED_SELECTED = "[fill-opacity:1] stroke-ink";
/** Pays écarté par le filtre : fond de carte atténué, les pays retenus ressortent. */
const DIMMED = "fill-map-country [fill-opacity:0.4] hover:[fill-opacity:0.7]";

function countryFill(state: { pending: boolean; faded: boolean; colored: boolean; selected: boolean }): string {
  if (state.pending) return "fill-map-country-pending";
  if (state.faded) return DIMMED;
  if (state.colored) return state.selected ? COLORED_SELECTED : COLORED;
  return state.selected ? "fill-map-country-selected" : "fill-map-country hover:fill-map-country-hover";
}

// Mémoïsé : un changement de sélection ne re-rend que les deux pays concernés.
const CountryPath = memo(function CountryPath({ d, code, name, selected, pending, color, dimmed }: CountryPathProps) {
  if (code === null) {
    // Géométrie sans entité (ne devrait pas arriver : toutes les géométries sont associées).
    return (
      <path d={d} data-name={name} className={`${BASE} pointer-events-none fill-map-territory`} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
    );
  }
  // « En attente » (première extrémité d'un lien) l'emporte sur la couleur ; un pays coloré et
  // sélectionné garde sa couleur, entourée d'un trait clair. Écarté par le filtre, il est atténué et
  // perd sa couleur, sauf s'il est ouvert ou en attente.
  const faded = dimmed === true && !selected && !pending;
  const colored = color !== undefined && !pending && !faded;
  const fill = countryFill({ pending, faded, colored, selected });
  return (
    <path
      d={d}
      data-k="c"
      data-id={code}
      className={`${colored && selected ? "[stroke-linejoin:round]" : BASE} ${fill} cursor-pointer`}
      strokeWidth={colored && selected ? 1.6 : 0.6}
      vectorEffect="non-scaling-stroke"
      style={colored ? { fill: color } : undefined}
    />
  );
});

type CountriesLayerProps = Pick<LayerProps, "path"> & {
  world: World;
  /**
   * Vue globe : géométrie à dessiner pour chaque forme (même ordre que world.shapes), éventuellement
   * simplifiée ; null pour une forme cachée. Absent : pleine résolution (planisphère).
   */
  geometries?: readonly (CountryFeature | null)[] | null;
};

/** Valeur CSS de la couleur d'un pays, ou undefined s'il n'est pas coloré. */
function colorFor(colors: ReturnType<typeof colorsOf>, code: string | null): string | undefined {
  const color = code === null ? undefined : colors.get(code);
  return color ? colorCss(color) : undefined;
}

/** Les 241 géométries du fond de carte, toutes cliquables, à la couleur choisie pour chaque pays (EDI-04). */
function CountriesLayer({ world, path, geometries }: CountriesLayerProps) {
  const selected = useEditorStore((s) => (s.selection?.k === "c" ? s.selection.id : null));
  const pending = useEditorStore((s) => s.pending);
  const styles = useEditorStore((s) => s.doc.styles);
  const categories = useEditorStore((s) => s.doc.categories);
  const colors = useMemo(() => colorsOf({ styles, categories }, "c"), [styles, categories]);
  const visibility = useEditorStore(selectVisibility);
  const shapes = useMemo(
    () =>
      world.shapes.map((s, i) => {
        const geometry = geometries ? geometries[i] : s.feature;
        return { key: s.name, code: s.country?.code ?? null, name: s.name, d: geometry ? (path(geometry) ?? "") : "" };
      }),
    [world, path, geometries],
  );
  return (
    <g>
      {shapes.map((s) => (
        <CountryPath
          key={s.key}
          d={s.d}
          code={s.code}
          name={s.name}
          selected={s.code !== null && s.code === selected}
          pending={s.code !== null && pending === `c:${s.code}`}
          color={colorFor(colors, s.code)}
          dimmed={s.code !== null && !isVisible(visibility, "c", s.code)}
        />
      ))}
    </g>
  );
}

export default memo(CountriesLayer);
