import type { SourceId, TapeSource } from './sources/types';
import { youtubeSource } from './sources/youtube';

const REGISTRY: TapeSource[] = [youtubeSource];

export function detectSource(url: string): SourceId {
  const trimmed = url.trim();
  if (!trimmed) return 'unknown';
  for (const src of REGISTRY) {
    if (src.matches(trimmed)) return src.id;
  }
  if (/soundcloud\.com/i.test(trimmed)) return 'soundcloud';
  return 'unknown';
}

export function getSource(url: string): TapeSource | null {
  const trimmed = url.trim();
  for (const src of REGISTRY) {
    if (src.matches(trimmed)) return src;
  }
  return null;
}

export function isLikelyUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
