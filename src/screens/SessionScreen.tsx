import { useEffect, useMemo, useRef, useState } from 'react';
import type { Beat, Take } from '../types';
import { fmtTC } from '../lib/format';
import { Icon, IconBtn, Grain } from '../components/Icon';
import { Sheet, MenuRow, PushBtn, ScreenHeader, Stamp, PSwitch, PSlider } from '../components/primitives';
import { Waveform } from '../components/audio-visuals';
import { SwipeRow } from '../components/SwipeRow';
import { loadAudioBlob } from '../db/queries';
import { createPlayback, type PlaybackController } from '../audio/context';
import { createLiveMix, type LiveMix } from '../audio/live-mix';
import { renderMix, downloadBlob } from '../audio/mix-export';
import { shareFile } from '../lib/share';
import { haptics } from '../lib/haptics';

const TIMING_RANGE_MS = 500;
const TIMING_STEP_MS = 10;

interface Props {
  beat: Beat;
  takes: Take[];
  sessionId: string | null;
  onBack: () => void;
  onNewTake: () => void;
  onExport: () => void;
  onUpdateTake: (id: string, patch: Partial<Take>) => void;
  onDeleteTake: (id: string) => void;
  onDeleteSession: () => void;
  onDuplicateSession: () => Promise<void>;
  showToast: (msg: string) => void;
  sessionName: string;
  onRenameSession: (name: string) => void;
  autoRenameTakeId?: string | null;
  onAutoRenameConsumed?: () => void;
}

