import { useEffect, useState } from 'react';

let persistAttempted = false;

export interface StorageInfo {
  /** Fraction of quota used (0..1). null if unsupported. */
  usage: number | null;
  usedMB: number | null;
  quotaMB: number | null;
  /** True when usage > 0.8 — show a warning banner. */
  low: boolean;
  /** True when usage > 0.95 — block large writes. */
  critical: boolean;
  refresh: () => Promise<void>;
}

export function useStoragePersist(): void {
  useEffect(() => {
    if (persistAttempted) return;
    persistAttempted = true;
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(() => undefined);
    }
  }, []);
}

export function useStorageInfo(): StorageInfo {
  const [usage, setUsage] = useState<number | null>(null);
  const [usedMB, setUsedMB] = useState<number | null>(null);
  const [quotaMB, setQuotaMB] = useState<number | null>(null);

  const refresh = async () => {
    if (!navigator.storage?.estimate) return;
    try {
      const est = await navigator.storage.estimate();
      const used = est.usage ?? 0;
      const quota = est.quota ?? 0;
      setUsedMB(used / (1024 * 1024));
      setQuotaMB(quota / (1024 * 1024));
      setUsage(quota > 0 ? used / quota : 0);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return {
    usage,
    usedMB,
    quotaMB,
    low: usage !== null && usage > 0.8,
    critical: usage !== null && usage > 0.95,
    refresh,
  };
}
