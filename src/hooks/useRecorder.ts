import { useCallback, useEffect, useRef, useState } from 'react';
import { acquireRecorder, type RecorderController } from '../audio/recorder';
import { haptics } from '../lib/haptics';

export interface UseRecorderResult {
  recording: boolean;
  ready: boolean;        // mic acquired but not yet capturing (count-in window)
  error: string | null;
  level: number;
  elapsedMs: number;
  /** Synchronous-from-tap: requests mic, prepares recorder, starts level meter. */
  acquire: () => Promise<void>;
  /** Begin actual capture; safe to call from setTimeout after count-in. */
  beginCapture: () => void;
  stop: () => Promise<{ blob: Blob; durationMs: number; mimeType: string } | null>;
  cancel: () => void;
}

export function useRecorder(): UseRecorderResult {
  const [recording, setRecording] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const ctrlRef = useRef<RecorderController | null>(null);
  const startedAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    setLevel(ctrl.getLevel());
    if (startedAtRef.current > 0) {
      setElapsedMs(performance.now() - startedAtRef.current);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const acquire = useCallback(async () => {
    setError(null);
    try {
      const ctrl = await acquireRecorder();
      ctrl.onInterrupt = (reason) => {
        if (reason === 'mute' || reason === 'ended') {
          setError('Microphone disconnected.');
          haptics.warn();
          ctrl.cancel();
          ctrlRef.current = null;
          setRecording(false);
          setReady(false);
        }
      };
      ctrlRef.current = ctrl;
      setReady(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not access microphone.';
      setError(msg);
      setReady(false);
      haptics.error();
    }
  }, [tick]);

  const beginCapture = useCallback(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    ctrl.beginCapture();
    startedAtRef.current = performance.now();
    setElapsedMs(0);
    setRecording(true);
    haptics.recordStart();
  }, []);

  const stop = useCallback(async () => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setRecording(false);
    setReady(false);
    haptics.recordStop();
    const result = await ctrl.stop();
    ctrlRef.current = null;
    setLevel(0);
    startedAtRef.current = 0;
    return result;
  }, []);

  const cancel = useCallback(() => {
    const ctrl = ctrlRef.current;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    ctrl?.cancel();
    ctrlRef.current = null;
    setRecording(false);
    setReady(false);
    setLevel(0);
    startedAtRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ctrlRef.current?.cancel();
    };
  }, []);

  return { recording, ready, error, level, elapsedMs, acquire, beginCapture, stop, cancel };
}
