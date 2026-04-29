import { useCallback, useEffect, useState } from 'react';
import type { Beat, SessionWithBeat } from '../types';
import * as q from '../db/queries';
import { seedIfEmpty } from '../db/seed';

export interface UseDatabaseResult {
  ready: boolean;
  beats: Beat[];
  sessions: SessionWithBeat[];
  refresh: () => Promise<void>;
}

export function useDatabase(): UseDatabaseResult {
  const [ready, setReady] = useState(false);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [sessions, setSessions] = useState<SessionWithBeat[]>([]);

  const refresh = useCallback(async () => {
    const [b, s] = await Promise.all([q.getBeats(), q.getSessions()]);
    setBeats(b);
    setSessions(s);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedIfEmpty();
        if (cancelled) return;
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

  return { ready, beats, sessions, refresh };
}
