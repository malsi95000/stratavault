"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  FLUX_WIDTH_MAX,
  FLUX_WIDTH_MIN,
  PING_LABELS,
  PING_TYPES,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
} from "@/features/map-doc/types";
import type { Tool } from "@/features/editor/hints";
import { useEditorStore } from "@/features/editor/store";
import ColorSwatches, { colorName } from "./ColorSwatches";
import HelpButton from "./help/HelpButton";
import { PingTypeIcon, TOOL_ICONS } from "./ToolIcons";

/** Outils dans l'ordre de la bêta, avec leurs infobulles et libellés accessibles. */
const TOOLS: readonly { tool: Tool; title: string; label: string }[] = [
  { tool: "select", title: "Sélection (V) : ouvrir la fiche d'un pays, d'un lien, d'une zone ou d'une balise", label: "Sélection" },
  { tool: "link", title: "Tracer un lien entre deux pays (L)", label: "Tracer un lien" },
  { tool: "ping", title: "Poser une balise (P) : survolez pour choisir un type", label: "Poser une balise" },
  { tool: "flux", title: "Pinceau flux (F) : dessiner un flux libre", label: "Pinceau flux" },
  { tool: "lasso", title: "Lasso de zone (Z) : dessinez un contour fermé", label: "Lasso de zone" },
  { tool: "texte", title: "Ajouter un petit titre sur la carte (T)", label: "Ajouter un texte" },
  { tool: "gomme", title: "Gomme : supprimer un trait, une balise, une zone ou un texte (G)", label: "Gomme" },
  { tool: "point", title: "Point (O) : placer une ville ou un lieu", label: "Placer un point" },
];

/** Outils dotés d'un menu (flyout). */
type Flyout = "ping" | "flux" | "texte";

const TOOL_BTN =
  "grid size-12 cursor-pointer place-items-center rounded-[6px] border border-line bg-panel text-ink hover:border-mute " +
  "aria-pressed:border-acc aria-pressed:bg-acc aria-pressed:text-on-acc " +
  "[&_svg]:size-6 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:1.8] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-linecap:round]";
const FLY_BTN =
  "grid size-[42px] cursor-pointer place-items-center rounded-[6px] border border-line bg-panel text-ink hover:border-mute " +
  "aria-pressed:outline-2 aria-pressed:outline-acc [&_svg]:size-5";
const PANEL_FLYOUT =
  "absolute top-0 left-[62px] z-20 rounded-[6px] border border-line bg-panel p-2.5 shadow-[0_12px_30px_var(--color-flyout-shadow)]";
const FLY_LABEL = "mt-[3px] mb-2 block text-xs text-mute";

function ToolButton({
  tool,
  current,
  expanded,
  onClick,
}: {
  tool: Tool;
  current: Tool;
  expanded?: boolean;
  onClick: () => void;
}) {
  const def = TOOLS.find((t) => t.tool === tool);
  if (!def) return null;
  return (
    <button
      type="button"
      className={TOOL_BTN}
      aria-pressed={current === tool}
      aria-expanded={expanded}
      title={def.title}
      aria-label={def.label}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {TOOL_ICONS[tool]}
      </svg>
    </button>
  );
}

/**
 * « ? » d'un outil (EDI-10) : en haut à droite de son bouton, il affiche son tutoriel. Placé juste
 * après le bouton de l'outil, avant son menu, dans l'ordre de tabulation.
 */
function ToolHelp({ tool }: { tool: Tool }) {
  return <HelpButton topic={tool} className="absolute -top-2 -right-2.5 z-1" />;
}

/** Outil sans menu : son bouton et son « ? ». */
function Slot({ tool, current, onClick }: { tool: Tool; current: Tool; onClick: () => void }) {
  return (
    <div className="relative">
      <ToolButton tool={tool} current={current} onClick={onClick} />
      <ToolHelp tool={tool} />
    </div>
  );
}

