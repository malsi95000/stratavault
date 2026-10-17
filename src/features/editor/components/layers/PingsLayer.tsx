import { memo, useMemo } from "react";
import { PING_TOKENS } from "@/features/map-doc/types";
import type { PingType } from "@/features/map-doc/types";
import { useEditorStore } from "@/features/editor/store";
import { selectVisibility } from "@/features/editor/storeFilters";
import { pointProjector } from "@/features/editor/projection";
import { COUNTER_SCALE, shown } from "./shared";
import type { LayerProps } from "./shared";

/** Épingle de la bêta, pointe en (0, 0). */
export const PIN_D = "M0 0C-2-8-9-12-9-19a9 9 0 1 1 18 0C9-12 2-8 0 0z";

/** Pictogramme dessiné dans la tête de l'épingle, par type (bêta, pingInner). */
export function PingGlyph({ type }: { type: PingType }) {
  switch (type) {
    case "maritime":
      return (
        <g className="fill-none stroke-pin-outline" strokeWidth={1.1} strokeLinecap="round">
          <path d="M-5.2-21.6c1.1-1.6 2.2-1.6 3.3 0s2.2 1.6 3.3 0 2.2-1.6 3.3 0" />
          <path d="M-5.2-18.2c1.1-1.6 2.2-1.6 3.3 0s2.2 1.6 3.3 0 2.2-1.6 3.3 0" />
        </g>
      );
    case "entreprises":
      return <path className="fill-pin-outline" d="M-6-12.5v-5.2l2.3 1.5v-1.5l2.3 1.5v-2.8l2.3 1.5v-2.3l3.1 2.3v5z" />;
    case "armes":
      return <path className="fill-pin-outline" d="M-1-26l-4.4 6.4h3.2l-1 5 5.6-7.4h-3.2z" />;
    case "crise":
      return (
        <g className="fill-pin-outline">
          <path d="M-1.2-19.5-7.8-26l1.6-1.6 6.6 6.5z" />
          <path d="M.5-21.2 2-22.7l3 3-1.6 1.6z" />
          <path d="M3.4-18.3 5-19.9l2.4 2.4-1.6 1.6z" />
          <path d="M1.2-19.5 7.8-26l-1.6-1.6-6.6 6.5z" />
          <path d="M-.5-21.2-2-22.7l-3 3 1.6 1.6z" />
          <path d="M-3.4-18.3-5-19.9l-2.4 2.4 1.6 1.6z" />
          <circle cx={4.2} cy={-20.5} r={0.65} />
          <circle cx={-4.2} cy={-20.5} r={0.65} />
        </g>
      );
    case "base-militaire":
      return (
        <g className="fill-none stroke-pin-outline" strokeWidth={1.8} strokeLinecap="round">
          <circle cx={0} cy={-19} r={5.4} />
          <path d="M0-22v6m0 0-2-2m2 2 2-2" />
        </g>
      );
    case "strategique":
      return (
        <>
          <circle cx={0} cy={-19} r={4} className="fill-pin-outline" />
          <circle cx={0} cy={-19} r={1.8} className="fill-bg" />
        </>
      );
  }
}

/** Balises : épingle colorée par type, taille constante à l'écran. */
function PingsLayer({ projection }: Pick<LayerProps, "projection">) {
  const pings = useEditorStore((s) => s.doc.pings);
  const selected = useEditorStore((s) => (s.selection?.k === "p" ? s.selection.id : null));
  const pending = useEditorStore((s) => s.pending);
  const visibility = useEditorStore(selectVisibility);
  const placed = useMemo(
    () => {
      // Points de la face cachée du globe, et balises écartées par le filtre : non rendus.
      const toScreen = pointProjector(projection);
      return pings.flatMap((p) => {
        if (!shown(visibility, "p", p.id, selected)) return [];
        const xy = toScreen(p.ll);
        return xy ? [{ id: p.id, type: p.type, title: p.title, x: xy[0], y: xy[1] }] : [];
      });
    },
    [pings, projection, visibility, selected],
  );
  return (
    <g>
      {placed.map((p) => {
        const sel = p.id === selected;
        // « En attente » (outil lien) l'emporte sur la sélection, comme la classe pend de la bêta.
        const pend = pending === `p:${p.id}`;
        return (
          <g key={p.id} transform={`translate(${p.x},${p.y})`}>
            <g data-k="p" data-id={p.id} className="cursor-pointer" style={COUNTER_SCALE}>
              <path
                d={PIN_D}
                className={pend ? "stroke-acc" : sel ? "stroke-white" : "stroke-pin-outline"}
                strokeWidth={pend ? 2.6 : sel ? 2 : 1.2}
                style={{ fill: `var(${PING_TOKENS[p.type]})` }}
              />
              <PingGlyph type={p.type} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

export default memo(PingsLayer);
