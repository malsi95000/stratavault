"use client";

import { useEffect, useRef, useState } from "react";
import { createMusicPlayer, type MusicPlayer } from "@/lib/music";

const BAR_DELAYS = ["0s", ".2s", ".4s"];

export default function MusicButton() {
  const player = useRef<MusicPlayer | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const p = createMusicPlayer();
    player.current = p;
    return () => p.close();
  }, []);

  function toggle() {
    const p = player.current;
    if (!p) return;
    if (playing) {
      p.stop();
      setPlaying(false);
    } else {
      setPlaying(p.start());
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={playing}
      aria-label="Musique"
      className="fixed top-3.5 right-3.5 z-5 flex cursor-pointer items-center gap-[7px] rounded-[20px] border border-line bg-panel py-[7px] pr-3.5 pl-2.5 text-mute aria-pressed:border-mute aria-pressed:text-ink"
    >
      <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
        <path d="M9 18V5l11-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="17" cy="16" r="3" />
      </svg>
      <span className="flex size-3 items-end gap-[2px]" aria-hidden="true">
        {BAR_DELAYS.map((delay) => (
          <i
            key={delay}
            className={`block w-[2px] bg-current ${playing ? "animate-eq" : "h-[3px]"}`}
            style={{ animationDelay: delay }}
          />
        ))}
      </span>
    </button>
  );
}
