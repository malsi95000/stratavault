import { memo, useMemo } from "react";
import { useEditorStore } from "@/features/editor/store";
import type { CountryFeature, World } from "@/features/editor/world";
import type { LayerProps } from "./shared";

type CountryPathProps = { d: string; code: string | null; name: string; selected: boolean; pending: boolean };

const BASE = "stroke-map-border [stroke-linejoin:round]";

// Mémoïsé : un changement de sélection ne re-rend que les deux pays concernés.
const CountryPath = memo(function CountryPath({ d, code, name, selected, pending }: CountryPathProps) {
  if (code === null) {
    // Géométrie sans entité (ne devrait pas arriver : toutes les géométries sont associées).
    return (
      <path d={d} data-name={name} className={`${BASE} pointer-events-none fill-map-territory`} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
    );
  }
  const fill = pending
    ? "fill-map-country-pending"
    : selected
      ? "fill-map-country-selected"
      : "fill-map-country hover:fill-map-country-hover";
  return (
    <path
      d={d}
      data-k="c"
      data-id={code}
      className={`${BASE} ${fill} cursor-pointer`}
      strokeWidth={0.6}
      vectorEffect="non-scaling-stroke"
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

/** Les 241 géométries du fond de carte, toutes cliquables. */
function CountriesLayer({ world, path, geometries }: CountriesLayerProps) {
  const selected = useEditorStore((s) => (s.selection?.k === "c" ? s.selection.id : null));
  const pending = useEditorStore((s) => s.pending);
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
        />
      ))}
    </g>
  );
}

export default memo(CountriesLayer);
