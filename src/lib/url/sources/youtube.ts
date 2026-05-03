import type { TapeSource, TapeMetadata } from './types';
import { TapeSourceError } from './types';
import { streamToBlob } from '../download';

const YT_HOST = /(^|\.)((www\.|m\.|music\.)?youtube\.com|youtu\.be)$/i;

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function mimeToExt(mime?: string): string {
  if (!mime) return 'm4a';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  return 'm4a';
}

export const youtubeSource: TapeSource = {
  id: 'youtube',

  matches(url: string): boolean {
    const host = safeHost(url);
    return !!host && YT_HOST.test(host);
  },

  async fetchMetadata(url: string): Promise<TapeMetadata> {
    const res = await fetch(`/api/resolve?url=${encodeURIComponent(url)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new TapeSourceError(data?.error ?? 'resolve_failed', data?.message);
    }
    return {
      title: data.title ?? 'YouTube tape',
      author: data.author ?? undefined,
      durationSec: data.durationSec ?? undefined,
      mime: data.mime ?? undefined,
      contentLength: data.contentLength ?? undefined,
      ext: mimeToExt(data.mime),
      extra: { itag: data.itag },
    };
  },

  async fetchAudioBlob(url, meta, onProgress, signal): Promise<Blob> {
    const itag = (meta.extra as { itag?: number } | undefined)?.itag;
    const streamUrl =
      `/api/stream?url=${encodeURIComponent(url)}` +
      (itag ? `&itag=${itag}` : '');

    return streamToBlob(streamUrl, {
      mime: meta.mime ?? 'audio/mp4',
      onProgress,
      signal,
    });
  },
};
