import { getAudioContext, unlockAudio } from './context';

export interface AcquireOpts {
  /** Specific input device. If omitted, the system default is used. */
  deviceId?: string;
  /** 0..2 multiplier on the recorded signal. Default 1. */
  gain?: number;
  /** If true, the mic is also routed to speakers (risk of feedback — only enable with headphones). */
  monitor?: boolean;
}

export interface RecorderController {
  beginCapture: () => void;
  stop: () => Promise<{ blob: Blob; durationMs: number; mimeType: string }>;
  cancel: () => void;
  getLevel: () => number;
  /** Adjust the input gain live (0..2). */
  setGain: (g: number) => void;
  /** Toggle monitoring (mic → speakers) live. */
  setMonitor: (on: boolean) => void;
  /** Hooked to interruption / track-end events. */
  onInterrupt?: (reason: 'mute' | 'ended' | 'suspended') => void;
}

/** List available audio input devices (requires prior mic permission to populate labels). */
export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audioinput');
}

const PREFERRED_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of PREFERRED_MIMES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

/**
 * Two-phase recording so we satisfy iOS's "must be on a user gesture" rule
 * while still supporting count-in:
 *   1. `acquireRecorder()` is called synchronously from the tap handler. It
 *      grants mic permission and prepares the MediaRecorder, but does NOT
 *      start capturing. The level meter starts immediately so the user gets
 *      visual feedback during count-in.
 *   2. `controller.beginCapture()` flips the recorder into "recording" — safe
 *      to call from a setTimeout callback because the user already granted
 *      permission and the AudioContext has already resumed.
 */
export async function acquireRecorder(opts: AcquireOpts = {}): Promise<RecorderController> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not supported in this browser.');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported in this browser.');
  }

  // Resume the shared AudioContext on this gesture; this also unblocks any
  // playback that wants to use it later.
  await unlockAudio();

  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
  };
  if (opts.deviceId) audioConstraints.deviceId = { exact: opts.deviceId } as MediaTrackConstraintSet['deviceId'];

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
  } catch (e) {
    const err = e as DOMException;
    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      throw new Error('Microphone permission denied. Enable it in your browser settings.');
    }
    if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
      throw new Error('No microphone found. Connect a mic and try again.');
    }
    if (err?.name === 'OverconstrainedError') {
      // Selected device unavailable — retry without deviceId
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
    } else {
      throw new Error(`Mic error: ${err?.message || String(e)}`);
    }
  }

  // Build the audio graph: source → gain → analyser → destination(stream) → recorder
  // and (optional) gain → audioCtx.destination for monitoring.
  const audioCtx = getAudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = Math.max(0, Math.min(2, opts.gain ?? 1));
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  // MediaStreamDestination produces a MediaStream we feed into MediaRecorder — this
  // ensures the recorded signal has the gain applied (and any future processing).
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(dest);

  let monitorOn = false;
  const setMonitor = (on: boolean) => {
    if (on === monitorOn) return;
    monitorOn = on;
    try {
      if (on) gainNode.connect(audioCtx.destination);
      else gainNode.disconnect(audioCtx.destination);
    } catch {
      /* disconnect throws if not connected — ignore */
    }
  };
  if (opts.monitor) setMonitor(true);

  const setGain = (g: number) => {
    gainNode.gain.value = Math.max(0, Math.min(2, g));
  };

  const buf = new Uint8Array(analyser.fftSize);
  const getLevel = (): number => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    return Math.min(1, rms * 3);
  };

  const mimeType = pickMime();
  const recorder = mimeType
    ? new MediaRecorder(dest.stream, { mimeType })
    : new MediaRecorder(dest.stream);

  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  });

  let startedAt = 0;
  let started = false;

  const ctrl: RecorderController = {
    beginCapture: () => {
      if (started || recorder.state === 'recording') return;
      started = true;
      startedAt = performance.now();
      recorder.start(250);
    },
    getLevel,
    setGain,
    setMonitor,
    async stop() {
      if (recorder.state === 'inactive') {
        cleanup();
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        return {
          blob,
          durationMs: started ? Math.round(performance.now() - startedAt) : 0,
          mimeType: blob.type,
        };
      }
      return await new Promise((resolve) => {
        recorder.addEventListener(
          'stop',
          () => {
            const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
            const durationMs = started ? Math.round(performance.now() - startedAt) : 0;
            cleanup();
            resolve({ blob, durationMs, mimeType: blob.type });
          },
          { once: true },
        );
        recorder.stop();
      });
    },
    cancel: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* ignore */
      }
      cleanup();
    },
  };

  // Wire up interruption handlers — incoming call, headphone disconnect, etc.
  const track = stream.getAudioTracks()[0];
  if (track) {
    track.addEventListener('mute', () => ctrl.onInterrupt?.('mute'));
    track.addEventListener('ended', () => ctrl.onInterrupt?.('ended'));
  }
  const stateListener = () => {
    if (audioCtx.state !== 'running') ctrl.onInterrupt?.('suspended');
  };
  audioCtx.addEventListener('statechange', stateListener);

  function cleanup() {
    stream.getTracks().forEach((t) => t.stop());
    try {
      source.disconnect();
    } catch {
      /* ignore */
    }
    try {
      gainNode.disconnect();
    } catch {
      /* ignore */
    }
    try {
      analyser.disconnect();
    } catch {
      /* ignore */
    }
    try {
      dest.disconnect();
    } catch {
      /* ignore */
    }
    audioCtx.removeEventListener('statechange', stateListener);
  }

  return ctrl;
}
