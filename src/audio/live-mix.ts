import { createPlayback, type PlaybackController } from './context';

export interface LiveMixSource {
  blob: Blob;
  volume?: number; // 0..1
  loop?: boolean;
}

export interface LiveMix {
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (sec: number) => void;
  setVolume: (idx: number, v: number) => void;
  duration: () => number;
  currentTime: () => number;
  destroy: () => void;
  /** Call back when any source ends (use the longest source's `ended`). */
  onEnded?: () => void;
}

/**
 * Play multiple Blobs at once through the shared AudioContext, mixed.
 *
 * The first source is treated as the "master" — its currentTime / duration
 * drive the playhead. All sources start synchronously when `play()` is called.
 *
 * Uses createPlayback per source so each gets its own gain. We pause/resume
 * them together; tiny drift (a few ms) is acceptable for monitoring.
 */
export function createLiveMix(sources: LiveMixSource[]): LiveMix {
  const players: PlaybackController[] = sources.map((s) =>
    createPlayback(s.blob, { volume: s.volume ?? 1, loop: s.loop ?? false }),
  );
  let endedCb: (() => void) | undefined;

  if (players[0]) {
    players[0].audioEl.addEventListener('ended', () => {
      players.forEach((p) => p.pause());
      endedCb?.();
    });
  }

  const mix: LiveMix = {
    async play() {
      // Start all players in the same task; iOS prefers a single user-gesture
      // promise chain.
      await Promise.all(players.map((p) => p.play()));
    },
    pause() {
      players.forEach((p) => p.pause());
    },
    stop() {
      players.forEach((p) => p.stop());
    },
    seek(sec: number) {
      players.forEach((p) => p.seek(sec));
    },
    setVolume(idx: number, v: number) {
      players[idx]?.setVolume(v);
    },
    duration() {
      return players[0]?.duration() ?? 0;
    },
    currentTime() {
      return players[0]?.currentTime() ?? 0;
    },
    destroy() {
      players.forEach((p) => p.destroy());
    },
    set onEnded(cb: (() => void) | undefined) {
      endedCb = cb;
    },
    get onEnded(): (() => void) | undefined {
      return endedCb;
    },
  };

  return mix;
}
