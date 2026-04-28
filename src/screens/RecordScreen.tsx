import { useEffect, useRef, useState } from 'react';
import type { Beat, Take } from '../types';
import { fmtTC } from '../lib/format';
import { Icon, IconBtn, Grain } from '../components/Icon';
import { Sheet, MenuRow, ScreenHeader, Stamp, PSwitch, PSlider } from '../components/primitives';
import { Waveform, SpoolWaveform, VUMeter, SegDisplay, PeakMeter } from '../components/audio-visuals';
import { useRecorder } from '../hooks/useRecorder';
import { useWakeLock } from '../hooks/useWakeLock';
import { loadAudioBlob } from '../db/queries';
import { createPlayback, type PlaybackController } from '../audio/context';
import { scheduleCountIn, startMetronome } from '../audio/metronome';

export interface RecordController {
  start: () => void;
  stop: () => void;
  counting: number;
}

interface FinishTakePayload {
  durationMs: number;
  blob: Blob | null;
  mimeType: string;
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
  const [inputGain, setInputGain] = useState(65);
  const [moreOpen, setMoreOpen] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [countIn, setCountIn] = useState(true);
  const [counting, setCounting] = useState(0);
  const [clip, setClip] = useState(false);
  const [beatProgress, setBeatProgress] = useState(0);
  const [beatPlaying, setBeatPlaying] = useState(false);
  const beatRef = useRef<number | null>(null);
  const clipTimeoutRef = useRef<number | null>(null);
  const beatPlayerRef = useRef<PlaybackController | null>(null);
  const metronomeStopRef = useRef<(() => void) | null>(null);

  // Keep the screen awake while recording or holding the mic open (best-effort).
  useWakeLock(recorder.recording || recorder.ready);

  // Load beat audio blob into a shared-AudioContext playback (silent-switch-safe)
  useEffect(() => {
    if (!beat.audioBlobKey) return;
    let cancelled = false;
    loadAudioBlob(beat.audioBlobKey).then((blob) => {
      if (cancelled || !blob) return;
      beatPlayerRef.current = createPlayback(blob, { loop: true, volume: 0.85 });
    });
    return () => {
      cancelled = true;
      beatPlayerRef.current?.destroy();
      beatPlayerRef.current = null;
    };
  }, [beat.audioBlobKey]);

  // Stable refs for callback props to avoid effect dependency churn
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const onRecordingChangeRef = useRef(onRecordingChange);
  onRecordingChangeRef.current = onRecordingChange;
  const onCountingChangeRef = useRef(onCountingChange);
  onCountingChangeRef.current = onCountingChange;
  const onFinishTakeRef = useRef(onFinishTake);
  onFinishTakeRef.current = onFinishTake;

  // Beat progress tracker while recording
  useEffect(() => {
    if (recorder.recording) {
      const tick = window.setInterval(() => {
        setBeatProgress((p) => {
          const n = p + 60 / (beat.duration * 1000) / 16.67;
          return n >= 1 ? 0 : n;
        });
      }, 60);
      return () => clearInterval(tick);
    }
  }, [recorder.recording, beat.duration]);

  // Clip indicator — checked during render to avoid effect-driven loop
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

