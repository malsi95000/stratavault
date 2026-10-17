"use client";

import { ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { compileFilter, normalizeFilter } from "@/features/filters/filter";
import { findFlux } from "@/features/map-doc/ops";
import type { MapDoc } from "@/features/map-doc/types";
import { collectEntries, entryKeyOf } from "@/features/timeline/entries";
import type { Entry } from "@/features/timeline/entries";
import { rangeLabel, viewportLabel } from "@/features/timeline/labels";
import { extentOf, groupSignature, outsideView, partitionEntries } from "@/features/timeline/layout";
import type { Group } from "@/features/timeline/layout";
import {
  FULL_VIEW,
  TIMELINE_END,
  TIMELINE_START,
  fitViewport,
  groupZoomViewport,
  panViewport,
  sameViewport,
  zoomViewport,
} from "@/features/timeline/viewport";
import type { Viewport } from "@/features/timeline/viewport";
import { useEditorStore } from "@/features/editor/store";
import FilterStatus from "../filters/FilterStatus";
import { useSettled } from "../useSettled";
import { PANEL_WIDTH, hasFiche } from "../Panel";
import EntryList from "./EntryList";
import TimelineTrack, { TRACK_ID, ZOOM_STEP } from "./TimelineTrack";

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Ouvre la fiche d'une entrée de la frise dans le panneau (fiche principale ou supplémentaire). */
function openEntry(entry: Entry) {
  const { k, id, fiche } = entry.target;
  useEditorStore.getState().open(k, id, fiche);
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="panel" size="panel" title={label} aria-label={label} onClick={onClick}>
      {children}
    </Button>
  );
}

/** Rend le focus à la bande de la frise (l'élément qui l'avait a disparu). */
const focusTrack = () => document.getElementById(TRACK_ID)?.focus();

/** Délai avant d'annoncer la période visible : une molette n'annonce que la période où elle s'arrête. */
const ANNOUNCE_DELAY_MS = 600;

/**
 * Fiches écartées de la frise, listées à part (repliées ; la liste n'est rendue qu'une fois dépliée).
 * Mémoïsée : un zoom ou un déplacement de la frise ne la recalcule pas.
 */
const Unplaced = memo(function Unplaced({
  doc,
  summary,
  entries,
  currentKey,
}: {
  doc: MapDoc;
  summary: string;
  entries: readonly Entry[];
  currentKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <details className="rounded border border-line bg-panel px-3 py-2" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-[13px] text-mute">{summary}</summary>
      {open && (
        <div className="mt-2">
          <EntryList doc={doc} entries={entries} currentKey={currentKey} onOpen={openEntry} />
        </div>
      )}
    </details>
  );
});

/**
 * Vue « Frise » (EDI-07) : toutes les fiches datées de la carte (pays, liens, balises, points, zones,
 * textes, flux et fiches supplémentaires) rangées de 1800 à 2100, à leur couleur, filtrées comme la
 * carte. Un clic ouvre la fiche ; un groupe de fiches proches affiche sa liste dessous. Les fiches sans
 * date, ou datées hors de la frise, sont listées à part.
 *
 * Tant qu'on ne l'a pas déplacée, la frise se cadre d'elle-même sur les fiches affichées.
 */
