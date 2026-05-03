const DEFAULT_CHUNK = 2 * 1024 * 1024;
const MAX_RETRIES = 3;

export async function streamToBlob(
  url: string,
  opts: {
    totalBytes?: number;
    mime?: string;
    chunkSize?: number;
    onProgress?: (loaded: number, total?: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<Blob> {
  const { totalBytes, mime = 'application/octet-stream', onProgress, signal } = opts;
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK;

  if (totalBytes && totalBytes > 0) {
    return downloadRanged(url, totalBytes, chunkSize, mime, onProgress, signal);
  }
  return downloadStreamed(url, mime, onProgress, signal);
}

async function downloadRanged(
  url: string,
  total: number,
  chunkSize: number,
  mime: string,
  onProgress: ((loaded: number, total?: number) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<Blob> {
  const parts: ArrayBuffer[] = [];
  let loaded = 0;

  for (let start = 0; start < total; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, total - 1);
    const buf = await fetchChunkWithRetry(url, start, end, signal);
    parts.push(buf);
    loaded += buf.byteLength;
    onProgress?.(loaded, total);
  }

  return new Blob(parts, { type: mime });
}

async function fetchChunkWithRetry(
  url: string,
  start: number,
  end: number,
  signal: AbortSignal | undefined,
): Promise<ArrayBuffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
      });
      if (!res.ok && res.status !== 206 && res.status !== 200) {
        throw new Error(`chunk_http_${res.status}`);
      }
      return await res.arrayBuffer();
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('chunk_failed');
}

async function downloadStreamed(
  url: string,
  mime: string,
  onProgress: ((loaded: number, total?: number) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<Blob> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`http_${res.status}`);

  const total = Number(res.headers.get('Content-Length')) || undefined;

  if (!res.body) {
    const blob = await res.blob();
    onProgress?.(blob.size, total);
    return new Blob([blob], { type: mime });
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }
  return new Blob(chunks as BlobPart[], { type: mime });
}
