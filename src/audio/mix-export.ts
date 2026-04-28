import type { Take } from '../types';
import { loadAudioBlob } from '../db/queries';
import { audioBufferToWav } from './wav-encoder';

export interface MixInput {
  takes: Take[];
  beatVolume?: number;
}

async function decodeBlob(ctx: BaseAudioContext, blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer.slice(0));
}

export async function renderMix({ takes }: MixInput): Promise<Blob> {
  const enabled = takes.filter((t) => t.enabled && t.audioBlobKey);
  if (enabled.length === 0) {
    throw new Error('No takes with audio to export. Record something first.');
  }

  const sampleRate = 44100;
  const tmpCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

  const buffers: { take: Take; buffer: AudioBuffer }[] = [];
  for (const take of enabled) {
    const blob = await loadAudioBlob(take.audioBlobKey as string);
    if (!blob) continue;
    const buf = await decodeBlob(tmpCtx, blob);
    buffers.push({ take, buffer: buf });
  }

  await tmpCtx.close();

  if (buffers.length === 0) {
    throw new Error('Could not decode any take audio.');
  }

  const longestSec = buffers.reduce(
    (max, { buffer }) => Math.max(max, buffer.duration),
    0,
  );
  const totalFrames = Math.ceil(longestSec * sampleRate);

  const offline = new OfflineAudioContext(2, totalFrames, sampleRate);

  for (const { take, buffer } of buffers) {
    const src = offline.createBufferSource();
    src.buffer = buffer;
    const gain = offline.createGain();
    gain.gain.value = (take.volume ?? 80) / 100;
    src.connect(gain).connect(offline.destination);
    src.start(0);
  }

  const rendered = await offline.startRendering();
  return audioBufferToWav(rendered);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
