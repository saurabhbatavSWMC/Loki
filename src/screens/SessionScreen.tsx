import { useEffect, useRef, useState } from 'react';
import type { Beat, Take } from '../types';
import { fmtTC } from '../lib/format';
import { Icon, IconBtn, Grain } from '../components/Icon';
import { Sheet, MenuRow, PushBtn, ScreenHeader, Stamp, PSwitch, PSlider } from '../components/primitives';
import { Waveform } from '../components/audio-visuals';
import { loadAudioBlob } from '../db/queries';
import { createPlayback, type PlaybackController } from '../audio/context';
import { createLiveMix, type LiveMix } from '../audio/live-mix';
import { renderMix, downloadBlob } from '../audio/mix-export';
import { shareFile } from '../lib/share';
import { haptics } from '../lib/haptics';
import { useStackWindow } from '../hooks/useStackWindow';

const TAKES_VISIBLE = 2;

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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewProg, setPreviewProg] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(sessionName);
  const [sharing, setSharing] = useState(false);
  const playerRef = useRef<PlaybackController | null>(null);
  const beatPlayerRef = useRef<PlaybackController | null>(null);
  const beatRef = useRef<number | null>(null);
  const mixRef = useRef<LiveMix | null>(null);
  const [mixPlaying, setMixPlaying] = useState(false);
  const [mixLoading, setMixLoading] = useState(false);
  // Track which take indices map to which take ids in the live mix (beat is always idx 0)
  const mixTakeMapRef = useRef<string[]>([]);
  // During mix playback, track the global time in seconds so we can compute per-take waveform progress
  const [mixTimeSec, setMixTimeSec] = useState(0);

  const { listRef, containerHeight } = useStackWindow(TAKES_VISIBLE);

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

  // Live volume update on beat player + live mix beat track.
  useEffect(() => {
    beatPlayerRef.current?.setVolume(beatVol / 100);
    if (mixPlaying) mixRef.current?.setVolume(0, beatVol / 100);
  }, [beatVol, mixPlaying]);

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
      else if (result === 'downloaded') {
        // Web Share fallback already saved it
        showToast('Downloaded — share from Files');
      } else {
        // Unsupported — explicit download
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

  const startMix = async () => {
    if (mixPlaying) {
      mixRef.current?.pause();
      setMixPlaying(false);
      setBeatProgress(0);
      setMixTimeSec(0);
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

  // Helper: get the mix source index for a take id (beat=0, takes start at 1)
  const getMixIdx = (takeId: string): number | null => {
    const idx = mixTakeMapRef.current.indexOf(takeId);
    return idx >= 0 ? idx + 1 : null;
  };

  useEffect(() => {
    return () => {
      mixRef.current?.destroy();
      mixRef.current = null;
    };
  }, []);

  // Auto-focus rename input on a freshly recorded take
  useEffect(() => {
    if (!autoRenameTakeId) return;
    const take = takes.find((t) => t.id === autoRenameTakeId);
    if (!take) return;
    setEditingId(take.id);
    setEditLabel(take.label || `Take ${takes.indexOf(take) + 1}`);
    onAutoRenameConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRenameTakeId, takes]);

  // Drive the BEAT progress bar from real audio when available; fall back to time-based
  // animation when the beat has no audio blob (seeded data).
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

  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  const playPreview = async (take: Take) => {
    // stop existing player
    playerRef.current?.destroy();
    playerRef.current = null;

    if (previewId === take.id) {
      setPreviewId(null);
      setPreviewProg(0);
      return;
    }
    await startTakePlayback(take, 0);
  };

  const scrubPreview = async (take: Take, p: number) => {
    // If already playing this take, just seek
    if (previewId === take.id && playerRef.current) {
      const d = playerRef.current.duration();
      if (d > 0) {
        playerRef.current.seek(p * d);
        setPreviewProg(p);
      }
      return;
    }
    // Otherwise start fresh from position
    playerRef.current?.destroy();
    playerRef.current = null;
    await startTakePlayback(take, p);
  };

  const startTakePlayback = async (take: Take, startProg: number) => {
    setPreviewId(take.id);
    setPreviewProg(startProg);
    if (!take.audioBlobKey) {
      const start = Date.now() - startProg * take.durationMs;
      const interval = window.setInterval(() => {
        const p = (Date.now() - start) / take.durationMs;
        if (p >= 1) {
          clearInterval(interval);
          setPreviewId(null);
          setPreviewProg(0);
        } else {
          setPreviewProg(p);
        }
      }, 60);
      return;
    }
    const blob = await loadAudioBlob(take.audioBlobKey);
    if (!blob) {
      showToast('Audio missing for take');
      setPreviewId(null);
      return;
    }
    const player = createPlayback(blob, { volume: (take.volume ?? 80) / 100 });
    playerRef.current = player;
    player.audioEl.addEventListener('timeupdate', () => {
      const d = player.duration();
      if (d > 0) setPreviewProg(player.currentTime() / d);
    });
    player.audioEl.addEventListener('ended', () => {
      setPreviewId(null);
      setPreviewProg(0);
      player.destroy();
      if (playerRef.current === player) playerRef.current = null;
    });
    try {
      await player.play();
      if (startProg > 0) {
        const d = player.duration();
        if (d > 0) player.seek(startProg * d);
      }
    } catch {
      showToast('Could not play take');
      setPreviewId(null);
    }
  };

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
                style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: 'var(--ink-2)', border: '1.5px solid var(--ink-2)', borderRadius: 4, padding: '4px 8px' }}
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
                style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: '#F0EBDF', background: 'var(--spot)', border: '1.5px solid var(--line-0)', borderRadius: 4, padding: '4px 10px' }}
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

        <div style={{ background: 'var(--paper-0)', border: '2px solid var(--line-0)', borderRadius: 5, padding: '12px 14px', marginBottom: 10, boxShadow: '3px 3px 0 var(--shadow)', position: 'relative', zIndex: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.24em', color: 'var(--spot)' }}>RECORDING ON ▸</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 15, letterSpacing: '-.02em', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                {beat.title}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', marginTop: 3, letterSpacing: '.1em' }}>
                {beat.bpm} BPM · {beat.key} · {takes.filter((t) => t.enabled).length}/{takes.length} ACTIVE
              </div>
            </div>
            <Stamp rotate={-2}>TK {String(takes.length).padStart(2, '0')}</Stamp>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)' }}>
                BEAT ▸ {beatPlaying ? <span style={{ color: 'var(--spot)' }}>PLAYING</span> : 'SCRUB'}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtTC(beatProgress * beat.duration * 1000)}
                </span>
                <button
                  onClick={() => setBeatPlaying((p) => !p)}
                  style={{ all: 'unset', cursor: 'pointer', width: 20, height: 20, borderRadius: '50%', background: 'var(--paper-1)', border: '1.5px solid var(--line-0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  type="button"
                >
                  <Icon name={beatPlaying ? 'pause' : 'play'} size={10} color="var(--ink-0)" />
                </button>
              </div>
            </div>
            <Waveform
              progress={beatProgress}
              seed={beat.bpm * 3}
              height={34}
              bars={60}
              color="var(--spot)"
              restColor="var(--ink-3)"
              onScrub={(p) => {
                setBeatProgress(p);
                if (mixPlaying && mixRef.current) {
                  const d = mixRef.current.duration();
                  mixRef.current.seek(p * d);
                } else {
                  const player = beatPlayerRef.current;
                  if (player) {
                    player.seek(p * (player.duration() || beat.duration));
                  }
                  setBeatPlaying(true);
                }
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 500, color: 'var(--ink-2)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
              <span>{fmtTC(beatProgress * beat.duration * 1000)}</span>
              <span>-{fmtTC((1 - beatProgress) * beat.duration * 1000)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px dashed color-mix(in srgb,var(--ink-0) 20%,transparent)', paddingTop: 10 }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', width: 40 }}>BEAT</span>
            <PSlider value={beatVol} onChange={setBeatVol} />
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, width: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{beatVol}</span>
          </div>
        </div>
      </div>

      <div className="scroll-body" style={{ padding: '10px 20px' }}>
        <div
          ref={listRef}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', overflowX: 'hidden', height: containerHeight, scrollbarWidth: 'none' }}
        >
          {takes.length === 0 ? (
            <div style={{ background: 'var(--paper-1)', border: '2px dashed var(--line-0)', borderRadius: 5, padding: 24, textAlign: 'center', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--ink-2)' }}>
              No takes yet — tap + NEW.
            </div>
          ) : (
            takes.map((t, i) => (
              <div key={t.id} className={`take-card ${t.enabled ? 'enabled' : 'disabled'}`} style={{ flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 32, alignSelf: 'stretch', borderRight: '1px dashed color-mix(in srgb,var(--ink-0) 40%,transparent)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)' }}>TK</div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 800, letterSpacing: '-.05em' }}>{String(i + 1).padStart(2, '0')}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {editingId === t.id ? (
                          <input
                            autoFocus
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            onBlur={() => { onUpdateTake(t.id, { label: editLabel || null }); setEditingId(null); }}
                            onKeyDown={(e) => e.key === 'Enter' && (onUpdateTake(t.id, { label: editLabel || null }), setEditingId(null))}
                            style={{ all: 'unset', fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 13, letterSpacing: '-.02em', borderBottom: '2px solid var(--spot)', color: 'var(--ink-0)', width: '100%' }}
                          />
                        ) : (
                          <div
                            style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 13, letterSpacing: '-.02em', display: 'flex', alignItems: 'center', gap: 6, cursor: 'text' }}
                            onClick={() => { setEditingId(t.id); setEditLabel(t.label || `Take ${i + 1}`); }}
                            title="Tap to rename"
                          >
                            {t.label || `Take ${i + 1}`}
                            {t.favorite && <Icon name="star" size={11} color="var(--spot)" />}
                          </div>
                        )}
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                          {fmtTC(t.durationMs)}
                          <span style={{ fontSize: 9, color: 'var(--spot)', opacity: 0.8 }}>▸ {fmtTC(t.beatStartMs ?? 0)}</span>
                        </div>
                      </div>
                      <PSwitch on={t.enabled} onChange={(v) => {
                        onUpdateTake(t.id, { enabled: v });
                        if (mixPlaying) {
                          const mi = getMixIdx(t.id);
                          if (mi !== null) mixRef.current?.setMuted(mi, !v);
                        }
                      }} size="sm" />
                    </div>
                    <div style={{ marginTop: 8, opacity: t.enabled ? 1 : 0.45 }}>
                      <Waveform
                        progress={
                          previewId === t.id ? previewProg
                          : mixPlaying ? (() => {
                              const offsetSec = (t.beatStartMs ?? 0) / 1000;
                              const localSec = mixTimeSec - offsetSec;
                              const durSec = t.durationMs / 1000;
                              if (localSec <= 0 || durSec <= 0) return 0;
                              return Math.min(1, localSec / durSec);
                            })()
                          : 0
                        }
                        seed={t.seed}
                        height={24}
                        bars={50}
                        color={mixPlaying && mixTimeSec >= (t.beatStartMs ?? 0) / 1000 && mixTimeSec < ((t.beatStartMs ?? 0) + t.durationMs) / 1000 ? 'var(--spot)' : 'var(--ink-0)'}
                        restColor="var(--ink-3)"
                        onScrub={(p) => void scrubPreview(t, p)}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <span style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', width: 32 }}>SYNC</span>
                      <PSlider
                        value={Math.round((t.beatStartMs ?? 0) / 100)}
                        min={0}
                        max={Math.round(beat.duration * 10)}
                        onChange={(v) => {
                          const ms = v * 100;
                          onUpdateTake(t.id, { beatStartMs: ms });
                          if (mixPlaying) {
                            const mi = getMixIdx(t.id);
                            if (mi !== null) mixRef.current?.setOffset(mi, ms / 1000);
                          }
                        }}
                      />
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>
                        {((t.beatStartMs ?? 0) / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ fontFamily: 'Space Mono', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', width: 28 }}>VOL</span>
                      <PSlider value={t.volume} onChange={(v) => {
                        onUpdateTake(t.id, { volume: v });
                        // Live update solo preview player
                        if (previewId === t.id && playerRef.current) {
                          playerRef.current.setVolume(v / 100);
                        }
                        // Live update mix player
                        if (mixPlaying) {
                          const mi = getMixIdx(t.id);
                          if (mi !== null) mixRef.current?.setVolume(mi, v / 100);
                        }
                      }} />
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, width: 22, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.volume}</span>
                      <button
                        style={{ all: 'unset', cursor: 'pointer', padding: 4 }}
                        onClick={() => onUpdateTake(t.id, { favorite: !t.favorite })}
                        title={t.favorite ? 'Unfavorite' : 'Favorite'}
                        type="button"
                      >
                        <Icon name="star" size={14} color={t.favorite ? 'var(--spot)' : 'var(--ink-2)'} />
                      </button>
                      {deleteConfirmId === t.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button
                            style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 800, color: 'var(--spot)', border: '1.5px solid var(--spot)', borderRadius: 4, padding: '2px 6px' }}
                            onClick={() => { onDeleteTake(t.id); setDeleteConfirmId(null); showToast('Take deleted'); }}
                            type="button"
                          >
                            YES
                          </button>
                          <button
                            style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 800, color: 'var(--ink-2)', border: '1.5px solid var(--ink-2)', borderRadius: 4, padding: '2px 6px' }}
                            onClick={() => setDeleteConfirmId(null)}
                            type="button"
                          >
                            NO
                          </button>
                        </div>
                      ) : (
                        <button style={{ all: 'unset', cursor: 'pointer', padding: 4 }} onClick={() => setDeleteConfirmId(t.id)} title="Delete take" type="button">
                          <Icon name="trash" size={14} color="var(--ink-2)" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

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