/** Outil doté d'un menu : bouton, « ? » et menu, dans un groupe (le menu des balises s'affiche au survol). */
function Wrap({ wrapRef, children }: { wrapRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  return (
    <div ref={wrapRef} className="group relative">
      {children}
    </div>
  );
}

/** Barre d'outils à gauche de la carte, avec les menus des balises, du flux et du texte. */
export default function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const toolPicks = useEditorStore((s) => s.toolPicks);
  const pingType = useEditorStore((s) => s.pingType);
  const fluxColor = useEditorStore((s) => s.fluxColor);
  const fluxWidth = useEditorStore((s) => s.fluxWidth);
  const textSize = useEditorStore((s) => s.textSize);
  const setTool = useEditorStore((s) => s.setTool);
  const choosePingType = useEditorStore((s) => s.choosePingType);
  const chooseFluxColor = useEditorStore((s) => s.chooseFluxColor);
  const setFluxWidth = useEditorStore((s) => s.setFluxWidth);
  const setTextSize = useEditorStore((s) => s.setTextSize);

  const [open, setOpen] = useState<Flyout | null>(null);
  const pingWrap = useRef<HTMLDivElement>(null);
  const fluxWrap = useRef<HTMLDivElement>(null);
  const texteWrap = useRef<HTMLDivElement>(null);
  const fluxWidthId = useId();
  const textSizeId = useId();

  // Choix d'un outil (clic ou raccourci, même déjà actif) : le pinceau ouvre son menu, les autres menus
  // se ferment quand on quitte leur outil (bêta, setTool).
  const [prevPick, setPrevPick] = useState(toolPicks);
  if (toolPicks !== prevPick) {
    setPrevPick(toolPicks);
    setOpen((o) => (tool === "flux" ? "flux" : o === tool ? o : null));
  }

  // Un clic en dehors du menu ouvert le ferme ; Échap aussi.
  useEffect(() => {
    const refs: Record<Flyout, RefObject<HTMLDivElement | null>> = { ping: pingWrap, flux: fluxWrap, texte: texteWrap };
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      setOpen((o) => (o && !refs[o].current?.contains(target) ? null : o));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pingWrap, fluxWrap, texteWrap]);

  const toggle = (f: Flyout) => setOpen((o) => (o === f ? null : f));

  // Mobile (≤ 640 px), règles de la bêta : barre d'outils plus haute, menu des balises sous le bouton.

  return (
    <div
      role="toolbar"
      aria-label="Outils"
      aria-orientation="vertical"
      className="absolute top-16 left-3 z-3 flex flex-col gap-2 [@media(max-width:640px)]:top-14"
    >
      <Slot tool="select" current={tool} onClick={() => setTool("select")} />
      <Slot tool="link" current={tool} onClick={() => setTool("link")} />

      <Wrap wrapRef={pingWrap}>
        <ToolButton
          tool="ping"
          current={tool}
          expanded={open === "ping"}
          onClick={() => {
            setTool("ping");
            toggle("ping");
          }}
        />
        <ToolHelp tool="ping" />
        <div
          role="group"
          aria-label="Type de balise"
          className={`absolute top-0 left-[62px] flex gap-1.5 transition-[opacity,translate] duration-150 motion-reduce:transition-none [@media(max-width:640px)]:top-14 [@media(max-width:640px)]:left-0 ${
            open === "ping"
              ? "pointer-events-auto translate-x-0 opacity-100"
              : "pointer-events-none -translate-x-2 opacity-0 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100"
          }`}
        >
          {PING_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={FLY_BTN}
              aria-pressed={pingType === type}
              title={PING_LABELS[type]}
              aria-label={PING_LABELS[type]}
              onClick={() => {
                choosePingType(type);
                setOpen("ping");
              }}
            >
              <PingTypeIcon type={type} />
            </button>
          ))}
        </div>
      </Wrap>

      <Wrap wrapRef={fluxWrap}>
        <ToolButton
          tool="flux"
          current={tool}
          expanded={open === "flux"}
          onClick={() => {
            setTool("flux");
            setOpen("flux");
          }}
        />
        <ToolHelp tool="flux" />
        <div role="group" aria-label="Réglages du flux" hidden={open !== "flux"} className={`${PANEL_FLYOUT} w-[236px]`}>
          <span className={FLY_LABEL}>
            Couleur du flux : <span className="text-ink">{colorName(fluxColor)}</span>
          </span>
          <ColorSwatches label="Couleur du flux" value={fluxColor} onChange={chooseFluxColor} className="mb-[11px]" />
          <label htmlFor={fluxWidthId} className={FLY_LABEL}>
            Épaisseur : <output htmlFor={fluxWidthId}>{fluxWidth}</output>
          </label>
          <input
            id={fluxWidthId}
            type="range"
            className="block w-full accent-acc"
            min={FLUX_WIDTH_MIN}
            max={FLUX_WIDTH_MAX}
            value={fluxWidth}
            onChange={(e) => setFluxWidth(Number(e.target.value))}
          />
        </div>
      </Wrap>

      <Slot tool="lasso" current={tool} onClick={() => setTool("lasso")} />

      <Wrap wrapRef={texteWrap}>
        <ToolButton
          tool="texte"
          current={tool}
          expanded={open === "texte"}
          onClick={() => {
            setTool("texte");
            toggle("texte");
          }}
        />
        <ToolHelp tool="texte" />
        <div role="group" aria-label="Réglages du texte" hidden={open !== "texte"} className={`${PANEL_FLYOUT} min-w-[190px]`}>
          <label htmlFor={textSizeId} className={FLY_LABEL}>
            Taille du texte : <output htmlFor={textSizeId}>{textSize}</output>
          </label>
          <input
            id={textSizeId}
            type="range"
            className="block w-full accent-acc"
            min={TEXT_SIZE_MIN}
            max={TEXT_SIZE_MAX}
            value={textSize}
            onChange={(e) => {
              setTextSize(Number(e.target.value));
              if (useEditorStore.getState().tool !== "texte") setTool("texte");
            }}
          />
        </div>
      </Wrap>

      <Slot tool="gomme" current={tool} onClick={() => setTool("gomme")} />
      <Slot tool="point" current={tool} onClick={() => setTool("point")} />
    </div>
  );
}
