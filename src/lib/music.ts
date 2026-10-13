// Thème musical de l'accueil, synthétisé en direct (Web Audio API).
// Chaque note : [début en s, durée en s, numéro MIDI].
type Note = [time: number, duration: number, midi: number];

const MELODY: Note[] = [
  [0.69, 0.172, 50], [0.69, 0.172, 57], [1.034, 0.172, 50], [1.034, 0.172, 57],
  [1.379, 0.172, 50], [1.379, 0.172, 57], [1.724, 0.172, 52], [1.724, 0.172, 48],
  [1.724, 0.172, 57], [1.897, 0.172, 53], [1.897, 0.172, 52], [2.069, 0.172, 50],
  [2.069, 0.172, 57], [2.414, 0.172, 50], [2.414, 0.172, 57], [2.759, 0.172, 50],
  [2.759, 0.172, 57], [3.103, 0.172, 52], [3.103, 0.172, 57], [3.276, 0.172, 53],
  [3.276, 0.172, 52], [3.448, 0.172, 50], [3.448, 0.172, 57], [3.793, 0.172, 50],
  [3.793, 0.172, 57], [4.138, 0.172, 50], [4.138, 0.172, 57], [4.483, 0.172, 50],
  [4.655, 0.172, 48], [4.828, 0.172, 50], [4.828, 0.172, 57],
];

// 36 : grosse caisse, 38 : caisse claire.
const DRUMS: Note[] = [
  [0.69, 0.172, 36], [0.862, 0.172, 36], [1.034, 0.172, 36], [1.207, 0.172, 36],
  [1.379, 0.172, 38], [2.069, 0.172, 36], [2.241, 0.172, 36], [2.414, 0.172, 36],
  [2.586, 0.172, 36], [2.759, 0.172, 38], [3.448, 0.172, 36], [3.621, 0.172, 36],
  [3.793, 0.172, 36], [3.966, 0.172, 36], [4.138, 0.172, 38],
];

const LOOP = 5.517;

function tone(ctx: AudioContext, out: AudioNode, t0: number, dur: number, midi: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  osc.connect(gain).connect(out);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.16, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.22);
  osc.start(t0);
  osc.stop(t0 + dur + 0.25);
}

function drum(ctx: AudioContext, out: AudioNode, t0: number, midi: number) {
  const gain = ctx.createGain();
  gain.connect(out);
  if (midi === 36) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.connect(gain);
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.13);
    gain.gain.setValueAtTime(0.5, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    osc.start(t0);
    osc.stop(t0 + 0.17);
  } else {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1200;
    noise.connect(filter).connect(gain);
    gain.gain.setValueAtTime(0.35, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    noise.start(t0);
  }
}

export type MusicPlayer = {
  /** Renvoie false si le navigateur ne gère pas la Web Audio API. */
  start(): boolean;
  stop(): void;
  close(): void;
};

export function createMusicPlayer(): MusicPlayer {
  let ctx: AudioContext | null = null;
  // Toutes les notes passent par `out` : le déconnecter coupe le son immédiatement.
  let out: GainNode | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(t0: number) {
    if (!ctx || !out) return;
    for (const [t, d, n] of MELODY) tone(ctx, out, t0 + t, d, n);
    for (const [t, , n] of DRUMS) drum(ctx, out, t0 + t, n);
    timer = setTimeout(() => {
      if (ctx) schedule(ctx.currentTime + 0.05);
    }, (LOOP - 0.05) * 1000);
  }

  function stop() {
    clearTimeout(timer);
    out?.disconnect();
    out = null;
  }

  return {
    start() {
      if (out) return true;
      if (typeof AudioContext === "undefined") return false;
      ctx ??= new AudioContext();
      void ctx.resume();
      out = ctx.createGain();
      out.connect(ctx.destination);
      schedule(ctx.currentTime + 0.1);
      return true;
    },
    stop,
    close() {
      stop();
      void ctx?.close();
      ctx = null;
    },
  };
}