export const SessionScreen = ({
  beat,
  takes,
  sessionId,
  onBack,
  onNewTake,
  onExport,
  onUpdateTake,
  onDeleteTake,
  onDeleteSession,
  onDuplicateSession,
  showToast,
  sessionName,
  onRenameSession,
  autoRenameTakeId,
  onAutoRenameConsumed,
}: Props) => {
  const [beatVol, setBeatVol] = useState(70);
  const [beatProgress, setBeatProgress] = useState(0);
  const [beatPlaying, setBeatPlaying] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(sessionName);
  const [sharing, setSharing] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [takeSheetId, setTakeSheetId] = useState<string | null>(null);
  const [takeDeleteConfirm, setTakeDeleteConfirm] = useState(false);
  // Snapshot of beatStartMs at the moment the take was selected. Stays fixed for the whole session.
  const [baselineMs, setBaselineMs] = useState(0);
  // Cumulative committed adjustment (ms) since selection — survives across slider releases / +/- taps.
  const [committedDelta, setCommittedDelta] = useState(0);
  // Uncommitted drag delta (ms) — only non-zero while the slider thumb is being dragged.
  const [pendingDelta, setPendingDelta] = useState(0);
  // The take currently rendered in the expanded strip — lags one frame behind selectedId
  // so collapse-out can animate while still showing the take's data.
  const [renderedTakeId, setRenderedTakeId] = useState<string | null>(null);

  const beatPlayerRef = useRef<PlaybackController | null>(null);
  const beatRef = useRef<number | null>(null);

  const mixRef = useRef<LiveMix | null>(null);
  const mixTakeMapRef = useRef<string[]>([]);
  const [mixPlaying, setMixPlaying] = useState(false);
  const [mixLoading, setMixLoading] = useState(false);
  const [mixTimeSec, setMixTimeSec] = useState(0);

  const loopRef = useRef<LiveMix | null>(null);
  const loopWindowRef = useRef<{ startSec: number; endSec: number } | null>(null);
  const [loopPlaying, setLoopPlaying] = useState(false);

  const selectedTake = useMemo(
    () => (selectedId ? takes.find((t) => t.id === selectedId) ?? null : null),
    [selectedId, takes],
  );

  const renderedTake = useMemo(
    () => (renderedTakeId ? takes.find((t) => t.id === renderedTakeId) ?? null : null),
    [renderedTakeId, takes],
  );

  const sheetTake = useMemo(
    () => (takeSheetId ? takes.find((t) => t.id === takeSheetId) ?? null : null),
    [takeSheetId, takes],
  );

  // Load the beat blob into a shared-AudioContext player so the BEAT bar can scrub real audio.
  useEffect(() => {
    if (!beat.audioBlobKey) return;
    let cancelled = false;
    loadAudioBlob(beat.audioBlobKey).then((blob) => {
      if (cancelled || !blob) return;
      beatPlayerRef.current = createPlayback(blob, { volume: beatVol / 100 });
      beatPlayerRef.current.audioEl.addEventListener('ended', () => {
        setBeatPlaying(false);
        setBeatProgress(0);
      });
    });
    return () => {
      cancelled = true;
      beatPlayerRef.current?.destroy();
      beatPlayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat.audioBlobKey]);

  useEffect(() => {
    beatPlayerRef.current?.setVolume(beatVol / 100);
    if (mixPlaying) mixRef.current?.setVolume(0, beatVol / 100);
    if (loopPlaying) loopRef.current?.setVolume(0, beatVol / 100);
  }, [beatVol, mixPlaying, loopPlaying]);

  const handleShare = async () => {
    if (sharing) return;
    const enabled = takes.filter((t) => t.enabled && t.audioBlobKey);
    if (enabled.length === 0 && !beat.audioBlobKey) {
      showToast('Nothing to share — record or load a beat first');
      return;
    }
    setSharing(true);
    showToast('Bouncing mix…');
    try {
      const beatBlob = beat.audioBlobKey ? await loadAudioBlob(beat.audioBlobKey) : undefined;
      const mixBlob = await renderMix({ takes, beatBlob, mode: 'full' });
      const safeBeat = beat.title.replace(/[^a-z0-9]+/gi, '_');
      const safeName = sessionName.replace(/[^a-z0-9]+/gi, '_') || 'session';
      const filename = `${safeBeat}__${safeName}.wav`;
      const result = await shareFile(mixBlob, filename, { title: `${beat.title} — ${sessionName}` });
      if (result === 'shared') showToast('Shared');
      else if (result === 'downloaded') showToast('Downloaded — share from Files');
      else {
        downloadBlob(mixBlob, filename);
        showToast('Downloaded');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Share failed');
    } finally {
      setSharing(false);
    }
  };

  const handleDuplicate = async () => {
    setMoreOpen(false);
    showToast('Duplicating session…');
    await onDuplicateSession();
  };

  const stopFullMix = () => {
    mixRef.current?.pause();
    setMixPlaying(false);
    setBeatProgress(0);
    setMixTimeSec(0);
  };

  const startMix = async () => {
    if (mixPlaying) {
      stopFullMix();
      return;
    }
    if (!beat.audioBlobKey) {
      showToast('No beat audio to mix');
      return;
    }
    const enabled = takes.filter((t) => t.enabled && t.audioBlobKey);
    if (enabled.length === 0) {
      showToast('Enable at least one take');
      return;
    }
    teardownLoop();
    setMixLoading(true);
    try {
      const beatBlob = await loadAudioBlob(beat.audioBlobKey);
      if (!beatBlob) throw new Error('Beat audio missing');
      const takeBlobs = await Promise.all(
        enabled.map(async (t) => ({ blob: await loadAudioBlob(t.audioBlobKey as string), take: t })),
      );
      const validTakes = takeBlobs.filter((tb): tb is { blob: Blob; take: typeof enabled[0] } => !!tb.blob);
      const sources = [
        { blob: beatBlob, volume: beatVol / 100, loop: false, offsetSec: 0 },
        ...validTakes.map((tb) => ({
          blob: tb.blob,
          volume: tb.take.volume / 100,
          loop: false,
          offsetSec: (tb.take.beatStartMs ?? 0) / 1000,
        })),
      ];
      mixTakeMapRef.current = validTakes.map((tb) => tb.take.id);
      mixRef.current?.destroy();
      const mix = createLiveMix(sources);
      mix.onEnded = () => {
        setMixPlaying(false);
        setBeatProgress(0);
        setMixTimeSec(0);
      };
      mix.onProgress = (sec) => {
        const d = mix.duration();
        if (d > 0) setBeatProgress(Math.min(1, sec / d));
        setMixTimeSec(sec);
      };
      mixRef.current = mix;
      await mix.play();
      setMixPlaying(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Mix preview failed');
    } finally {
      setMixLoading(false);
    }
  };

  const getMixIdx = (takeId: string): number | null => {
    const idx = mixTakeMapRef.current.indexOf(takeId);
    return idx >= 0 ? idx + 1 : null;
  };

  useEffect(() => {
    return () => {
      mixRef.current?.destroy();
      mixRef.current = null;
      loopRef.current?.destroy();
      loopRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!autoRenameTakeId) return;
    const take = takes.find((t) => t.id === autoRenameTakeId);
    if (!take) return;
    setEditingId(take.id);
    setEditLabel(take.label || `Take ${takes.indexOf(take) + 1}`);
    onAutoRenameConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRenameTakeId, takes]);

  // Beat-only progress driver (only when no take selected and no mix/loop running).
  useEffect(() => {
    const player = beatPlayerRef.current;
    if (beatPlaying) {
      if (player) {
        const seekSec = beatProgress * (player.duration() || beat.duration);
        player.seek(seekSec);
        player.play().catch((e) => {
          console.warn('[SessionScreen] beat play failed', e);
          setBeatPlaying(false);
        });
      }
      const dur = beat.duration * 1000;
      const start = Date.now() - beatProgress * dur;
      beatRef.current = window.setInterval(() => {
        if (player) {
          const d = player.duration();
          if (d > 0 && isFinite(d)) {
            const p = player.currentTime() / d;
            if (p >= 1) {
              setBeatPlaying(false);
              setBeatProgress(0);
            } else {
              setBeatProgress(p);
            }
            return;
          }
        }
        const p = (Date.now() - start) / dur;
        if (p >= 1) {
          setBeatPlaying(false);
          setBeatProgress(0);
        } else {
          setBeatProgress(p);
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
  }, [beatPlaying]);

  // ── Loop preview (active while a take is selected) ──
  const teardownLoop = () => {
    loopRef.current?.destroy();
    loopRef.current = null;
    loopWindowRef.current = null;
    setLoopPlaying(false);
  };

  /** Loop bounds = exactly the highlighted vocal region (offsetSec → offsetSec + duration). */
  const updateLoopWindow = (offsetSec: number, durationMs: number) => {
    const startSec = Math.max(0, offsetSec);
    const endSec = startSec + durationMs / 1000;
    loopWindowRef.current = { startSec, endSec };
    if (loopRef.current) {
      loopRef.current.setOffset(1, offsetSec);
      const cur = loopRef.current.currentTime();
      if (cur < startSec || cur >= endSec) loopRef.current.seek(startSec);
    }
  };

  const startLoop = async (take: Take) => {
    if (!beat.audioBlobKey || !take.audioBlobKey) return;
    if (mixPlaying) stopFullMix();
    if (beatPlaying) setBeatPlaying(false);
    teardownLoop();
    try {
      const beatBlob = await loadAudioBlob(beat.audioBlobKey);
      const takeBlob = await loadAudioBlob(take.audioBlobKey);
      if (!beatBlob || !takeBlob) {
        showToast('Audio missing');
        return;
      }
      const offsetSec = (take.beatStartMs ?? 0) / 1000;
      const startSec = Math.max(0, offsetSec);
      const endSec = startSec + take.durationMs / 1000;
      const mix = createLiveMix([
        { blob: beatBlob, volume: beatVol / 100, loop: false, offsetSec: 0 },
        { blob: takeBlob, volume: (take.volume ?? 80) / 100, loop: false, offsetSec },
      ]);
      mix.onProgress = (sec) => {
        const w = loopWindowRef.current;
        if (!w) return;
        if (sec >= w.endSec) {
          mix.seek(w.startSec);
          return;
        }
        const beatTotal = beat.duration;
        if (beatTotal > 0) setBeatProgress(Math.min(1, Math.max(0, sec / beatTotal)));
      };
      loopWindowRef.current = { startSec, endSec };
      loopRef.current = mix;
      mix.seek(startSec);
      await mix.play();
      setLoopPlaying(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Loop failed');
      teardownLoop();
    }
  };

  // Keep the loop window in sync whenever beatStartMs commits or take changes.
  useEffect(() => {
    if (!selectedTake || !loopRef.current) return;
    updateLoopWindow((selectedTake.beatStartMs ?? 0) / 1000, selectedTake.durationMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTake?.beatStartMs, selectedTake?.durationMs, selectedTake?.id]);

  // Tear down loop on deselect.
  useEffect(() => {
    if (!selectedId) {
      teardownLoop();
      setBaselineMs(0);
      setCommittedDelta(0);
      setPendingDelta(0);
      setBeatProgress(0);
    } else {
      setRenderedTakeId(selectedId);
    }
  }, [selectedId]);

  const selectTake = (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    const t = takes.find((x) => x.id === id);
    if (!t) return;
    setSelectedId(id);
    setBaselineMs(t.beatStartMs ?? 0);
    setCommittedDelta(0);
    setPendingDelta(0);
    void startLoop(t);
  };

  /**
   * Commits any in-progress drag delta + an optional extra step (from +/- buttons) into committedDelta,
   * persists the resulting beatStartMs, and resets pendingDelta. Cumulative committedDelta is preserved.
   */
  const commitTimingDelta = (extraMs = 0) => {
    if (!selectedTake) return;
    const total = pendingDelta + extraMs;
    if (total === 0) return;
    const newCommitted = committedDelta + total;
    const next = Math.max(0, baselineMs + newCommitted);
    onUpdateTake(selectedTake.id, { beatStartMs: next });
    setCommittedDelta(newCommitted);
    setPendingDelta(0);
    updateLoopWindow(next / 1000, selectedTake.durationMs);
    if (mixPlaying) {
      const mi = getMixIdx(selectedTake.id);
      if (mi !== null) mixRef.current?.setOffset(mi, next / 1000);
    }
  };

  const onTimingSliderChange = (sliderValue: number) => {
    const drag = sliderValue * TIMING_STEP_MS;
    setPendingDelta(drag);
    if (!selectedTake) return;
    const next = Math.max(0, baselineMs + committedDelta + drag);
    updateLoopWindow(next / 1000, selectedTake.durationMs);
    if (mixPlaying) {
      const mi = getMixIdx(selectedTake.id);
      if (mi !== null) mixRef.current?.setOffset(mi, next / 1000);
    }
  };

  const overlayRect = (offsetMs: number, durationMs: number) => {
    const totalMs = beat.duration * 1000;
    if (totalMs <= 0) return { left: 0, width: 0 };
    const left = Math.max(0, Math.min(100, (offsetMs / totalMs) * 100));
    const width = Math.max(0, Math.min(100 - left, (durationMs / totalMs) * 100));
    return { left, width };
  };

  // Use renderedTake so the overlay/strip can finish their collapse animation with valid data.
  const stripTake = selectedTake ?? renderedTake;
  // Total adjustment shown to the user (orange ms text) — committed + currently-dragging.
  const totalDelta = selectedTake ? committedDelta + pendingDelta : 0;
  // Where the take's start currently sits on the beat timeline (for overlay + absolute readout).
  const previewMs = selectedTake
    ? Math.max(0, baselineMs + committedDelta + pendingDelta)
    : (stripTake?.beatStartMs ?? 0);
  const overlay = stripTake ? overlayRect(previewMs, stripTake.durationMs) : { left: 0, width: 0 };

  // The play button on the beat card toggles loop when a take is selected, otherwise toggles beat playback.
  const onPlayToggle = () => {
    if (selectedTake) {
      if (loopPlaying) {
        loopRef.current?.pause();
        setLoopPlaying(false);
      } else {
        void startLoop(selectedTake);
      }
      return;
    }
    if (mixPlaying) stopFullMix();
    else setBeatPlaying((p) => !p);
  };

  const playing = beatPlaying || mixPlaying || loopPlaying;
  const playStateLabel = stripTake ? (loopPlaying ? 'LOOPING' : 'PAUSED') : (playing ? 'PLAYING' : 'SCRUB');

  // ── per-take options sheet handlers ──
  const closeTakeSheet = () => { setTakeSheetId(null); setTakeDeleteConfirm(false); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <Grain />

      <div className="fixed-header" style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        <ScreenHeader
          left={<IconBtn name="back" onClick={onBack} title="Back" />}
          title={
            editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => { setEditingName(false); onRenameSession(nameInput); }}
                onKeyDown={(e) => e.key === 'Enter' && (setEditingName(false), onRenameSession(nameInput))}
                style={{ all: 'unset', fontFamily: 'Space Mono', fontSize: 10, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-0)', borderBottom: '2px solid var(--spot)', minWidth: 120, textAlign: 'center' }}
              />
            ) : (
              <span style={{ cursor: 'pointer' }} onClick={() => { setEditingName(true); setNameInput(sessionName); }}>
                {sessionName}
              </span>
            )
          }
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={onNewTake}
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-disp)', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: 'var(--spot)' }}
                type="button"
              >
                <Icon name="plus" size={13} color="var(--spot)" stroke={2.5} />
                NEW
              </button>
              <IconBtn name="more" onClick={() => setMoreOpen(true)} title="Session options" />
            </div>
          }
        />

        <Sheet open={moreOpen} onClose={() => { setMoreOpen(false); setConfirmDeleteSession(false); }} title="SESSION OPTIONS">
          <MenuRow icon="rename" label="Rename Session" hint={sessionName} onClick={() => { setMoreOpen(false); setEditingName(true); setNameInput(sessionName); }} />
          <MenuRow icon="upload" label="Export Mix" hint="MP3 or WAV" onClick={() => { setMoreOpen(false); onExport(); }} />
          <MenuRow
            icon="share"
            label={sharing ? 'Sharing…' : 'Share Mix'}
            hint="Bounces full mix and shares"
            onClick={() => { setMoreOpen(false); void handleShare(); }}
          />
          <MenuRow
            icon="copy"
            label="Duplicate Session"
            hint={sessionId ? 'Clone takes + beat' : 'Save the session first'}
            onClick={() => {
              if (!sessionId) {
                showToast('Save the session first');
                return;
              }
              void handleDuplicate();
            }}
          />
          {confirmDeleteSession ? (
            <div style={{ display: 'flex', gap: 6, padding: '12px 4px', alignItems: 'center' }}>
              <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--spot)' }}>
                Delete this session?
              </span>
              <button
                onClick={() => setConfirmDeleteSession(false)}
                style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: 'var(--ink-1)', background: 'rgba(20,18,15,.06)', border: 'none', borderRadius: 20, padding: '6px 14px' }}
                type="button"
              >
                NO
              </button>
              <button
                onClick={() => {
                  setConfirmDeleteSession(false);
                  setMoreOpen(false);
                  haptics.warn();
                  onDeleteSession();
                  showToast('Session deleted');
                }}
                style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: '#F0EBDF', background: 'var(--spot)', border: 'none', borderRadius: 20, padding: '6px 14px', boxShadow: '0 2px 8px rgba(217,58,28,.30)' }}
                type="button"
              >
                YES
              </button>
            </div>
          ) : (
            <MenuRow
              icon="trash"
              label="Delete Session"
              danger
              hint={sessionId ? `${takes.length} take${takes.length === 1 ? '' : 's'} will be removed` : 'Discard unsaved session'}
              onClick={() => setConfirmDeleteSession(true)}
            />
          )}
        </Sheet>

        {/* ── BEAT CARD (expands when a take is selected) ── */}
        <div
          style={{
            background: 'var(--paper-0)',
            border: `1px solid ${selectedTake ? 'rgba(217,58,28,0.32)' : 'var(--border-medium)'}`,
            borderRadius: 16,
            padding: '12px 14px',
            marginBottom: 10,
            boxShadow: selectedTake
              ? '0 6px 22px rgba(217,58,28,0.14), 0 2px 6px rgba(20,18,15,0.06)'
              : '0 4px 16px rgba(20,18,15,0.10), 0 2px 6px rgba(20,18,15,0.06)',
            position: 'relative',
            zIndex: 3,
            cursor: 'pointer',
            transition: 'border-color 160ms var(--ease), box-shadow 160ms var(--ease)',
          }}
          onClick={onPlayToggle}
          role="button"
          tabIndex={0}
          title={playing ? 'Tap to pause' : 'Tap to play'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.24em', color: 'var(--spot)', transition: 'opacity 180ms var(--ease)' }}>
                {stripTake ? 'TIMING ▸' : 'RECORDING ON ▸'}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 15, letterSpacing: '-.02em', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                {beat.title}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', marginTop: 3, letterSpacing: '.1em' }}>
                {stripTake
                  ? <>TK {String(takes.findIndex((x) => x.id === stripTake.id) + 1).padStart(2, '0')} · {stripTake.label || 'Untitled'} · {fmtTC(stripTake.durationMs)}</>
                  : <>{beat.bpm} BPM · {beat.key} · {takes.filter((t) => t.enabled).length}/{takes.length} ACTIVE</>}
              </div>
            </div>
            {stripTake ? (
              <Stamp rotate={-2} color={stripTake.aligned ? 'var(--spot)' : 'var(--ink-3)'}>
                {stripTake.aligned ? 'ALIGNED' : 'NEED FIX'}
              </Stamp>
            ) : (
              <Stamp rotate={-2}>TK {String(takes.length).padStart(2, '0')}</Stamp>
            )}
          </div>

          {/* Beat waveform with optional vocal-region overlay */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)' }}>
                BEAT ▸ {playing ? <span style={{ color: 'var(--spot)' }}>{playStateLabel}</span> : playStateLabel}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtTC(beatProgress * beat.duration * 1000)}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onPlayToggle(); }}
                  style={{ all: 'unset', cursor: 'pointer', width: 20, height: 20, borderRadius: '50%', background: 'var(--paper-1)', border: 'none', boxShadow: 'var(--elev-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  type="button"
                >
                  <Icon name={playing ? 'pause' : 'play'} size={10} color="var(--ink-0)" />
                </button>
              </div>
            </div>
            <div
              style={{ position: 'relative' }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Waveform
                progress={beatProgress}
                seed={beat.bpm * 3}
                height={34}
                bars={60}
                color="var(--spot)"
                restColor="var(--ink-3)"
                onScrub={(p) => {
                  if (selectedTake) return;
                  setBeatProgress(p);
                  if (mixPlaying && mixRef.current) {
                    const d = mixRef.current.duration();
                    mixRef.current.seek(p * d);
                  } else {
                    const player = beatPlayerRef.current;
                    if (player) player.seek(p * (player.duration() || beat.duration));
                    setBeatPlaying(true);
                  }
                }}
              />
              {stripTake && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${overlay.left}%`,
                    width: `${overlay.width}%`,
                    background: 'rgba(217,58,28,0.18)',
                    borderLeft: '2px solid var(--spot)',
                    borderRight: '2px solid var(--spot)',
                    pointerEvents: 'none',
                    opacity: selectedTake ? 1 : 0,
                    transition: 'left 90ms linear, width 90ms linear, opacity 220ms var(--ease)',
                  }}
                />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 500, color: 'var(--ink-2)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
              <span>{fmtTC(beatProgress * beat.duration * 1000)}</span>
              <span>-{fmtTC((1 - beatProgress) * beat.duration * 1000)}</span>
            </div>
          </div>

          {/* BEAT volume slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid rgba(20,18,15,0.08)', paddingTop: 10 }} onClick={(e) => e.stopPropagation()}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', width: 40 }}>BEAT</span>
            <PSlider value={beatVol} onChange={setBeatVol} onReset={() => setBeatVol(70)} />
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, width: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{beatVol}</span>
          </div>

          {/* TIMING strip — animated expand/collapse via grid-rows trick */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: selectedTake ? '1fr' : '0fr',
              transition: 'grid-template-rows 240ms var(--ease)',
            }}
            onTransitionEnd={(e) => {
              if (e.propertyName === 'grid-template-rows' && !selectedTake) {
                setRenderedTakeId(null);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ minHeight: 0, overflow: 'hidden' }}>
              {stripTake && (
                <div
                  style={{
                    borderTop: '1px solid rgba(20,18,15,0.08)',
                    marginTop: 10,
                    paddingTop: 10,
                    opacity: selectedTake ? 1 : 0,
                    transform: selectedTake ? 'translateY(0)' : 'translateY(-4px)',
                    transition: 'opacity 200ms var(--ease), transform 240ms var(--ease)',
                  }}
                >
                  {/* VOCAL volume slider — sits directly under BEAT vol */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', width: 40 }}>VOCAL</span>
                    <PSlider
                      value={stripTake.volume}
                      onChange={(v) => {
                        onUpdateTake(stripTake.id, { volume: v });
                        if (loopRef.current) loopRef.current.setVolume(1, v / 100);
                        if (mixPlaying) {
                          const mi = getMixIdx(stripTake.id);
                          if (mi !== null) mixRef.current?.setVolume(mi, v / 100);
                        }
                      }}
                      onReset={() => {
                        const v = 80;
                        onUpdateTake(stripTake.id, { volume: v });
                        if (loopRef.current) loopRef.current.setVolume(1, v / 100);
                        if (mixPlaying) {
                          const mi = getMixIdx(stripTake.id);
                          if (mi !== null) mixRef.current?.setVolume(mi, v / 100);
                        }
                      }}
                    />
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, width: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{stripTake.volume}</span>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(20,18,15,0.08)', paddingTop: 10 }} />

                  {/* Header row: label + cumulative ms + absolute time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.22em', color: 'var(--ink-0)', flex: 1 }}>
                      TIMING
                    </span>
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono',
                        fontSize: 11,
                        fontWeight: 800,
                        color: totalDelta === 0 ? 'var(--ink-2)' : 'var(--spot)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {totalDelta > 0 ? '+' : ''}{totalDelta} ms
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 600, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                      = {fmtTC(previewMs)}
                    </span>
                  </div>

                  {/* Slider with EARLY / LATE labels (symmetric widths) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', width: 36, textAlign: 'left' }}>EARLY</span>
                    <PSlider
                      value={Math.round(pendingDelta / TIMING_STEP_MS)}
                      min={-(TIMING_RANGE_MS / TIMING_STEP_MS)}
                      max={TIMING_RANGE_MS / TIMING_STEP_MS}
                      onChange={onTimingSliderChange}
                      onCommit={() => commitTimingDelta(0)}
                      onReset={() => {
                        if (!selectedTake) return;
                        // Reset all timing back to the baseline captured when the take was selected.
                        setCommittedDelta(0);
                        setPendingDelta(0);
                        const next = Math.max(0, baselineMs);
                        if (next !== (selectedTake.beatStartMs ?? 0)) {
                          onUpdateTake(selectedTake.id, { beatStartMs: next });
                        }
                        updateLoopWindow(next / 1000, selectedTake.durationMs);
                        if (mixPlaying) {
                          const mi = getMixIdx(selectedTake.id);
                          if (mi !== null) mixRef.current?.setOffset(mi, next / 1000);
                        }
                        haptics.warn();
                      }}
                    />
                    <span style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', width: 36, textAlign: 'right' }}>LATE</span>
                  </div>

                  {/* ± buttons + MARK ALIGNED */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 6 }}>
                    <button
                      onClick={() => { commitTimingDelta(-TIMING_STEP_MS); haptics.warn(); }}
                      style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, color: 'var(--ink-1)', background: 'rgba(20,18,15,.06)', borderRadius: 14, padding: '5px 12px', fontVariantNumeric: 'tabular-nums' }}
                      type="button"
                      title="Earlier 10ms"
                    >
                      − 10ms
                    </button>
                    <button
                      onClick={() => {
                        if (!selectedTake) return;
                        // Flush any pending drag delta first so the saved alignment is the value the user actually sees.
                        if (pendingDelta !== 0) commitTimingDelta(0);
                        onUpdateTake(selectedTake.id, { aligned: !selectedTake.aligned });
                        haptics.warn();
                        // Marking ALIGNED collapses the card (turning OFF stays open so user can keep tweaking).
                        if (!selectedTake.aligned) setSelectedId(null);
                      }}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        fontFamily: 'JetBrains Mono',
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: '.16em',
                        color: stripTake.aligned ? '#F0EBDF' : 'var(--ink-1)',
                        background: stripTake.aligned ? 'var(--spot)' : 'rgba(20,18,15,.06)',
                        borderRadius: 14,
                        padding: '5px 12px',
                        boxShadow: stripTake.aligned ? '0 2px 6px rgba(217,58,28,.30)' : 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'background 160ms var(--ease), color 160ms var(--ease), box-shadow 160ms var(--ease)',
                      }}
                      type="button"
                      title="Toggle alignment status"
                    >
                      <Icon name="check" size={10} color={stripTake.aligned ? '#F0EBDF' : 'var(--ink-2)'} stroke={2.5} />
                      {stripTake.aligned ? 'ALIGNED' : 'MARK ALIGNED'}
                    </button>
                    <button
                      onClick={() => { commitTimingDelta(TIMING_STEP_MS); haptics.warn(); }}
                      style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 800, color: 'var(--ink-1)', background: 'rgba(20,18,15,.06)', borderRadius: 14, padding: '5px 12px', fontVariantNumeric: 'tabular-nums' }}
                      type="button"
                      title="Later 10ms"
                    >
                      + 10ms
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── TAKES LIST (scannable rows) ── */}
      <div className="scroll-body" style={{ padding: '10px 20px', flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {takes.length === 0 ? (
            <div style={{ background: 'var(--paper-1)', border: '1px solid var(--border-subtle)', borderRadius: 18, padding: 28, textAlign: 'center', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--ink-2)' }}>
              No takes yet — tap + NEW.
            </div>
          ) : (
            takes.map((t, i) => {
              const isSelected = selectedId === t.id;
              const isAligned = !!t.aligned;
              const takeProgress = mixPlaying
                ? (() => {
                    const offsetSec = (t.beatStartMs ?? 0) / 1000;
                    const localSec = mixTimeSec - offsetSec;
                    const durSec = t.durationMs / 1000;
                    if (localSec <= 0 || durSec <= 0) return 0;
                    return Math.min(1, localSec / durSec);
                  })()
                : 0;
              return (
                <SwipeRow
                  key={t.id}
                  resetSignal={selectedId}
                  onDelete={() => {
                    if (selectedId === t.id) setSelectedId(null);
                    haptics.warn();
                    onDeleteTake(t.id);
                    showToast('Take deleted');
                  }}
                  onFavorite={() => {
                    onUpdateTake(t.id, { favorite: !t.favorite });
                    haptics.warn();
                    showToast(t.favorite ? 'Unfavorited' : 'Favorited');
                  }}
                  favorited={t.favorite}
                >
                <div
                  className={`take-card ${t.enabled ? 'enabled' : 'disabled'}`}
                  style={{
                    flexShrink: 0,
                    cursor: 'pointer',
                    borderColor: isSelected ? 'rgba(217,58,28,0.45)' : undefined,
                    boxShadow: isSelected ? '0 4px 14px rgba(217,58,28,0.16)' : undefined,
                    position: 'relative',
                    paddingLeft: isSelected ? 12 : undefined,
                  }}
                  onClick={() => { if (editingId !== t.id) selectTake(t.id); }}
                  role="button"
                  tabIndex={0}
                  title={isSelected ? 'Tap to deselect' : 'Tap to adjust timing'}
                >
                  {isSelected && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 8,
                        bottom: 8,
                        width: 3,
                        background: 'var(--spot)',
                        borderRadius: 2,
                      }}
                    />
                  )}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 32, alignSelf: 'stretch', borderRight: '1px solid rgba(20,18,15,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)' }}>TK</div>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 800, letterSpacing: '-.05em' }}>{String(i + 1).padStart(2, '0')}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {editingId === t.id ? (
                            <input
                              autoFocus
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              onBlur={() => { onUpdateTake(t.id, { label: editLabel || null }); setEditingId(null); }}
                              onKeyDown={(e) => e.key === 'Enter' && (onUpdateTake(t.id, { label: editLabel || null }), setEditingId(null))}
                              onClick={(e) => e.stopPropagation()}
                              style={{ all: 'unset', fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 13, letterSpacing: '-.02em', borderBottom: '2px solid var(--spot)', color: 'var(--ink-0)', width: '100%' }}
                            />
                          ) : (
                            <div
                              style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 13, letterSpacing: '-.02em', display: 'flex', alignItems: 'center', gap: 6, cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              onClick={(e) => { e.stopPropagation(); setEditingId(t.id); setEditLabel(t.label || `Take ${i + 1}`); }}
                              title="Tap to rename"
                            >
                              {t.label || `Take ${i + 1}`}
                              {t.favorite && <Icon name="star" size={11} color="var(--spot)" />}
                            </div>
                          )}
                          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <span style={{ flexShrink: 0 }}>{fmtTC(t.durationMs)}</span>
                            <span style={{ opacity: 0.7, flexShrink: 0 }}>▸ {fmtTC(t.beatStartMs ?? 0)}</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); onUpdateTake(t.id, { aligned: !t.aligned }); haptics.warn(); }}
                          style={{
                            all: 'unset',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 10,
                            fontFamily: 'Space Mono',
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: '.16em',
                            color: isAligned ? 'var(--spot)' : 'var(--ink-2)',
                            border: `1px solid ${isAligned ? 'rgba(217,58,28,.45)' : 'rgba(20,18,15,.14)'}`,
                            background: isAligned ? 'rgba(217,58,28,0.08)' : 'transparent',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                          type="button"
                          title="Toggle alignment status"
                        >
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: isAligned ? 'var(--spot)' : 'var(--ink-3)' }} />
                          {isAligned ? 'ALIGNED' : 'NEED FIX'}
                        </button>
                        <div onClick={(e) => e.stopPropagation()}>
                          <PSwitch
                            on={t.enabled}
                            onChange={(v) => {
                              onUpdateTake(t.id, { enabled: v });
                              if (mixPlaying) {
                                const mi = getMixIdx(t.id);
                                if (mi !== null) mixRef.current?.setMuted(mi, !v);
                              }
                            }}
                            size="sm"
                          />
                        </div>
                        <IconBtn name="more" onClick={() => { setTakeSheetId(t.id); setTakeDeleteConfirm(false); }} title="Take options" />
                      </div>
                      <div style={{ marginTop: 6, opacity: t.enabled ? 1 : 0.45, pointerEvents: 'none' }}>
                        <Waveform
                          progress={takeProgress}
                          seed={t.seed}
                          height={20}
                          bars={50}
                          color={mixPlaying && mixTimeSec >= (t.beatStartMs ?? 0) / 1000 && mixTimeSec < ((t.beatStartMs ?? 0) + t.durationMs) / 1000 ? 'var(--spot)' : 'var(--ink-0)'}
                          restColor="var(--ink-3)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                </SwipeRow>
              );
            })
          )}
        </div>
      </div>

      {/* ── Per-take options sheet ── */}
      <Sheet open={!!sheetTake} onClose={closeTakeSheet} title="TAKE OPTIONS">
        {sheetTake && (
          <>
            <div style={{ padding: '4px 4px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(20,18,15,0.08)', marginBottom: 8 }}>
              <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.22em', color: 'var(--ink-2)', width: 32 }}>VOL</span>
              <PSlider
                value={sheetTake.volume}
                onChange={(v) => {
                  onUpdateTake(sheetTake.id, { volume: v });
                  if (loopPlaying && loopRef.current && selectedId === sheetTake.id) loopRef.current.setVolume(1, v / 100);
                  if (mixPlaying) {
                    const mi = getMixIdx(sheetTake.id);
                    if (mi !== null) mixRef.current?.setVolume(mi, v / 100);
                  }
                }}
              />
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, width: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sheetTake.volume}</span>
            </div>
            <MenuRow
              icon="rename"
              label="Rename Take"
              hint={sheetTake.label || `Take ${takes.findIndex((x) => x.id === sheetTake.id) + 1}`}
              onClick={() => {
                closeTakeSheet();
                setEditingId(sheetTake.id);
                setEditLabel(sheetTake.label || `Take ${takes.findIndex((x) => x.id === sheetTake.id) + 1}`);
              }}
            />
            <MenuRow
              icon="star"
              label={sheetTake.favorite ? 'Unfavorite' : 'Favorite'}
              hint={sheetTake.favorite ? 'Remove highlight' : 'Mark as favorite'}
              onClick={() => { onUpdateTake(sheetTake.id, { favorite: !sheetTake.favorite }); closeTakeSheet(); }}
            />
            {takeDeleteConfirm ? (
              <div style={{ display: 'flex', gap: 6, padding: '12px 4px', alignItems: 'center' }}>
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--spot)' }}>
                  Delete this take?
                </span>
                <button
                  onClick={() => setTakeDeleteConfirm(false)}
                  style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: 'var(--ink-1)', background: 'rgba(20,18,15,.06)', border: 'none', borderRadius: 20, padding: '6px 14px' }}
                  type="button"
                >
                  NO
                </button>
                <button
                  onClick={() => {
                    const id = sheetTake.id;
                    closeTakeSheet();
                    if (selectedId === id) setSelectedId(null);
                    haptics.warn();
                    onDeleteTake(id);
                    showToast('Take deleted');
                  }}
                  style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: '#F0EBDF', background: 'var(--spot)', border: 'none', borderRadius: 20, padding: '6px 14px', boxShadow: '0 2px 8px rgba(217,58,28,.30)' }}
                  type="button"
                >
                  YES
                </button>
              </div>
            ) : (
              <MenuRow
                icon="trash"
                label="Delete Take"
                danger
                hint="Removes audio for this take"
                onClick={() => setTakeDeleteConfirm(true)}
              />
            )}
          </>
        )}
      </Sheet>

      {takes.length > 0 && (
        <div className="fixed-footer" style={{ display: 'flex', gap: 10 }}>
          <PushBtn
            variant={mixPlaying ? 'rec' : 'paper'}
            size="lg"
            style={{ flex: 1 }}
            onClick={() => void startMix()}
            disabled={mixLoading}
          >
            {mixLoading ? '▸ LOADING…' : mixPlaying ? '■ STOP' : '▸ MIX'}
          </PushBtn>
          <PushBtn variant="ink" size="lg" style={{ flex: 1 }} onClick={onExport}>
            ▸ EXPORT
          </PushBtn>
        </div>
      )}
    </div>
  );
};
