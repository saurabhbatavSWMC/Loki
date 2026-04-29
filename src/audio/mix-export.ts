import type { Take } from '../types';
import { loadAudioBlob } from '../db/queries';
import { audioBufferToWav } from './wav-encoder';

export type MixMode = 'full' | 'vocals' | 'beat';

export interface MixInput {
  takes: Take[];
  /** If provided, the beat is mixed in (depending on `mode`). */
  beatBlob?: Blob | null | undefined;
  /** 0..1, default 0.7. Only used when the beat is included. */
  beatVolume?: number;
  /** Default 'full'. */
  mode?: MixMode;
}

async function decodeBlob(ctx: BaseAudioContext, blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer.slice(0));
}

export async function renderMix({ takes, beatBlob, beatVolume = 0.7, mode = 'full' }: MixInput): Promise<Blob> {
  const wantTakes = mode !== 'beat';
  const wantBeat = mode !== 'vocals' && !!beatBlob;

  const enabled = wantTakes ? takes.filter((t) => t.enabled && t.audioBlobKey) : [];
  if (!wantBeat && enabled.length === 0) {
    if (mode === 'beat') throw new Error('No beat audio to export.');
    throw new Error('No takes with audio to export. Record something first.');
  }

  const sampleRate = 44100;
  const tmpCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

  const takeBuffers: { take: Take; buffer: AudioBuffer }[] = [];
  for (const take of enabled) {
    const blob = await loadAudioBlob(take.audioBlobKey as string);
    if (!blob) continue;
    const buf = await decodeBlob(tmpCtx, blob);
    takeBuffers.push({ take, buffer: buf });
  }

  let beatBuffer: AudioBuffer | null = null;
  if (wantBeat && beatBlob) {
    try {
      beatBuffer = await decodeBlob(tmpCtx, beatBlob);
    } catch (e) {
      console.warn('[renderMix] could not decode beat blob:', e);
    }
  }

  await tmpCtx.close();

  if (takeBuffers.length === 0 && !beatBuffer) {
    throw new Error('Could not decode any audio.');
  }

  const longestSec = Math.max(
    beatBuffer?.duration ?? 0,
    takeBuffers.reduce((max, { buffer }) => Math.max(max, buffer.duration), 0),
  );
  const totalFrames = Math.ceil(longestSec * sampleRate);

  const offline = new OfflineAudioContext(2, totalFrames, sampleRate);

  if (beatBuffer) {
    const src = offline.createBufferSource();
    src.buffer = beatBuffer;
    const gain = offline.createGain();
    gain.gain.value = Math.max(0, Math.min(1, beatVolume));
    src.connect(gain).connect(offline.destination);
    src.start(0);
  }

  for (const { take, buffer } of takeBuffers) {
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
