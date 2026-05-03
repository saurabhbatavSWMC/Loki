export type SourceId = 'youtube' | 'soundcloud' | 'unknown';

export interface TapeMetadata {
  title: string;
  author?: string;
  durationSec?: number;
  mime?: string;
  contentLength?: number;
  ext?: string;
  extra?: Record<string, unknown>;
}

export interface TapeSource {
  id: Exclude<SourceId, 'unknown'>;
  matches(url: string): boolean;
  fetchMetadata(url: string): Promise<TapeMetadata>;
  fetchAudioBlob(
    url: string,
    meta: TapeMetadata,
    onProgress?: (loaded: number, total?: number) => void,
    signal?: AbortSignal,
  ): Promise<Blob>;
}

export class TapeSourceError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'TapeSourceError';
  }
}
