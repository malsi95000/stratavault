"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import ColorSwatches, { colorName } from "@/features/editor/components/ColorSwatches";
import type { MapDoc } from "@/features/map-doc/types";
import { COVER_MODES, coverOf } from "../../cover/coverDraft";
import type { CoverDraft, CoverMode } from "../../cover/coverDraft";
import {
  COVER_HINT,
  COVER_LEGEND,
  PREVIEW_FAILED,
  PREVIEW_LOADING,
  PREVIEW_NOTE,
  PREVIEW_REFRESH,
  PREVIEW_UNREADABLE,
} from "../../cover/texts";
import CoverImage from "./CoverImage";
import IconGrid from "./IconGrid";

type PreviewState = "idle" | "loading" | "failed" | "unreadable";

const LABEL = "mb-1.5 block text-[13px] text-mute";

/**
 * Choix du logo d'une carte (DIV-01) : aucun, une icône et sa couleur, ou l'aperçu de la carte,
 * calculé dans le navigateur à partir de `loadDoc` (au premier choix de l'aperçu, ou sur demande).
 */
export default function CoverPicker({
  value,
  onChange,
  loadDoc,
}: {
  value: CoverDraft;
  onChange: Dispatch<SetStateAction<CoverDraft>>;
  /** Contenu de la carte, pour l'aperçu ; null si elle est illisible. */
  loadDoc: () => Promise<MapDoc | null>;
}) {
  const name = useId();
  const [preview, setPreview] = useState<PreviewState>("idle");
  const running = useRef<AbortController | null>(null);

  // Dialogue fermé pendant le calcul : il est abandonné.
  useEffect(() => () => running.current?.abort(), []);

  async function makePreview() {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setPreview("loading");
    try {
      const doc = await loadDoc();
      // Chargé à la demande : le fond de carte et la projection ne pèsent sur la page qu'au premier aperçu.
      const { generatePreview } = await import("../../cover/generatePreview");
      const cover = doc ? await generatePreview(doc, controller.signal) : null;
      if (controller.signal.aborted) return;
      if (!cover) return setPreview("unreadable");
      onChange((d) => ({ ...d, preview: cover }));
      setPreview("idle");
    } catch {
      if (!controller.signal.aborted) setPreview("failed");
    }
  }

  function chooseMode(mode: CoverMode) {
    onChange((d) => ({ ...d, mode }));
    if (mode === "preview" && !value.preview && preview !== "loading") void makePreview();
  }

  const message =
    preview === "loading" ? PREVIEW_LOADING : preview === "failed" ? PREVIEW_FAILED : preview === "unreadable" ? PREVIEW_UNREADABLE : null;

  return (
    <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
      <legend className="mb-1 p-0 text-[15px] text-ink">{COVER_LEGEND}</legend>
      <div className="flex items-center gap-3">
        <CoverImage cover={coverOf(value)} className="w-[108px]" />
        <p className="m-0 text-[13px] text-mute">{COVER_HINT}</p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {COVER_MODES.map(({ mode, label }) => (
          <label key={mode} className="flex cursor-pointer items-center gap-1.5 text-[14px]">
            <input
              type="radio"
              name={name}
              value={mode}
              checked={value.mode === mode}
              onChange={() => chooseMode(mode)}
              className="size-4 accent-acc"
            />
            {label}
          </label>
        ))}
      </div>

      {value.mode === "icon" && (
        <div className="grid gap-3">
          <IconGrid value={value.icon} onChange={(icon) => onChange((d) => ({ ...d, icon }))} />
          <div>
            <span className={LABEL}>
              Couleur : <span className="text-ink">{colorName(value.color)}</span>
            </span>
            <ColorSwatches label="Couleur du logo" value={value.color} onChange={(color) => onChange((d) => ({ ...d, color }))} />
          </div>
        </div>
      )}

      {value.mode === "preview" && (
        <div className="grid gap-2">
          <p role="status" className="m-0 min-h-[1.25rem] text-[13px] text-mute">
            {message ?? PREVIEW_NOTE}
          </p>
          <Button
            type="button"
            variant="panel"
            size="panel"
            className="justify-self-start"
            disabled={preview === "loading"}
            onClick={() => void makePreview()}
          >
            {PREVIEW_REFRESH}
          </Button>
        </div>
      )}
    </fieldset>
  );
}
