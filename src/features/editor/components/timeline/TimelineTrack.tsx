"use client";

import { Fragment, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { MapDoc } from "@/features/map-doc/types";
import {
  AXIS_GAP,
  LABEL_WIDTH,
  LANE_HEIGHT,
  TICKS_HEIGHT,
  assignLanes,
  groupEntries,
  groupSignature,
  laneCount,
} from "@/features/timeline/layout";
import type { DatedEntry, Group } from "@/features/timeline/layout";
import { labelsByKey } from "@/features/timeline/labels";
import { timelineTicks } from "@/features/timeline/ticks";
import { panViewport, toX, zoomViewport } from "@/features/timeline/viewport";
import type { Viewport } from "@/features/timeline/viewport";
import { cn } from "@/lib/utils";
import { entryColor } from "./entryColor";
import TimelineCard from "./TimelineCard";
import { useElementSize } from "./useElementSize";
import { useTimelineGestures } from "./useTimelineGestures";

/** Pas des flèches du clavier (part de l'étendue visible) et facteur des touches + et −. */
const KEY_PAN = 0.2;
export const ZOOM_STEP = 1.6;
/** Identifiant de la bande : le focus y revient quand l'élément qui l'avait disparaît. */
export const TRACK_ID = "frise-bande";

/** Touche du clavier → nouvelle vue (null : touche sans effet sur la frise). */
export function keyToViewport(key: string, view: Viewport): Viewport | null {
  if (key === "ArrowLeft") return panViewport(view, -KEY_PAN);
  if (key === "ArrowRight") return panViewport(view, KEY_PAN);
  if (key === "+" || key === "=") return zoomViewport(view, ZOOM_STEP);
  if (key === "-" || key === "_") return zoomViewport(view, 1 / ZOOM_STEP);
  return null;
}

/** Touche reçue par la bande ou l'une de ses étiquettes (l'événement remonte). */
type TrackKeyEvent = Pick<KeyboardEvent<HTMLElement>, "key" | "ctrlKey" | "metaKey" | "altKey" | "preventDefault"> & {
  target: unknown;
  currentTarget: { focus: () => void };
};

/**
 * Flèches et + / − sur la bande. Touche reçue par une étiquette : après le déplacement ou le zoom, elle
 * peut sortir de la vue ou fusionner avec un groupe voisin (et disparaître) ; le focus passe d'abord à
 * la bande, qui garde la main pour les touches suivantes.
 */
export function handleTrackKey(e: TrackKeyEvent, view: Viewport, onViewChange: (view: Viewport) => void) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const next = keyToViewport(e.key, view);
  if (!next) return;
  e.preventDefault();
  if (e.target !== e.currentTarget) e.currentTarget.focus();
  onViewChange(next);
}

/** Fiches d'un groupe ouvertes dans le panneau. */
const isCurrent = (group: Group, currentKey: string | null) =>
  currentKey !== null && group.entries.some((e) => e.key === currentKey);

/**
 * Bande de la frise : graduations, axe, un repère par groupe de fiches et leurs étiquettes rangées en
 * lignes. Molette ou + / − : zoom ; glisser ou flèches : déplacement dans le temps.
 */