export default function TimelineView() {
  const doc = useEditorStore((s) => s.doc);
  const rawFilter = useEditorStore((s) => s.filter);
  const selection = useEditorStore((s) => s.selection);
  const panelOpen = hasFiche(selection);
  const [manual, setManual] = useState<Viewport | null>(null);
  // Groupe dont la liste est affichée, avec la vue où il a été ouvert.
  const [expanded, setExpanded] = useState<{ key: string; keys: readonly string[]; view: Viewport } | null>(null);

  const entries = useMemo(() => collectEntries(doc), [doc]);
  const filter = useMemo(() => normalizeFilter(rawFilter, doc.categories), [rawFilter, doc.categories]);
  const { dated, outside, undated } = useMemo(() => {
    const matches = compileFilter(filter);
    return partitionEntries(matches ? entries.filter(matches) : entries);
  }, [entries, filter]);
  const fitted = useMemo(() => {
    const extent = extentOf(dated);
    return extent ? fitViewport(extent.start, extent.end) : FULL_VIEW;
  }, [dated]);
  const view = manual ?? fitted;
  // La vue a changé (zoom, déplacement, Ajuster, filtre) : le regroupement aussi, la liste se ferme.
  if (expanded && !sameViewport(expanded.view, view)) setExpanded(null);
  const currentKey = entryKeyOf(selection, (id) => findFlux(doc, id)?.color ?? null);

  // Liste du groupe choisi : relue dans les fiches courantes (une fiche supprimée ou filtrée en sort).
  const expandedEntries = useMemo(() => {
    if (!expanded) return [];
    const keys = new Set(expanded.keys);
    return dated.filter((e) => keys.has(e.key));
  }, [expanded, dated]);

  const showGroup = (group: Group) =>
    setExpanded((current) =>
      current && groupSignature(current.keys.map((key) => ({ key }))) === groupSignature(group.entries)
        ? null
        : { key: group.key, keys: group.entries.map((e) => e.key), view },
    );
  // La liste disparaît avec le bouton « Fermer la liste » : le focus revient à l'étiquette du groupe,
  // ou à la bande si le groupe n'a pas d'étiquette.
  const closeGroup = () => {
    const key = expanded?.key;
    setExpanded(null);
    const label = key ? document.querySelector<HTMLElement>(`[data-entry="${CSS.escape(key)}"]`) : null;
    if (label) label.focus();
    else focusTrack();
  };
  // Zoom jusqu'à six mois, pour séparer des fiches proches ; la liste se ferme, le focus va à la bande.
  // null : déjà au zoom maximal (ou déjà cadrée sur le groupe), le bouton est désactivé.
  const groupZoom = useMemo(() => {
    const extent = extentOf(expandedEntries);
    return extent ? groupZoomViewport(view, extent.start, extent.end) : null;
  }, [expandedEntries, view]);
  const zoomOnGroup = () => {
    if (!groupZoom) return;
    focusTrack();
    setManual(groupZoom);
  };
  // Fiches filtrées toutes hors de la vue (vue déplacée, puis filtre changé) : la frise le dit.
  const away = useMemo(() => outsideView(dated, view), [dated, view]);
  const noneInView = dated.length > 0 && away.before + away.after === dated.length;

  const filtered = compileFilter(filter) !== null;
  const status =
    `${viewportLabel(view)} · ${plural(dated.length, "fiche datée", "fiches datées")}${filtered ? " (filtrées)" : ""}` +
    (noneInView ? " · aucune dans cette période" : "");
  const announced = useSettled(status, ANNOUNCE_DELAY_MS);
  const empty = filtered
    ? "Aucune fiche datée ne correspond aux filtres."
    : "Aucune fiche datée pour l’instant : renseignez la date d’une fiche (pays, lien, balise, point, zone, texte, flux ou fiche supplémentaire) pour la placer sur la frise.";

  return (
    <section
      aria-labelledby="frise-title"
      // Sous lg, le sélecteur de vue et le bandeau d'aide flottent en bas (environ 140 px) : la marge
      // basse garde les listes repliées au-dessus d'eux.
      className="absolute inset-x-0 top-12 bottom-0 z-1 flex flex-col gap-3 overflow-y-auto bg-bg px-4 pb-24 max-lg:top-[4.5rem] max-lg:pb-40"
      style={{ paddingRight: panelOpen ? `calc(${PANEL_WIDTH} + 16px)` : undefined }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
        <h2 id="frise-title" className="brut m-0 text-lg">
          Frise chronologique
        </h2>
        <span aria-hidden="true" className="text-[13px] text-mute">
          {status}
        </span>
        {/* Période visible annoncée aux lecteurs d'écran, une fois la frise immobile. */}
        <span aria-live="polite" aria-atomic="true" className="sr-only">
          {announced}
        </span>
        <div role="group" aria-label="Se déplacer dans la frise" className="ml-auto flex flex-wrap gap-1">
          <NavButton label="Plus tôt" onClick={() => setManual(panViewport(view, -0.5))}>
            <ChevronLeftIcon aria-hidden="true" />
          </NavButton>
          <NavButton label="Dézoomer" onClick={() => setManual(zoomViewport(view, 1 / ZOOM_STEP))}>
            <ZoomOutIcon aria-hidden="true" />
          </NavButton>
          <NavButton label="Zoomer" onClick={() => setManual(zoomViewport(view, ZOOM_STEP))}>
            <ZoomInIcon aria-hidden="true" />
          </NavButton>
          <NavButton label="Plus tard" onClick={() => setManual(panViewport(view, 0.5))}>
            <ChevronRightIcon aria-hidden="true" />
          </NavButton>
          <Button variant="panel" size="panel" title="Cadrer sur les fiches affichées" onClick={() => setManual(null)}>
            Ajuster
          </Button>
          <Button variant="panel" size="panel" title="Toute la frise, de 1800 à 2100" onClick={() => setManual(FULL_VIEW)}>
            {TIMELINE_START}–{TIMELINE_END - 1}
          </Button>
        </div>
      </div>
      <FilterStatus className="self-start" />
      {dated.length === 0 && (
        <p role="status" className="m-0 text-[13px] text-mute">
          {empty}
        </p>
      )}

      {noneInView && (
        <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-mute">
          Aucune fiche dans cette période{" "}
          ({[away.before > 0 && `${away.before} plus tôt`, away.after > 0 && `${away.after} plus tard`].filter(Boolean).join(", ")}).
          <Button
            variant="panel"
            size="xs"
            onClick={() => {
              // Le message disparaît avec son bouton : le focus passe à la bande.
              focusTrack();
              setManual(null);
            }}
          >
            Ajuster
          </Button>
        </p>
      )}

      <TimelineTrack
        doc={doc}
        dated={dated}
        view={view}
        onViewChange={setManual}
        currentKey={currentKey}
        expandedSignature={expandedEntries.length > 0 ? groupSignature(expandedEntries) : null}
        onOpen={openEntry}
        onShowGroup={showGroup}
      />

      {expandedEntries.length > 0 && (
        <div role="region" aria-label="Fiches du groupe" className="rounded border border-line bg-panel px-3 py-2">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-ink">
              {plural(expandedEntries.length, "fiche", "fiches")},{" "}
              {rangeLabel(expandedEntries[0].when, expandedEntries[expandedEntries.length - 1].when)}
            </span>
            <span className="ml-auto flex gap-1">
              <Button
                variant="panel"
                size="xs"
                disabled={!groupZoom}
                title={groupZoom ? undefined : "Zoom maximal atteint : ces fiches sont trop proches pour être séparées"}
                onClick={zoomOnGroup}
              >
                Zoomer sur ce groupe
              </Button>
              <Button variant="panel" size="xs" onClick={closeGroup}>
                Fermer la liste
              </Button>
            </span>
          </div>
          <EntryList doc={doc} entries={expandedEntries} currentKey={currentKey} onOpen={openEntry} />
        </div>
      )}

      <Unplaced
        doc={doc}
        summary={`${plural(undated.length, "fiche sans date (ou date illisible), absente", "fiches sans date (ou date illisible), absentes")} de la frise`}
        entries={undated}
        currentKey={currentKey}
      />
      <Unplaced
        doc={doc}
        summary={`${plural(outside.length, "fiche datée", "fiches datées")} hors de la période ${TIMELINE_START}–${TIMELINE_END - 1}`}
        entries={outside}
        currentKey={currentKey}
      />
    </section>
  );
}
