/**
 * Shared AudioContext for the whole app.
 *
 * Why a singleton:
 *   - iOS only allows AudioContext to start in response to a user gesture; once
 *     resumed, all later playback works. A single shared context lets us "warm
 *     it up" on the first tap and reuse it everywhere.
 *   - Routing playback through Web Audio (instead of bare <audio>) bypasses
 *     iOS's silent/ringer switch — required for a music app.
 *   - We can listen for `statechange` once and broadcast interruption events
 *     (incoming call, Siri) to all players.
 */

type Listener = (state: AudioContextState) => void;

let ctx: AudioContext | null = null;
const listeners = new Set<Listener>();

export function getAudioContext(): AudioContext {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new Ctor();
  ctx.addEventListener('statechange', () => {
    if (!ctx) return;
    listeners.forEach((l) => l(ctx!.state));
  });
  return ctx;
}

/** Resume the shared context. Call from a user-gesture handler on iOS. */
export async function unlockAudio(): Promise<void> {
  const c = getAudioContext();
  if (c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe to AudioContext state changes (running / suspended / interrupted). */
export function onAudioState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Play a Blob through the shared AudioContext, bypassing the silent switch.
 * Returns a controller with stop() / pause() / progress callback.
 */
export interface PlaybackController {
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  duration: () => number;
  currentTime: () => number;
  destroy: () => void;
  audioEl: HTMLAudioElement;
}

export function createPlayback(blob: Blob, opts: { loop?: boolean; volume?: number } = {}): PlaybackController {
  const c = getAudioContext();
  const url = URL.createObjectURL(blob);
  const el = new Audio(url);
  el.crossOrigin = 'anonymous';
  el.loop = opts.loop ?? false;
  el.preload = 'auto';
  // playsInline avoids fullscreen takeover on iOS
  el.setAttribute('playsinline', 'true');
  // Silent-switch bypass: route through Web Audio
  let source: MediaElementAudioSourceNode | null = null;
  const gain = c.createGain();
  gain.gain.value = opts.volume ?? 1;
  gain.connect(c.destination);

  const ensureSource = () => {
    if (!source) {
      source = c.createMediaElementSource(el);
      source.connect(gain);
    }
  };

  let destroyed = false;

  return {
    audioEl: el,
    async play() {
      if (destroyed) return;
      await unlockAudio();
      ensureSource();
      try {
        await el.play();
      } catch (e) {
        // Surface to caller; iOS sometimes throws if not on a gesture.
        throw e;
      }
    },
    pause() {
      el.pause();
    },
    stop() {
      el.pause();
      el.currentTime = 0;
    },
    seek(sec: number) {
      el.currentTime = Math.max(0, Math.min(el.duration || sec, sec));
    },
    setVolume(v: number) {
      gain.gain.value = Math.max(0, Math.min(1, v));
    },
    duration() {
      return el.duration || 0;
    },
    currentTime() {
      return el.currentTime || 0;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      try {
        source?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        gain.disconnect();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
    },
  };
}
