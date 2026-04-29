import { createPlayback, type PlaybackController } from './context';

export interface LiveMixSource {
  blob: Blob;
  volume?: number; // 0..1
  loop?: boolean;
  /** Delay in seconds before this source starts playing (used for take offsets). */
  offsetSec?: number;
}

export interface LiveMix {
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (sec: number) => void;
  setVolume: (idx: number, v: number) => void;
  setMuted: (idx: number, muted: boolean) => void;
  setOffset: (idx: number, sec: number) => void;
  duration: () => number;
  currentTime: () => number;
  destroy: () => void;
  onEnded?: () => void;
  onProgress?: (sec: number) => void;
}

/**
 * Play multiple Blobs at once through the shared AudioContext, mixed.
 *
 * The first source (index 0) is treated as the "master" — its duration
 * determines the overall timeline length (unless a take extends beyond it).
 *
 * Sources with `offsetSec` will start playback delayed by that amount.
 * Seeking accounts for offsets: if you seek to 5s and a take has offset 3s,
 * that take seeks to its local 2s mark.
 */
export function createLiveMix(sources: LiveMixSource[]): LiveMix {
  const offsets: number[] = sources.map((s) => s.offsetSec ?? 0);
  const players: PlaybackController[] = sources.map((s) =>
    createPlayback(s.blob, { volume: s.volume ?? 1, loop: s.loop ?? false }),
  );
  const muted: boolean[] = sources.map(() => false);
  const savedVolumes: number[] = sources.map((s) => s.volume ?? 1);

  let endedCb: (() => void) | undefined;
  let progressCb: ((sec: number) => void) | undefined;
  let progressInterval: number | null = null;
  let playing = false;

  // Compute total duration = max of (offset + source duration) across all sources.
  // We can only know source durations after they load, so we also fall back to
  // the master (idx 0) duration.
  const totalDuration = (): number => {
    let max = 0;
    for (let i = 0; i < players.length; i++) {
      const d = players[i].duration();
      if (d > 0) max = Math.max(max, offsets[i] + d);
    }
    return max || players[0]?.duration() || 0;
  };

  const masterTime = (): number => {
    // Use the first player's currentTime + its offset as the global clock.
    const p0 = players[0];
    if (!p0) return 0;
    return offsets[0] + p0.currentTime();
  };

  const startProgressTracking = () => {
    stopProgressTracking();
    progressInterval = window.setInterval(() => {
      progressCb?.(masterTime());
      // Check if we've reached the end
      const t = masterTime();
      const d = totalDuration();
      if (d > 0 && t >= d - 0.05) {
        pauseAll();
        playing = false;
        stopProgressTracking();
        endedCb?.();
      }
    }, 50);
  };

  const stopProgressTracking = () => {
    if (progressInterval !== null) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  };

  const pendingTimers: number[] = [];

  const clearPendingTimers = () => {
    for (const t of pendingTimers) clearTimeout(t);
    pendingTimers.length = 0;
  };

  const playAll = async () => {
    clearPendingTimers();
    const globalTime = masterTime();
    const immediate: Promise<void>[] = [];
    for (let i = 0; i < players.length; i++) {
      if (muted[i]) continue;
      const localTime = globalTime - offsets[i];
      if (localTime < 0) {
        // Schedule this source to start after its offset delay — fire and forget
        const delay = -localTime;
        const p = players[i];
        p.seek(0);
        const timer = window.setTimeout(() => {
          if (playing && !muted[i]) p.play().catch(() => {});
        }, delay * 1000);
        pendingTimers.push(timer);
      } else {
        const d = players[i].duration();
        if (d > 0 && localTime >= d) continue; // already finished
        players[i].seek(localTime);
        immediate.push(players[i].play());
      }
    }
    // Only await sources that play immediately (beat etc.) — don't block on delayed takes
    await Promise.all(immediate);
  };

  const pauseAll = () => {
    players.forEach((p) => p.pause());
  };

  const mix: LiveMix = {
    async play() {
      playing = true;
      await playAll();
      startProgressTracking();
    },
    pause() {
      playing = false;
      pauseAll();
      stopProgressTracking();
      clearPendingTimers();
    },
    stop() {
      playing = false;
      pauseAll();
      stopProgressTracking();
      clearPendingTimers();
      // Seek all back to their start
      players.forEach((p) => p.stop());
    },
    seek(sec: number) {
      for (let i = 0; i < players.length; i++) {
        const localTime = sec - offsets[i];
        if (localTime < 0) {
          players[i].seek(0);
          players[i].pause();
        } else {
          players[i].seek(localTime);
        }
      }
      if (playing) {
        // Resume from new position
        void playAll();
      }
    },
    setVolume(idx: number, v: number) {
      savedVolumes[idx] = v;
      if (!muted[idx]) players[idx]?.setVolume(v);
    },
    setMuted(idx: number, m: boolean) {
      muted[idx] = m;
      if (m) {
        players[idx]?.setVolume(0);
        players[idx]?.pause();
      } else {
        players[idx]?.setVolume(savedVolumes[idx]);
        if (playing) {
          const localTime = masterTime() - offsets[idx];
          if (localTime >= 0) {
            players[idx]?.seek(localTime);
            players[idx]?.play().catch(() => {});
          }
        }
      }
    },
    setOffset(idx: number, sec: number) {
      offsets[idx] = sec;
      if (playing && !muted[idx]) {
        const localTime = masterTime() - sec;
        if (localTime < 0) {
          players[idx]?.pause();
          players[idx]?.seek(0);
        } else {
          const d = players[idx]?.duration() ?? 0;
          if (d > 0 && localTime < d) {
            players[idx]?.seek(localTime);
          }
        }
      }
    },
    duration() {
      return totalDuration();
    },
    currentTime() {
      return masterTime();
    },
    destroy() {
      playing = false;
      stopProgressTracking();
      clearPendingTimers();
      players.forEach((p) => p.destroy());
    },
    set onEnded(cb: (() => void) | undefined) {
      endedCb = cb;
    },
    get onEnded(): (() => void) | undefined {
      return endedCb;
    },
    set onProgress(cb: ((sec: number) => void) | undefined) {
      progressCb = cb;
    },
    get onProgress(): ((sec: number) => void) | undefined {
      return progressCb;
    },
  };

  return mix;
}
