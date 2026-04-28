import { getAudioContext } from './context';

/**
 * Schedule a single click at a precise audio time. Uses the shared AudioContext
 * so it bypasses iOS silent-switch and stays in sync with playback.
 *
 *   accent: stronger click for the downbeat (1)
 *   gain:   0..1 master gain for the click
 */
export function tickAt(when: number, opts: { accent?: boolean; gain?: number } = {}): void {
  const ctx = getAudioContext();
  if (ctx.state !== 'running') return; // metronome only sounds when context is unlocked
  const t = Math.max(when, ctx.currentTime);
  const accent = opts.accent ?? false;
  const peak = (opts.gain ?? 0.5) * (accent ? 1 : 0.7);

  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(accent ? 1500 : 950, t);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(env).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.08);
}

/** Schedule a 4-beat count-in starting "now" at the given BPM. Returns total duration in ms. */
export function scheduleCountIn(bpm: number, beats = 4, gain = 0.6): number {
  const ctx = getAudioContext();
  if (ctx.state !== 'running') return (60 / bpm) * beats * 1000;
  const beatSec = 60 / bpm;
  const now = ctx.currentTime + 0.05;
  for (let i = 0; i < beats; i++) {
    tickAt(now + i * beatSec, { accent: i === 0, gain });
  }
  return beats * beatSec * 1000;
}

/** Run a continuous metronome until the returned `stop` is called. */
export function startMetronome(bpm: number, gain = 0.4): () => void {
  const ctx = getAudioContext();
  let stopped = false;
  const beatSec = 60 / bpm;
  let nextBeatAt = ctx.currentTime + 0.05;
  let beatIdx = 0;
  const lookaheadMs = 100;
  const scheduleAhead = 0.2; // seconds

  const interval = window.setInterval(() => {
    if (stopped) return;
    while (nextBeatAt < ctx.currentTime + scheduleAhead) {
      tickAt(nextBeatAt, { accent: beatIdx % 4 === 0, gain });
      nextBeatAt += beatSec;
      beatIdx++;
    }
  }, lookaheadMs);

  return () => {
    stopped = true;
    window.clearInterval(interval);
  };
}
