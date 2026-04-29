import { useEffect, useRef, useState } from 'react';
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
  const [countIn, setCountIn] = useState(true);

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

  const refreshDevices = async () => {
    setDevices(await listInputDevices());
  };

  // Keep the screen awake while recording or holding the mic open.
  useWakeLock(recorder.recording || recorder.ready);

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
      // Beat plays once from the cue position. If recording exceeds the
      // beat length, the beat just ends — take continues over silence.
      player.audioEl.loop = false;
      const startSec = cueProgress * beat.duration;
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
      if (beatRef.current) {
        clearInterval(beatRef.current);
        beatRef.current = null;
      }
      // When stop, snap playhead back to the cue.
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
    // Phase 1 (must be on the user gesture): mic + AudioContext.
    await recorder.acquire({
      deviceId: inputDeviceId ?? undefined,
      gain: inputGain / 50,
      monitor,
    });
    if (recorder.error) return;
    void refreshDevices();

    // Lock the beat start position to the current cue.
    recordStartBeatMsRef.current = Math.round(cueProgress * beat.duration * 1000);

    if (metronome) {
      metronomeStopRef.current?.();
      metronomeStopRef.current = startMetronome(beat.bpm, 0.4);
    }

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
          recorder.beginCapture();
        }
      };
      window.setTimeout(tickVisual, beat_ms);
    } else {
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

  const commitPending = (p: {
    blob: Blob;
    durationMs: number;
    mimeType: string;
    beatStartMs: number;
    beatEndMs: number;
  }) => {
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
    // Capture the beat playhead at the moment we stop — this is where the take ends
    // on the beat timeline.
    const player = beatPlayerRef.current;
    const stopBeatMs = player
      ? Math.round((player.currentTime() / Math.max(player.duration(), 0.0001)) * beat.duration * 1000)
      : recordStartBeatMsRef.current;
    const result = await recorder.stop();
    if (!result) return;
    const beatStartMs = recordStartBeatMsRef.current;
    const beatEndMs = Math.max(beatStartMs, stopBeatMs);
    const payload = { ...result, beatStartMs, beatEndMs };
    setPending(payload);
    if (autoKeepTimerRef.current) clearTimeout(autoKeepTimerRef.current);
    autoKeepTimerRef.current = window.setTimeout(() => {
      commitPending(payload);
    }, 5000);
  };

  const keepPending = () => {
    if (!pending) return;
    if (autoKeepTimerRef.current) clearTimeout(autoKeepTimerRef.current);
    commitPending(pending);
  };

  const discardPending = () => {
    if (autoKeepTimerRef.current) clearTimeout(autoKeepTimerRef.current);
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
        <div style={{ margin: '6px 20px 8px', background: 'var(--paper-1)', border: '2px solid var(--spot)', borderRadius: 6, padding: '12px 14px', position: 'relative', zIndex: 8, boxShadow: '3px 3px 0 var(--shadow)' }}>
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
            style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 11, letterSpacing: '.08em', color: '#F0EBDF', background: 'var(--spot)', border: '2px solid var(--line-0)', borderRadius: 4, padding: '6px 14px', boxShadow: '2px 2px 0 var(--shadow)' }}
            type="button"
          >
            ▸ TRY AGAIN
          </button>
        </div>
      )}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="RECORD OPTIONS">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px dashed color-mix(in srgb,var(--ink-0) 25%,transparent)' }}>
          <div style={{ width: 28, height: 28, border: '1.5px solid var(--line-0)', borderRadius: 5, background: 'var(--paper-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="cassette" size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 12, letterSpacing: '.04em', textTransform: 'uppercase' }}>Metronome</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', marginTop: 2 }}>{beat.bpm} BPM click</div>
          </div>
          <PSwitch on={metronome} onChange={setMetronome} size="sm" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px dashed color-mix(in srgb,var(--ink-0) 25%,transparent)' }}>
          <div style={{ width: 28, height: 28, border: '1.5px solid var(--line-0)', borderRadius: 5, background: 'var(--paper-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="play" size={12} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 12, letterSpacing: '.04em', textTransform: 'uppercase' }}>4-Beat Count-In</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', marginTop: 2 }}>One bar before record</div>
          </div>
          <PSwitch on={countIn} onChange={setCountIn} size="sm" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px dashed color-mix(in srgb,var(--ink-0) 25%,transparent)' }}>
          <div style={{ width: 28, height: 28, border: '1.5px solid var(--line-0)', borderRadius: 5, background: 'var(--paper-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

      {pending && (
        <div style={{ margin: '4px 20px 8px', background: 'var(--paper-1)', border: '2px solid var(--line-0)', borderRadius: 6, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '3px 3px 0 var(--shadow)', position: 'relative', zIndex: 8, animation: 'paper-in 220ms var(--ease-io) both' }}>
          <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: 'var(--spot)', flex: 1 }}>
            TAKE READY · {fmtTC(pending.durationMs)} · @{fmtTC(pending.beatStartMs)}
          </span>
          <button onClick={discardPending} style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--ink-2)', border: '1.5px solid var(--ink-2)', borderRadius: 4, padding: '4px 8px' }} type="button">DISCARD</button>
          <button onClick={() => void retakePending()} style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--ink-0)', border: '1.5px solid var(--ink-0)', borderRadius: 4, padding: '4px 8px' }} type="button">RETAKE</button>
          <button onClick={keepPending} style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: '#F0EBDF', background: 'var(--spot)', border: '1.5px solid var(--line-0)', borderRadius: 4, padding: '4px 10px' }} type="button">KEEP</button>
        </div>
      )}

      <div className="scroll-body" style={{ padding: '4px 20px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* ── BEAT PILL ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-1)', border: '2px solid var(--line-0)', borderRadius: 5, padding: '8px 10px', position: 'relative', zIndex: 3 }}>
          <div style={{ width: 24, height: 24, background: 'var(--spot)', border: '1.5px solid var(--line-0)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, color: '#F0EBDF' }}>{beat.side}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 12, letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{beat.title}</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'var(--ink-2)', letterSpacing: '.1em' }}>{beat.bpm} BPM · {beat.key}</div>
          </div>
          {takes.length > 0 && <Stamp rotate={-2}>{takes.length} TK</Stamp>}
        </div>

        {/* ── BEAT WAVEFORM + CUE MARKER ── */}
        <div style={{ position: 'relative', zIndex: 3 }}>
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
                style={{ all: 'unset', cursor: recording ? 'default' : 'pointer', width: 22, height: 22, borderRadius: '50%', background: 'var(--paper-1)', border: '1.5px solid var(--line-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: recording ? 0.4 : 1 }}
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
                !recording
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
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 500, color: 'var(--ink-2)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
            <span>{fmtTC(beatProgress * beat.duration * 1000)}</span>
            <span style={{ color: 'var(--ink-2)' }}>/ {fmtTC(beat.duration * 1000)}</span>
          </div>
        </div>

        {/* ── TAPE COUNTER ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 3 }}>
          <SegDisplay text={tc} size={34} />
        </div>

        {/* ── VU METER ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 3 }}>
          <VUMeter level={recorder.level} width={280} />
        </div>

        {/* ── PEAK METER ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', zIndex: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PeakMeter level={recorder.level} />
            {clip && <span style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--spot)', animation: 'clip-flash 200ms ease 3' }}>CLIP</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Space Mono,monospace', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)' }}>
            <span>-24dB</span>
            <span>PEAK</span>
            <span style={{ color: 'var(--spot)' }}>0dB</span>
          </div>
        </div>

        {/* ── BEAT VOL + MIC GAIN — always visible, even while recording ── */}
        <div style={{ background: 'var(--paper-1)', border: '2px solid var(--line-0)', borderRadius: 5, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: 'var(--ink-2)', width: 60 }}>BEAT</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PSlider value={beatVol} onChange={setBeatVol} />
            </div>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, color: 'var(--ink-0)', fontVariantNumeric: 'tabular-nums', width: 26, textAlign: 'right' }}>{beatVol}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: recording ? 'var(--spot)' : 'var(--ink-2)', width: 60 }}>MIC GAIN</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PSlider value={inputGain} onChange={setInputGain} />
            </div>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, color: 'var(--ink-0)', fontVariantNumeric: 'tabular-nums', width: 26, textAlign: 'right' }}>{inputGain}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