export default function TimelineTrack({
  doc,
  dated,
  view,
  onViewChange,
  currentKey,
  expandedSignature,
  onOpen,
  onShowGroup,
}: {
  doc: MapDoc;
  /** Fiches datées de 1800 à 2100, triées, après filtrage. */
  dated: readonly DatedEntry[];
  view: Viewport;
  onViewChange: (view: Viewport) => void;
  /** Clé de la fiche ouverte dans le panneau. */
  currentKey: string | null;
  /** Signature (groupSignature) du groupe dont la liste est affichée. */
  expandedSignature: string | null;
  onOpen: (entry: DatedEntry) => void;
  onShowGroup: (group: Group) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(trackRef);
  const gestures = useTimelineGestures(trackRef, view, onViewChange);

  const axisY = height - TICKS_HEIGHT;
  const lanes = laneCount(height);
  const groups = useMemo(
    () => assignLanes(groupEntries(dated, view, width), width, LABEL_WIDTH, lanes),
    [dated, view, width, lanes],
  );
  const ticks = useMemo(() => timelineTicks(view, width), [view, width]);
  // Textes des fiches, calculés une fois par carte et par filtre, pas à chaque image d'un zoom.
  const labels = useMemo(() => labelsByKey(doc, dated), [doc, dated]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => handleTrackKey(e, view, onViewChange);

  return (
    <div
      ref={trackRef}
      id={TRACK_ID}
      role="group"
      tabIndex={0}
      aria-label="Frise chronologique : flèches gauche et droite pour se déplacer, + et − pour zoomer"
      className="relative min-h-[220px] flex-1 cursor-grab touch-pan-y overflow-hidden rounded border border-line bg-map-ocean select-none focus-visible:outline-2 focus-visible:outline-acc active:cursor-grabbing"
      onKeyDown={onKeyDown}
      onPointerDown={gestures.onPointerDown}
      onPointerMove={gestures.onPointerMove}
      onPointerUp={gestures.onPointerUp}
      onPointerCancel={gestures.onPointerCancel}
      onClickCapture={gestures.onClickCapture}
    >
      {width > 0 && (
        <>
          {ticks.map((t) => (
            <div
              key={t.value}
              aria-hidden="true"
              className={cn("absolute top-0 border-l", t.major ? "border-map-edge" : "border-map-graticule")}
              style={{ left: toX(view, t.value, width), height: axisY + 6 }}
            >
              <span
                className={cn("absolute top-full mt-1 -translate-x-1/2 text-[11px] whitespace-nowrap", t.major ? "text-ink" : "text-mute")}
              >
                {t.label}
              </span>
            </div>
          ))}
          <div aria-hidden="true" className="absolute inset-x-0 h-0.5 bg-mute" style={{ top: axisY - 1 }} />
          {groups.map((g) => {
            const top = g.lane === null ? null : axisY - AXIS_GAP - (g.lane + 1) * LANE_HEIGHT + 6;
            const single = g.entries.length === 1;
            const open = () => (single ? onOpen(g.entries[0]) : onShowGroup(g));
            const one = single ? labels.get(g.entries[0].key) : undefined;
            const description = one ? one.description : `${g.entries.length} fiches`;
            return (
              <Fragment key={g.key}>
                {top !== null && (
                  <div
                    aria-hidden="true"
                    className="absolute w-px bg-line"
                    style={{ left: g.x, top: top + LANE_HEIGHT - 6, height: axisY - (top + LANE_HEIGHT - 6) }}
                  />
                )}
                {/* Repère sur l'axe : cliquable ; il ne prend le focus que si l'étiquette n'a pas pu être affichée. */}
                <button
                  type="button"
                  tabIndex={top === null ? 0 : -1}
                  aria-hidden={top === null ? undefined : true}
                  aria-label={top === null ? (single ? description : `${description} : afficher la liste`) : undefined}
                  title={description}
                  className={cn(
                    "absolute -translate-1/2 cursor-pointer rounded-full border-2 focus-visible:outline-2 focus-visible:outline-acc",
                    // Groupe : le nombre, sur le fond d'accent (contraste assuré quelle que soit la couleur
                    // des fiches) ; la couleur de la première fiche colore le tour.
                    single ? "size-3.5 border-bg" : "grid size-5 place-items-center bg-acc text-[10px] font-bold text-on-acc",
                    isCurrent(g, currentKey) && "ring-2 ring-ink",
                  )}
                  style={
                    single
                      ? { left: g.x, top: axisY, background: entryColor(g.entries[0]) }
                      : { left: g.x, top: axisY, borderColor: entryColor(g.entries[0]) }
                  }
                  onClick={open}
                >
                  {single ? null : g.entries.length > 99 ? "99+" : g.entries.length}
                </button>
                {top !== null && (
                  <TimelineCard
                    labels={one}
                    group={g}
                    style={{ left: g.left, top, width: LABEL_WIDTH, height: LANE_HEIGHT - 6 }}
                    current={isCurrent(g, currentKey)}
                    expanded={expandedSignature !== null && groupSignature(g.entries) === expandedSignature}
                    onActivate={open}
                  />
                )}
              </Fragment>
            );
          })}
        </>
      )}
    </div>
  );
}
