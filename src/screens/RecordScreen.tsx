import { useCallback, useEffect, useRef, useState } from 'react';
import type { Beat, Take } from '../types';
import { fmtTC } from '../lib/format';
import { Icon, IconBtn, Grain } from '../components/Icon';
import { Sheet, MenuRow, ScreenHeader, Stamp, PSwitch, PSlider } from '../components/primitives';
import { Waveform, VUMeter, SegDisplay, PeakMeter } from '../components/audio-visuals';
import { useRecorder } from '../hooks/useRecorder';
import { useWakeLock } from '../hooks/useWakeLock';
import { loadAudioBlob, getSetting, setSetting } from '../db/queries';
import { createPlayback, type PlaybackController } from '../audio/context';
import { scheduleCountIn, startMetronome } from '../audio/metronome';
import { listInputDevices } from '../audio/recorder';

export interface RecordController {
  start: () => void;
  stop: () => void;
  counting: number;
}

interface FinishTakePayload {
  durationMs: number;
  blob: Blob | null;
  mimeType: string;
  beatStartMs?: number;
  beatEndMs?: number;
}

interface Props {
  beat: Beat;
  takes: Take[];
  onBack: () => void;
  onFinishTake: (payload: FinishTakePayload) => void;
  showToast: (msg: string) => void;
  onRecordingChange?: (rec: boolean) => void;
  onCountingChange?: (counting: boolean) => void;
  recCtrlRef?: React.MutableRefObject<RecordController | null>;
}