  // Beat playback (preview when not recording) — routed through shared AudioContext
  useEffect(() => {
    const player = beatPlayerRef.current;
    if (beatPlaying && !recorder.recording) {
      if (player) {
        player.audioEl.loop = false;
        player.seek(beatProgress * beat.duration);
        player.play().catch(() => {});
        player.audioEl.onended = () => {
          setBeatPlaying(false);
          setBeatProgress(0);
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
            setBeatProgress(0);
          } else {
            setBeatProgress(p);
          }
        } else {
          const p = (Date.now() - start) / dur;
          if (p >= 1) {
            setBeatPlaying(false);
            setBeatProgress(0);
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

  // Play beat audio during recording (looped, silent-switch-bypass via AudioContext)
  useEffect(() => {
    const player = beatPlayerRef.current;
    if (!player) return;
    if (recorder.recording) {
      player.audioEl.loop = true;
      player.seek(0);
      player.play().catch(() => {});
    } else {
      player.pause();
    }
  }, [recorder.recording]);

  useEffect(() => {
    onRecordingChangeRef.current?.(recorder.recording);
  }, [recorder.recording]);

  useEffect(() => {
    if (recorder.error) {
      showToastRef.current(recorder.error);
    }
  }, [recorder.error]);

  const beginRecording = async () => {
    // Phase 1 (must be on the user gesture): acquire mic + unlock AudioContext.
    await recorder.acquire();
    if (recorder.error) return; // bail if permission was denied

    // Start continuous metronome if enabled
    if (metronome) {
      metronomeStopRef.current?.();
      metronomeStopRef.current = startMetronome(beat.bpm, 0.4);
    }

    if (countIn) {
      const beat_ms = Math.round(60000 / beat.bpm);
      // Schedule the click sound on the audio clock (sample-accurate)
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
          // Phase 2: begin actual capture. Safe from setTimeout because
          // permission + AudioContext are already live from the gesture.
          recorder.beginCapture();
        }
      };
      window.setTimeout(tickVisual, beat_ms);
    } else {
      recorder.beginCapture();
    }
  };

  // Pending take after stop — user gets KEEP / RETAKE / DISCARD before commit
  const [pending, setPending] = useState<{ blob: Blob; durationMs: number; mimeType: string } | null>(null);
  const autoKeepTimerRef = useRef<number | null>(null);

  const commitPending = (p: { blob: Blob; durationMs: number; mimeType: string }) => {
    onFinishTakeRef.current({ durationMs: p.durationMs, blob: p.blob, mimeType: p.mimeType });
    setPending(null);
  };

  const stopAndSave = async () => {
    if (!recorder.recording) return;
    metronomeStopRef.current?.();
    metronomeStopRef.current = null;
    const result = await recorder.stop();
    if (!result) return;
    setPending(result);
    // Auto-keep after 5 s if user doesn't explicitly choose
    if (autoKeepTimerRef.current) clearTimeout(autoKeepTimerRef.current);
    autoKeepTimerRef.current = window.setTimeout(() => {
      commitPending(result);
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
    };
  }, []);

  // Stop the metronome when this screen unmounts
  useEffect(() => {
    return () => {
      metronomeStopRef.current?.();
      metronomeStopRef.current = null;
    };
  }, []);

  // Register controller for TabBar
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

  const nextTake = takes.length + 1;
  const tc = fmtTC(recorder.elapsedMs);
  const recording = recorder.recording;

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

      <div style={{ flexShrink: 0, padding: '0 20px', background: 'var(--paper-0)', position: 'relative', zIndex: 5 }}>
        <ScreenHeader
          left={<IconBtn name="back" onClick={() => { if (!recording) onBack(); }} title="Back" style={{ opacity: recording ? 0.3 : 1, cursor: recording ? 'not-allowed' : 'pointer' }} />}
          title={recording ? `● TAKE ${String(nextTake).padStart(2, '0')}` : 'READY'}
          right={<IconBtn name="more" onClick={() => setMoreOpen(true)} title="Options" />}
        />
      </div>

      {recorder.error && /denied|permission/i.test(recorder.error) && (
        <div
          style={{
            margin: '6px 20px 8px',
            background: 'var(--paper-1)',
            border: '2px solid var(--spot)',
            borderRadius: 6,
            padding: '12px 14px',
            position: 'relative',
            zIndex: 8,
            boxShadow: '3px 3px 0 var(--shadow)',
          }}
        >
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
            onClick={() => void recorder.acquire()}
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '.08em',
              color: '#F0EBDF',
              background: 'var(--spot)',
              border: '2px solid var(--line-0)',
              borderRadius: 4,
              padding: '6px 14px',
              boxShadow: '2px 2px 0 var(--shadow)',
            }}
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
        <MenuRow icon="mic" label="Input Device" hint="Built-in mic" />
        <MenuRow icon="cassette" label="Monitor While Recording" hint="Off · avoids feedback" />
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

      {pending && (
        <div
          style={{
            margin: '4px 20px 8px',
            background: 'var(--paper-1)',
            border: '2px solid var(--line-0)',
            borderRadius: 6,
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '3px 3px 0 var(--shadow)',
            position: 'relative',
            zIndex: 8,
            animation: 'paper-in 220ms var(--ease-io) both',
          }}
        >
          <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: 'var(--spot)', flex: 1 }}>
            TAKE READY · {fmtTC(pending.durationMs)}
          </span>
          <button
            onClick={discardPending}
            style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--ink-2)', border: '1.5px solid var(--ink-2)', borderRadius: 4, padding: '4px 8px' }}
            type="button"
          >
            DISCARD
          </button>
          <button
            onClick={() => void retakePending()}
            style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--ink-0)', border: '1.5px solid var(--ink-0)', borderRadius: 4, padding: '4px 8px' }}
            type="button"
          >
            RETAKE
          </button>
          <button
            onClick={keepPending}
            style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: '#F0EBDF', background: 'var(--spot)', border: '1.5px solid var(--line-0)', borderRadius: 4, padding: '4px 10px' }}
            type="button"
          >
            KEEP
          </button>
        </div>
      )}

      <div className="scroll-body" style={{ padding: '4px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-1)', border: '2px solid var(--line-0)', borderRadius: 5, padding: '8px 10px', marginBottom: 8, position: 'relative', zIndex: 3 }}>
          <div style={{ width: 24, height: 24, background: 'var(--spot)', border: '1.5px solid var(--line-0)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, color: '#F0EBDF' }}>{beat.side}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 12, letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{beat.title}</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'var(--ink-2)', letterSpacing: '.1em' }}>{beat.bpm} BPM · {beat.key}</div>
          </div>
          {takes.length > 0 && <Stamp rotate={-2}>{takes.length} TK</Stamp>}
        </div>

        <div style={{ marginBottom: 10, position: 'relative', zIndex: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)' }}>
              BEAT ▸{' '}
              {beatPlaying ? (
                <span style={{ color: 'var(--spot)' }}>PLAYING</span>
              ) : recording ? (
                <span style={{ color: 'var(--spot)', animation: 'blink 1s infinite' }}>ROLLING</span>
              ) : (
                'SCRUB'
              )}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtTC(beatProgress * beat.duration * 1000)}
              </span>
              <button
                onClick={() => !recording && setBeatPlaying((p) => !p)}
                style={{ all: 'unset', cursor: recording ? 'default' : 'pointer', width: 20, height: 20, borderRadius: '50%', background: 'var(--paper-1)', border: '1.5px solid var(--line-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: recording ? 0.5 : 1 }}
                type="button"
              >
                <Icon name={beatPlaying ? 'pause' : 'play'} size={10} color="var(--ink-0)" />
              </button>
            </div>
          </div>
          <Waveform
            progress={beatProgress}
            seed={beat.bpm * 2}
            height={38}
            bars={60}
            color="var(--spot)"
            restColor="var(--ink-3)"
            onScrub={
              !recording
                ? (p: number) => {
                    setBeatProgress(p);
                    setBeatPlaying(false);
                    if (beatPlayerRef.current) {
                      beatPlayerRef.current.seek(p * (beatPlayerRef.current.duration() || beat.duration));
                    }
                  }
                : null
            }
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 500, color: 'var(--ink-2)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
            <span>{fmtTC(beatProgress * beat.duration * 1000)}</span>
            <span>-{fmtTC((1 - beatProgress) * beat.duration * 1000)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, position: 'relative', zIndex: 3 }}>
          <VUMeter level={recorder.level} width={296} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, position: 'relative', zIndex: 3 }}>
          <SegDisplay text={tc} size={34} />
        </div>

        <div style={{ marginBottom: 6, position: 'relative', zIndex: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <PeakMeter level={recorder.level} />
            {clip && <span style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--spot)', animation: 'clip-flash 200ms ease 3' }}>CLIP</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Space Mono,monospace', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)' }}>
            <span>-24dB</span>
            <span>PEAK</span>
            <span style={{ color: 'var(--spot)' }}>0dB</span>
          </div>
        </div>

        <div style={{ marginTop: 8, marginBottom: 10, position: 'relative', zIndex: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)' }}>
              VOCAL ▸{' '}
              {recording ? <span style={{ color: 'var(--spot)', animation: 'blink 1s infinite' }}>● ROLLING</span> : 'STOP'}
            </span>
          </div>
          <SpoolWaveform elapsed={recording ? recorder.elapsedMs : 0} seed={beat.bpm} />
        </div>

        <div style={{ marginBottom: 8, position: 'relative', zIndex: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)' }}>MIC ▸ GAIN</span>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, color: 'var(--ink-0)', fontVariantNumeric: 'tabular-nums' }}>{inputGain}</span>
          </div>
          <PSlider value={inputGain} onChange={setInputGain} />
        </div>
      </div>
    </div>
  );
};
