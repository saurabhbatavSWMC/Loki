import { useCallback, useEffect, useState } from 'react';
import type { Beat, SessionWithBeat } from '../types';
import * as q from '../db/queries';
import { seedIfEmpty } from '../db/seed';
import { hasOnboarded } from '../lib/onboarding';

export interface UseDatabaseResult {
  ready: boolean;
  needsOnboarding: boolean;
  beats: Beat[];
  sessions: SessionWithBeat[];
  refresh: () => Promise<void>;
  markOnboardingDone: () => void;
}

export function useDatabase(): UseDatabaseResult {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [sessions, setSessions] = useState<SessionWithBeat[]>([]);

  const refresh = useCallback(async () => {
    const [b, s] = await Promise.all([q.getBeats(), q.getSessions()]);
    setBeats(b);
    setSessions(s);
  }, []);

  const markOnboardingDone = useCallback(() => {
    setNeedsOnboarding(false);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const onboarded = await hasOnboarded();
        if (onboarded) {
          // Returning user: ensure starter content exists (no-op if already seeded).
          await seedIfEmpty();
        }
        if (cancelled) return;
        setNeedsOnboarding(!onboarded);
        await refresh();
      } catch (e) {
        console.error('[DB] Init failed:', e);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refresh().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return { ready, needsOnboarding, beats, sessions, refresh, markOnboardingDone };
}