export const RecordScreen = ({
  beat,
  takes,
  onBack,
  onFinishTake,
  showToast,
  onRecordingChange,
  onCountingChange,
  recCtrlRef,
}: Props) => {
  const recorder = useRecorder();

  /* ── persistent settings ─────────────────────────────────── */
  const [inputGain, setInputGain] = useState(100);
  const [beatVol, setBeatVol] = useState(70);
  const [monitor, setMonitor] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [countIn, setCountIn] = useState(false);

  /* ── ui state ────────────────────────────────────────────── */
  const [moreOpen, setMoreOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [counting, setCounting] = useState(0);
  const [clip, setClip] = useState(false);
  const [inputDeviceId, setInputDeviceId] = useState<string | null>(null);
  const [inputDeviceLabel, setInputDeviceLabel] = useState<string>('Built-in mic');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  /* ── beat playback / cue ────────────────────────────────── */
  // beatProgress is the live playhead (0..1) — auto-updates when previewing
  // or recording. Equal to cueProgress when paused.
  const [beatProgress, setBeatProgress] = useState(0);
  const [cueProgress, setCueProgress] = useState(0); // start cue (0..1)
  const [beatPlaying, setBeatPlaying] = useState(false);
  const beatRef = useRef<number | null>(null);
  const beatPlayerRef = useRef<PlaybackController | null>(null);
  const metronomeStopRef = useRef<(() => void) | null>(null);
  const clipTimeoutRef = useRef<number | null>(null);

  // Captured at the moment recording starts; used to tag the take.
  const recordStartBeatMsRef = useRef<number>(0);

  /* ── load persisted settings ─────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedDevice = await getSetting<string>('input_device_id');
      const savedLabel = await getSetting<string>('input_device_label');
      const savedGain = await getSetting<number>('input_gain');
      const savedBeatVol = await getSetting<number>('beat_vol');
      const savedMonitor = await getSetting<boolean>('input_monitor');
      if (cancelled) return;
      if (savedDevice) setInputDeviceId(savedDevice);
      if (savedLabel) setInputDeviceLabel(savedLabel);
      if (typeof savedGain === 'number') setInputGain(savedGain);
      if (typeof savedBeatVol === 'number') setBeatVol(savedBeatVol);
      if (typeof savedMonitor === 'boolean') setMonitor(savedMonitor);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshDevices = useCallback(async () => {
    const list = await listInputDevices();
    // enumerateDevices returns blank labels without an active stream;
    // if we still get no labels, request a temporary stream to unlock them.
    const hasLabels = list.some((d) => d.label);
    if (!hasLabels && list.length > 0) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        const labeled = await listInputDevices();
        s.getTracks().forEach((t) => t.stop());
        setDevices(labeled);
        return;
      } catch {
        /* permission denied — show unlabeled list anyway */
      }
    }
    setDevices(list);
  }, []);

  useEffect(() => {
    const handler = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handler);
  }, [refreshDevices]);

  // Keep the screen awake while recording or holding the mic open.
  useWakeLock(recorder.recording || recorder.ready);

  /* ── auto-arm the mic so meters go live before pressing REC ── */
  // Re-arm whenever the saved device or persisted settings change. If permission
  // has not yet been granted (first visit, no prior user gesture), this fails
  // silently — the existing "MIC LOCKED" UI covers the denied case, and the
  // first REC tap will acquire normally.
  const armedRef = useRef(false);
  useEffect(() => {
    if (armedRef.current) return;
    if (recorder.ready || recorder.recording) return;
    armedRef.current = true;
    void recorder.acquire({
      deviceId: inputDeviceId ?? undefined,
      gain: inputGain / 50,
      monitor,
    }).catch(() => {
      // permission not yet granted — let user trigger via REC button
      armedRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.ready, recorder.recording, inputDeviceId]);

  /* ── beat audio: load + live volume ──────────────────────── */
  useEffect(() => {
    if (!beat.audioBlobKey) return;
    let cancelled = false;
    loadAudioBlob(beat.audioBlobKey).then((blob) => {
      if (cancelled || !blob) return;
      beatPlayerRef.current = createPlayback(blob, { loop: false, volume: beatVol / 100 });
    });
    return () => {
      cancelled = true;
      beatPlayerRef.current?.destroy();
      beatPlayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat.audioBlobKey]);

  // Live update beat volume + persist
  useEffect(() => {
    beatPlayerRef.current?.setVolume(beatVol / 100);
    void setSetting('beat_vol', beatVol);
  }, [beatVol]);

  /* ── stable refs for callback props ──────────────────────── */
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const onRecordingChangeRef = useRef(onRecordingChange);
  onRecordingChangeRef.current = onRecordingChange;
  const onCountingChangeRef = useRef(onCountingChange);
  onCountingChangeRef.current = onCountingChange;
  const onFinishTakeRef = useRef(onFinishTake);
  onFinishTakeRef.current = onFinishTake;

  /* ── clip indicator (peak ≥ 0.9) ─────────────────────────── */
  const prevClipLevel = useRef(false);
  const isClipping = recorder.level > 0.9;
  if (isClipping && !prevClipLevel.current) {
    if (!clip) setClip(true);
    if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
    clipTimeoutRef.current = window.setTimeout(() => setClip(false), 400);
  }
  prevClipLevel.current = isClipping;

  useEffect(() => {
    return () => {
      if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
    };
  }, []);

  /* ── beat preview playback (when not recording) ──────────── */
  useEffect(() => {
    const player = beatPlayerRef.current;
    if (beatPlaying && !recorder.recording) {
      if (player) {
        player.audioEl.loop = false;
        player.seek(beatProgress * beat.duration);
        player.play().catch(() => {});
        player.audioEl.onended = () => {
          setBeatPlaying(false);
          setBeatProgress(cueProgress);
        };
      }
      const dur = beat.duration * 1000;
      const start = Date.now() - beatProgress * dur;
      beatRef.current = window.setInterval(() => {
        const d = player?.duration() ?? 0;
        if (player && d > 0 && isFinite(d)) {
          const p = player.currentTime() / d;
          if (p >= 1) {
            setBeatPlaying(false);
            setBeatProgress(cueProgress);
          } else {
            setBeatProgress(p);
          }
        } else {
          const p = (Date.now() - start) / dur;
          if (p >= 1) {
            setBeatPlaying(false);
            setBeatProgress(cueProgress);
          } else {
            setBeatProgress(p);
          }
        }
      }, 60);
    } else {
      player?.pause();
      if (beatRef.current) {
        clearInterval(beatRef.current);
        beatRef.current = null;
      }
    }
    return () => {
      if (beatRef.current) clearInterval(beatRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatPlaying, recorder.recording]);

  /* ── beat playback during recording: starts at cue, updates progress ── */
  useEffect(() => {
    const player = beatPlayerRef.current;
    if (!player) return;
    if (recorder.recording) {
      // Beat plays once from the take's start position (captured when REC
      // was pressed). Reading from the ref keeps this in sync with the take's
      // beatStartMs, so the green band on the waveform anchors to the same
      // position the audio is actually rolling from.
      player.audioEl.loop = false;
      const startSec = recordStartBeatMsRef.current / 1000;
      player.seek(startSec);
      player.play().catch(() => {});

      // Drive `beatProgress` from the player so the user sees the playhead
      // sweep across the waveform live.
      const dur = beat.duration * 1000;
      beatRef.current = window.setInterval(() => {
        const d = player.duration();
        if (d > 0 && isFinite(d)) {
          setBeatProgress(player.currentTime() / d);
        } else {
          // Fallback to time math if duration unknown (shouldn't happen post-load)
          const elapsedFromStart = (Date.now() - performance.timeOrigin) - dur * cueProgress;
          setBeatProgress(elapsedFromStart / dur);
        }
      }, 60);
    } else {
      player.pause();
      // Snap the audio position back to the cue so it matches the visual
      // reset. Without this, the player.currentTime stays at the stop
      // position and the next captureStartPosition() reads that stale value
      // — making REC after a stop/discard start from where the previous
      // take ended instead of from the cue marker.
      const cueSec = cueProgress * beat.duration;
      if (isFinite(cueSec) && cueSec >= 0) {
        try { player.seek(cueSec); } catch { /* player may have been destroyed */ }
      }
      if (beatRef.current) {
        clearInterval(beatRef.current);
        beatRef.current = null;
      }
      setBeatProgress(cueProgress);
    }
    return () => {
      if (beatRef.current) clearInterval(beatRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.recording]);

  /* ── propagate recording state up ────────────────────────── */
  useEffect(() => {
    onRecordingChangeRef.current?.(recorder.recording);
  }, [recorder.recording]);

  useEffect(() => {
    if (recorder.error) showToastRef.current(recorder.error);
  }, [recorder.error]);

  /* ── live gain & monitor wiring on the recorder ──────────── */
  useEffect(() => {
    recorder.setGain(inputGain / 50);
    void setSetting('input_gain', inputGain);
  }, [inputGain, recorder]);

  useEffect(() => {
    recorder.setMonitor(monitor);
    void setSetting('input_monitor', monitor);
  }, [monitor, recorder]);

  /* ── start recording: capture cue, play beat, count-in, capture ── */
  const beginRecording = async () => {
    // Stop any standalone preview before recording takes over the beat player —
    // otherwise the preview effect can fire again when recording stops and
    // resume the beat unexpectedly.
    setBeatPlaying(false);
    // Phase 1 (must be on the user gesture): mic + AudioContext.
    await recorder.acquire({
      deviceId: inputDeviceId ?? undefined,
      gain: inputGain / 50,
      monitor,
    });
    if (recorder.error) return;
    void refreshDevices();

    if (metronome) {
      metronomeStopRef.current?.();
      metronomeStopRef.current = startMetronome(beat.bpm, 0.4);
    }

    // The take starts at the live beat position when REC is pressed. If the
    // user previewed the beat, currentTime reflects where they actually are.
    // If the beat hasn't been touched, currentTime is 0 (or the cue position
    // after a scrub, since scrub seeks the player). cueProgress is a fallback
    // for the rare case the player has no valid time yet.
    const captureStartPosition = () => {
      const totalMs = beat.duration * 1000;
      const player = beatPlayerRef.current;
      if (player) {
        const t = player.currentTime();
        if (isFinite(t) && t >= 0) {
          recordStartBeatMsRef.current = Math.max(0, Math.min(totalMs, Math.round(t * 1000)));
          return;
        }
      }
      recordStartBeatMsRef.current = Math.round(cueProgress * totalMs);
    };

    if (countIn) {
      const beat_ms = Math.round(60000 / beat.bpm);
      scheduleCountIn(beat.bpm, 4, 0.6);

      let c = 4;
      setCounting(c);
      onCountingChangeRef.current?.(true);
      const tickVisual = () => {
        c--;
        if (c > 0) {
          setCounting(c);
          window.setTimeout(tickVisual, beat_ms);
        } else {
          setCounting(0);
          onCountingChangeRef.current?.(false);
          captureStartPosition();
          recorder.beginCapture();
        }
      };
      window.setTimeout(tickVisual, beat_ms);
    } else {
      captureStartPosition();
      recorder.beginCapture();
    }
  };

  /* ── pending-take confirm strip (KEEP / RETAKE / DISCARD) ── */
  const [pending, setPending] = useState<{
    blob: Blob;
    durationMs: number;
    mimeType: string;
    beatStartMs: number;
    beatEndMs: number;
  } | null>(null);
  const autoKeepTimerRef = useRef<number | null>(null);
  const pendingPlayerRef = useRef<PlaybackController | null>(null);
  const pendingProgRef = useRef<number | null>(null);
  const [pendingPlaying, setPendingPlaying] = useState(false);
  const [pendingProg, setPendingProg] = useState(0); // 0..1 within the take

  const stopPendingPlayback = () => {
    if (pendingProgRef.current !== null) {
      clearInterval(pendingProgRef.current);
      pendingProgRef.current = null;
    }
    pendingPlayerRef.current?.destroy();
    pendingPlayerRef.current = null;
    // Pause the beat AND snap it back to the cue so the next REC press starts
    // from the cue marker rather than from wherever the take playback left it.
    const bp = beatPlayerRef.current;
    if (bp) {
      bp.pause();
      const cueSec = cueProgress * beat.duration;
      if (isFinite(cueSec) && cueSec >= 0) {
        try { bp.seek(cueSec); } catch { /* player may have been destroyed */ }
      }
    }
    setBeatProgress(cueProgress);
    setPendingPlaying(false);
    setPendingProg(0);
    // Reset preview state so a subsequent waveform tap re-triggers the
    // preview effect (otherwise beatPlaying may still read true from before
    // the recording cycle and the effect won't re-run).
    setBeatPlaying(false);
  };

  const togglePendingPlay = async () => {
    if (!pending) return;
    if (pendingPlayerRef.current) {
      stopPendingPlayback();
      return;
    }
    try {
      // Cue beat to the position where the take was recorded so the user hears
      // the take in sync with the beat — same alignment used by the live mix
      // and the export bounce.
      const beatPlayer = beatPlayerRef.current;
      if (beatPlayer) {
        const beatDur = beatPlayer.duration() || beat.duration;
        const startSec = Math.min(beatDur, pending.beatStartMs / 1000);
        beatPlayer.audioEl.loop = false;
        beatPlayer.seek(startSec);
        beatPlayer.setVolume(beatVol / 100);
        beatPlayer.play().catch(() => {});
      }
      const player = createPlayback(pending.blob, { volume: 1 });
      player.audioEl.addEventListener('ended', () => {
        stopPendingPlayback();
      });
      pendingPlayerRef.current = player;
      setPendingPlaying(true);
      setPendingProg(0);
      await player.play();
      // Drive the green playhead from the audio element so the marker tracks
      // the actual decoded position rather than wall-clock time. Also push the
      // beat playhead (orange line on the waveform) from the live beat player
      // so the user sees BOTH playheads sweep in sync.
      pendingProgRef.current = window.setInterval(() => {
        const p = pendingPlayerRef.current;
        if (p) {
          const d = p.duration();
          if (d > 0 && isFinite(d)) {
            setPendingProg(Math.max(0, Math.min(1, p.currentTime() / d)));
          }
        }
        const bp = beatPlayerRef.current;
        if (bp) {
          const bd = bp.duration() || beat.duration;
          if (bd > 0 && isFinite(bd)) {
            setBeatProgress(Math.max(0, Math.min(1, bp.currentTime() / bd)));
          }
        }
      }, 60);
    } catch {
      stopPendingPlayback();
      showToastRef.current('Could not play take');
    }
  };

  const commitPending = (p: {
    blob: Blob;
    durationMs: number;
    mimeType: string;
    beatStartMs: number;
    beatEndMs: number;
  }) => {
    stopPendingPlayback();
    onFinishTakeRef.current({
      durationMs: p.durationMs,
      blob: p.blob,
      mimeType: p.mimeType,
      beatStartMs: p.beatStartMs,
      beatEndMs: p.beatEndMs,
    });
    setPending(null);
  };

  const stopAndSave = async () => {
    if (!recorder.recording) return;
    metronomeStopRef.current?.();
    metronomeStopRef.current = null;
    // Capture the beat playhead at the moment we stop — this is where the take
    // ends on the beat timeline. Read currentTime BEFORE pausing so we get the
    // live position, then pause so the beat doesn't keep playing through the
    // pending-take review.
    const player = beatPlayerRef.current;
    const totalMs = beat.duration * 1000;
    let stopBeatMs = recordStartBeatMsRef.current;
    if (player) {
      const t = player.currentTime();
      if (isFinite(t) && t >= 0) {
        stopBeatMs = Math.max(0, Math.min(totalMs, Math.round(t * 1000)));
      }
      player.pause();
    }
    // Clear the preview flag so the recording=false transition doesn't kick
    // the preview effect back on and resume the beat after stopping.
    setBeatPlaying(false);
    const result = await recorder.stop();
    if (!result) return;
    const beatStartMs = recordStartBeatMsRef.current;
    const beatEndMs = Math.max(beatStartMs, stopBeatMs);
    const payload = { ...result, beatStartMs, beatEndMs };
    setPending(payload);
    if (autoKeepTimerRef.current) clearTimeout(autoKeepTimerRef.current);
    // Long safety net — the user is expected to explicitly choose KEEP/RETAKE/DISCARD
    // after listening, so 60s gives time to evaluate without losing the take.
    autoKeepTimerRef.current = window.setTimeout(() => {
      commitPending(payload);
    }, 60000);
  };

  const keepPending = () => {
    if (!pending) return;
    if (autoKeepTimerRef.current) clearTimeout(autoKeepTimerRef.current);
    commitPending(pending);
  };

  const discardPending = () => {
    if (autoKeepTimerRef.current) clearTimeout(autoKeepTimerRef.current);
    stopPendingPlayback();
    setPending(null);
    showToastRef.current('Take discarded');
  };

  const retakePending = async () => {
    discardPending();
    await beginRecording();
  };

  useEffect(() => {
    return () => {
      if (autoKeepTimerRef.current) clearTimeout(autoKeepTimerRef.current);
      if (pendingProgRef.current !== null) clearInterval(pendingProgRef.current);
      pendingPlayerRef.current?.destroy();
      pendingPlayerRef.current = null;
      metronomeStopRef.current?.();
      metronomeStopRef.current = null;
    };
  }, []);

  /* ── expose start/stop to TabBar ─────────────────────────── */
  useEffect(() => {
    if (recCtrlRef) {
      recCtrlRef.current = {
        start: () => {
          void beginRecording();
        },
        stop: () => {
          void stopAndSave();
        },
        counting,
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counting, recorder.recording]);

  /* ── computed ────────────────────────────────────────────── */
  const nextTake = takes.length + 1;
  const tc = fmtTC(recorder.elapsedMs);
  const recording = recorder.recording;

  const cueLeftPct = cueProgress * 100;
  const headLeftPct = beatProgress * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Grain />

      {counting > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(240,235,223,.85)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            key={counting}
            style={{
              fontFamily: 'JetBrains Mono',
              fontWeight: 800,
              fontSize: 120,
              color: 'var(--spot)',
              lineHeight: 1,
              animation: 'count-pop 400ms var(--ease) both',
              textShadow: '4px 4px 0 var(--ink-0)',
            }}
          >
            {counting}
          </div>
        </div>
      )}

      <div className="fixed-header" style={{ padding: '0 20px', flexShrink: 0 }}>
        <ScreenHeader
          left={<IconBtn name="back" onClick={() => { if (!recording) onBack(); }} title="Back" style={{ opacity: recording ? 0.3 : 1, cursor: recording ? 'not-allowed' : 'pointer' }} />}
          title={recording ? `● TAKE ${String(nextTake).padStart(2, '0')}` : 'READY'}
          right={<IconBtn name="more" onClick={() => setMoreOpen(true)} title="Options" />}
        />
      </div>

      {recorder.error && /denied|permission/i.test(recorder.error) && (
        <div style={{ margin: '6px 20px 8px', background: 'var(--paper-1)', border: '1.5px solid var(--spot)', borderRadius: 14, padding: '12px 14px', position: 'relative', zIndex: 8, boxShadow: '0 4px 16px rgba(217,58,28,.18), var(--elev-1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Stamp rotate={-3} color="var(--spot)">MIC LOCKED</Stamp>
            <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 12, color: 'var(--ink-0)' }}>
              Microphone permission denied
            </span>
          </div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 8 }}>
            Tap the lock icon in the address bar (or your browser's site settings) and allow Microphone, then retry.
          </div>
          <button
            onClick={() => void recorder.acquire({ deviceId: inputDeviceId ?? undefined, gain: inputGain / 50, monitor })}
            style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 11, letterSpacing: '.08em', color: '#F0EBDF', background: 'var(--spot)', border: 'none', borderRadius: 12, padding: '6px 16px', boxShadow: '0 4px 12px rgba(217,58,28,.30)' }}
            type="button"
          >
            ▸ TRY AGAIN
          </button>
        </div>
      )}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="RECORD OPTIONS">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px solid color-mix(in srgb,var(--ink-0) 10%,transparent)' }}>
          <div style={{ width: 28, height: 28, border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--paper-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="cassette" size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 12, letterSpacing: '.04em', textTransform: 'uppercase' }}>Metronome</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', marginTop: 2 }}>{beat.bpm} BPM click</div>
          </div>
          <PSwitch on={metronome} onChange={setMetronome} size="sm" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px solid color-mix(in srgb,var(--ink-0) 10%,transparent)' }}>
          <div style={{ width: 28, height: 28, border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--paper-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="play" size={12} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 12, letterSpacing: '.04em', textTransform: 'uppercase' }}>4-Beat Count-In</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', marginTop: 2 }}>One bar before record</div>
          </div>
          <PSwitch on={countIn} onChange={setCountIn} size="sm" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px solid color-mix(in srgb,var(--ink-0) 10%,transparent)' }}>
          <div style={{ width: 28, height: 28, border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--paper-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="cassette" size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 12, letterSpacing: '.04em', textTransform: 'uppercase' }}>Monitor While Recording</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', marginTop: 2 }}>{monitor ? 'On · use headphones to avoid feedback' : 'Off · avoids feedback'}</div>
          </div>
          <PSwitch on={monitor} onChange={setMonitor} size="sm" />
        </div>
        <MenuRow
          icon="mic"
          label="Input Device"
          hint={inputDeviceLabel}
          onClick={async () => {
            await refreshDevices();
            setMoreOpen(false);
            setDevicesOpen(true);
          }}
        />
        {recording && (
          <MenuRow
            icon="trash"
            label="Discard Current Take"
            danger
            onClick={() => {
              recorder.cancel();
              setMoreOpen(false);
              showToast('Take discarded');
            }}
          />
        )}
      </Sheet>

      <Sheet open={devicesOpen} onClose={() => setDevicesOpen(false)} title="INPUT DEVICE">
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 4px 4px' }}>
          <button
            onClick={() => void refreshDevices()}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--ink-2)', padding: '5px 12px', border: '1px solid var(--border-medium)', borderRadius: 16 }}
            type="button"
            title="Refresh device list"
          >
            <Icon name="refresh" size={11} color="var(--ink-2)" />
            REFRESH
          </button>
        </div>
        {devices.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)' }}>
            No input devices detected.
            <div style={{ marginTop: 8, fontSize: 10 }}>Grant mic permission once (tap Record), then reopen this list.</div>
          </div>
        ) : (
          <>
            <MenuRow
              icon="mic"
              label="System Default"
              hint={!inputDeviceId ? 'Selected' : undefined}
              right={!inputDeviceId ? <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--spot)' }}>✓</span> : undefined}
              onClick={async () => {
                setInputDeviceId(null);
                setInputDeviceLabel('System default');
                await setSetting('input_device_id', '');
                await setSetting('input_device_label', 'System default');
                setDevicesOpen(false);
                showToast('Input: system default');
              }}
            />
            {devices.map((d) => {
              const label = d.label || `Microphone ${d.deviceId.slice(0, 6)}`;
              const selected = inputDeviceId === d.deviceId;
              return (
                <MenuRow
                  key={d.deviceId}
                  icon="mic"
                  label={label}
                  hint={selected ? 'Selected' : undefined}
                  right={selected ? <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--spot)' }}>✓</span> : undefined}
                  onClick={async () => {
                    setInputDeviceId(d.deviceId);
                    setInputDeviceLabel(label);
                    await setSetting('input_device_id', d.deviceId);
                    await setSetting('input_device_label', label);
                    setDevicesOpen(false);
                    showToast(`Input: ${label}`);
                  }}
                />
              );
            })}
          </>
        )}
      </Sheet>

      <div className="scroll-body" style={{ padding: '4px 20px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* ── BEAT WAVEFORM + CUE MARKER + VOLUME ── */}
        <div style={{ background: 'var(--paper-1)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '12px 14px', position: 'relative', zIndex: 3, boxShadow: 'var(--elev-1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)' }}>
              BEAT ▸{' '}
              {recording ? (
                <span style={{ color: 'var(--spot)', animation: 'blink 1s infinite' }}>ROLLING</span>
              ) : beatPlaying ? (
                <span style={{ color: 'var(--spot)' }}>PREVIEW</span>
              ) : (
                <span>SET START · DRAG</span>
              )}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, color: 'var(--spot)', fontVariantNumeric: 'tabular-nums', letterSpacing: '.06em' }}>
                ▴ {fmtTC(cueProgress * beat.duration * 1000)}
              </span>
              <button
                onClick={() => !recording && setBeatPlaying((p) => !p)}
                disabled={recording}
                style={{ all: 'unset', cursor: recording ? 'default' : 'pointer', width: 22, height: 22, borderRadius: '50%', background: 'var(--paper-1)', border: 'none', boxShadow: 'var(--elev-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: recording ? 0.4 : 1 }}
                type="button"
                title={beatPlaying ? 'Pause preview' : 'Preview from cue'}
              >
                <Icon name={beatPlaying ? 'pause' : 'play'} size={11} color="var(--ink-0)" />
              </button>
            </div>
          </div>

          {/* Waveform with cue marker overlay. The Waveform itself shows `beatProgress`
              (the live playhead). On top we draw a fixed cue marker at `cueProgress`. */}
          <div style={{ position: 'relative' }}>
            <Waveform
              progress={beatProgress}
              seed={beat.bpm * 2}
              height={56}
              bars={70}
              color="var(--spot)"
              restColor="var(--ink-3)"
              onScrub={
                !recording && !pendingPlaying
                  ? (p: number) => {
                      setCueProgress(p);
                      setBeatProgress(p);
                      const player = beatPlayerRef.current;
                      if (player) {
                        player.seek(p * (player.duration() || beat.duration));
                      }
                      setBeatPlaying(true);
                    }
                  : null
              }
            />
            {/* Cue marker (orange triangle + line) */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: -6,
                bottom: -2,
                left: `${cueLeftPct}%`,
                width: 0,
                pointerEvents: 'none',
                zIndex: 4,
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: -6, width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '7px solid var(--spot)' }} />
              <div style={{ position: 'absolute', top: 0, left: -1, bottom: 0, width: 2, background: 'var(--spot)', opacity: 0.6 }} />
            </div>
            {/* Live playhead during recording (white-ink) */}
            {recording && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: -2,
                  bottom: -2,
                  left: `${headLeftPct}%`,
                  width: 2,
                  background: 'var(--ink-0)',
                  pointerEvents: 'none',
                  zIndex: 5,
                  boxShadow: '0 0 4px var(--ink-0)',
                }}
              />
            )}
            {/* Pending take coverage band + start marker (green) */}
            {pending && (() => {
              const totalMs = beat.duration * 1000;
              const startPct = Math.max(0, Math.min(100, (pending.beatStartMs / totalMs) * 100));
              const endPct = Math.max(startPct, Math.min(100, (pending.beatEndMs / totalMs) * 100));
              const TAKE_COLOR = '#7EC37A';
              return (
                <>
                  {endPct > startPct && (
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${startPct}%`,
                        width: `${endPct - startPct}%`,
                        background: TAKE_COLOR,
                        opacity: 0.18,
                        pointerEvents: 'none',
                        zIndex: 3,
                      }}
                    />
                  )}
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: -6,
                      bottom: -2,
                      left: `${startPct}%`,
                      width: 0,
                      pointerEvents: 'none',
                      zIndex: 6,
                    }}
                  >
                    <div style={{ position: 'absolute', top: 0, left: -6, width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `7px solid ${TAKE_COLOR}` }} />
                    <div style={{ position: 'absolute', top: 0, left: -1, bottom: 0, width: 2, background: TAKE_COLOR, opacity: 0.85, boxShadow: `0 0 4px ${TAKE_COLOR}` }} />
                  </div>
                  {pendingPlaying && endPct > startPct && (
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: -2,
                        bottom: -2,
                        left: `${startPct + (endPct - startPct) * pendingProg}%`,
                        width: 2,
                        background: '#FFFFFF',
                        boxShadow: `0 0 6px ${TAKE_COLOR}, 0 0 2px #FFFFFF`,
                        pointerEvents: 'none',
                        zIndex: 7,
                        transition: 'left 60ms linear',
                      }}
                    />
                  )}
                </>
              );
            })()}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 500, color: 'var(--ink-2)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
            <span>{fmtTC(beatProgress * beat.duration * 1000)}</span>
            <span style={{ color: 'var(--ink-2)' }}>/ {fmtTC(beat.duration * 1000)}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(20,18,15,0.08)' }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: 'var(--ink-2)', width: 40 }}>VOL</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PSlider value={beatVol} onChange={setBeatVol} />
            </div>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, color: 'var(--ink-0)', fontVariantNumeric: 'tabular-nums', width: 26, textAlign: 'right' }}>{beatVol}</span>
          </div>
        </div>

        {/* ── RECORD METER BOX (unified deck card: VU + LED timecode + peak) ── */}
        <div style={{ background: 'var(--deck)', border: 'none', borderRadius: 14, padding: 14, position: 'relative', zIndex: 3, boxShadow: '0 6px 24px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.30)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: recording ? 'var(--spot)' : '#7EC37A', boxShadow: recording ? '0 0 6px rgba(217,58,28,.9)' : '0 0 4px rgba(126,195,122,.7)', animation: recording ? 'pulse-dot 1s infinite' : undefined }} />
              <span style={{ fontFamily: 'Space Mono,monospace', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: '#F0EBDF' }}>TAPE IN</span>
            </div>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.14em', color: '#C9C5BC' }}>DECK-01</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <VUMeter level={recorder.level} width={280} />
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <SegDisplay text={tc} size={34} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <PeakMeter level={recorder.level} />
              </div>
              {clip && <span style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--spot)', animation: 'clip-flash 200ms ease 3' }}>CLIP</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Space Mono,monospace', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: '#C9C5BC' }}>
              <span>-24dB</span>
              <span>PEAK</span>
              <span style={{ color: 'var(--spot)' }}>0dB</span>
            </div>
          </div>
        </div>

        {/* ── MIC GAIN — always visible, even while recording ── */}
        <div style={{ background: 'var(--paper-1)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 3, boxShadow: 'var(--elev-1)' }}>
          <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: recording ? 'var(--spot)' : 'var(--ink-2)', width: 60 }}>MIC GAIN</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PSlider value={inputGain} onChange={setInputGain} />
          </div>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, color: 'var(--ink-0)', fontVariantNumeric: 'tabular-nums', width: 26, textAlign: 'right' }}>{inputGain}</span>
        </div>

        {/* ── PENDING TAKE: listen + KEEP / RETAKE / DISCARD ── */}
        {pending && (
          <div style={{ background: 'var(--paper-1)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 3, boxShadow: 'var(--elev-2)', animation: 'paper-in 220ms var(--ease-io) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => void togglePendingPlay()}
                style={{ all: 'unset', cursor: 'pointer', width: 36, height: 36, borderRadius: '50%', background: pendingPlaying ? 'var(--spot)' : 'var(--paper-0)', border: 'none', boxShadow: pendingPlaying ? '0 4px 12px rgba(217,58,28,.30)' : 'var(--elev-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                type="button"
                title={pendingPlaying ? 'Stop' : 'Play take'}
              >
                <Icon name={pendingPlaying ? 'stop' : 'play'} size={14} color={pendingPlaying ? '#F0EBDF' : 'var(--ink-0)'} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: 'var(--spot)' }}>TAKE READY</div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: 'var(--ink-1)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtTC(pending.durationMs)} · @{fmtTC(pending.beatStartMs)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={discardPending} style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--ink-1)', background: 'rgba(20,18,15,.06)', border: 'none', borderRadius: 20, padding: '8px 16px' }} type="button">DISCARD</button>
              <button onClick={() => void retakePending()} style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--ink-0)', background: 'var(--paper-0)', border: '1px solid var(--border-medium)', borderRadius: 20, padding: '8px 16px' }} type="button">RETAKE</button>
              <button onClick={keepPending} style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: '#F0EBDF', background: 'var(--spot)', border: 'none', borderRadius: 20, padding: '8px 16px', boxShadow: '0 2px 8px rgba(217,58,28,.30)' }} type="button">KEEP</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
