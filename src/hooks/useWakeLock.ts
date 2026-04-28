import { useEffect, useRef } from 'react';

interface WakeLockSentinel {
  release: () => Promise<void>;
  released: boolean;
  addEventListener: (type: 'release', listener: () => void) => void;
}

interface NavigatorWithWakeLock {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
}

/**
 * Acquire the screen wake lock while `active` is true. Re-acquires on
 * visibilitychange (iOS / Android both release the lock on background, then
 * the user comes back and we want it again). Failures are silently ignored —
 * not all browsers support this, but where they do it prevents the screen
 * from sleeping mid-recording, which on iOS would kill MediaRecorder.
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const navWithWL = navigator as Navigator & NavigatorWithWakeLock;
    const api = navWithWL.wakeLock;
    if (!api) return;

    let cancelled = false;

    const acquire = async () => {
      if (!active) return;
      try {
        const lock = await api.request('screen');
        if (cancelled) {
          await lock.release();
          return;
        }
        sentinelRef.current = lock;
        lock.addEventListener('release', () => {
          if (sentinelRef.current === lock) sentinelRef.current = null;
        });
      } catch {
        /* silent */
      }
    };

    const release = async () => {
      const lock = sentinelRef.current;
      sentinelRef.current = null;
      if (lock && !lock.released) {
        try {
          await lock.release();
        } catch {
          /* ignore */
        }
      }
    };

    if (active) acquire();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && active && !sentinelRef.current) {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      release();
    };
  }, [active]);
}
