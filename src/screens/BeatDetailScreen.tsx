import { useEffect, useRef, useState } from 'react';
import type { Beat } from '../types';
import { fmtDur, fmtTC } from '../lib/format';
import { Icon, IconBtn, Grain } from '../components/Icon';
import { Sheet, MenuRow, PushBtn, ScreenHeader } from '../components/primitives';
import { Cassette, Waveform } from '../components/audio-visuals';
import { TportBtn } from '../components/primitives';
import { loadAudioBlob, getSessionCountForBeat } from '../db/queries';
import { createPlayback, type PlaybackController } from '../audio/context';
import { shareFile } from '../lib/share';
import { haptics } from '../lib/haptics';

interface Props {
  beat: Beat;
  onBack: () => void;
  onStart: (b: Beat) => void;
  onRename: (id: string, title: string) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  showToast: (msg: string) => void;
}

export const BeatDetailScreen = ({ beat, onBack, onStart, onRename, onToggleFavorite, onDelete, showToast }: Props) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0.18);
  const [doorOpen, setDoorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [loop, setLoop] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(beat.title);
  const [sessionCount, setSessionCount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const intRef = useRef<number | null>(null);
  const playerRef = useRef<PlaybackController | null>(null);

  useEffect(() => {
    setNameInput(beat.title);
  }, [beat.title]);

  useEffect(() => {
    let cancelled = false;
    getSessionCountForBeat(beat.id).then((n) => {
      if (!cancelled) setSessionCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [beat.id]);

  const isFav = beat.stamp === 'FAV';

  const handleShare = async () => {
    if (!beat.audioBlobKey) {
      showToast('No audio file to share');
      return;
    }
    const blob = await loadAudioBlob(beat.audioBlobKey);
    if (!blob) {
      showToast('Audio missing');
      return;
    }
    const ext = (beat.format || 'wav').toLowerCase();
    const filename = `${beat.title.replace(/[^a-z0-9]+/gi, '_')}.${ext}`;
    const result = await shareFile(blob, filename, { title: beat.title });
    if (result === 'shared') showToast('Shared');
    else if (result === 'downloaded') showToast('Downloaded — share from Files');
    else showToast('Share unsupported on this device');
  };

  const handleDelete = () => {
    haptics.warn();
    onDelete(beat.id);
  };

  // Load audio blob into a shared-AudioContext player (silent-switch-safe)
  useEffect(() => {
    if (!beat.audioBlobKey) return;
    let cancelled = false;
    loadAudioBlob(beat.audioBlobKey).then((blob) => {
      if (cancelled || !blob) return;
      const player = createPlayback(blob, { loop, volume: 1 });
      player.audioEl.addEventListener('ended', () => {
        if (!player.audioEl.loop) {
          setPlaying(false);
          setProgress(0);
        }
      });
      playerRef.current = player;
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat.audioBlobKey]);

  useEffect(() => {
    const t = setTimeout(() => setDoorOpen(true), 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (playing) {
      const player = playerRef.current;
      if (player) {
        player.audioEl.loop = loop;
        player.seek(progress * beat.duration);
        player.play().catch((e) => console.warn('[Play] Audio play failed:', e));
      }
      const t0 = Date.now();
      const start = progress;
      intRef.current = window.setInterval(() => {
        const dur = player?.duration() ?? 0;
        if (player && dur > 0 && isFinite(dur)) {
          const p = player.currentTime() / dur;
          if (p >= 1 && !loop) {
            setPlaying(false);
            setProgress(0);
          } else {
            setProgress(p);
          }
        } else {
          const elapsed = (Date.now() - t0) / 1000;
          const p = start + elapsed / beat.duration;
          if (p >= 1) {
            if (loop) setProgress(0);
            else {
              setPlaying(false);
              setProgress(0);
            }
          } else {
            setProgress(p);
          }
        }
      }, 60);
    } else {
      playerRef.current?.pause();
      if (intRef.current) {
        clearInterval(intRef.current);
        intRef.current = null;
      }
    }
    return () => {
      if (intRef.current) clearInterval(intRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const handleScrub = (p: number) => {
    setProgress(p);
    const player = playerRef.current;
    if (player) {
      player.seek(p * (player.duration() || beat.duration));
    }
    setPlaying(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <Grain />
      <div className="fixed-header" style={{ padding: '16px 20px 0' }}>
        <ScreenHeader
          left={<IconBtn name="back" onClick={onBack} title="Back" />}
          title={
            editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => {
                  setEditingName(false);
                  const t = nameInput.trim();
                  if (t && t !== beat.title) onRename(beat.id, t);
                  else setNameInput(beat.title);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditingName(false);
                    const t = nameInput.trim();
                    if (t && t !== beat.title) onRename(beat.id, t);
                    else setNameInput(beat.title);
                  }
                  if (e.key === 'Escape') {
                    setEditingName(false);
                    setNameInput(beat.title);
                  }
                }}
                style={{ all: 'unset', fontFamily: 'var(--font-disp)', fontSize: 10, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-0)', borderBottom: '2px solid var(--spot)', minWidth: 120, textAlign: 'center' }}
              />
            ) : (
              <span style={{ cursor: 'pointer' }} title="Tap to rename" onClick={() => { setEditingName(true); setNameInput(beat.title); }}>
                LOADED
              </span>
            )
          }
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="icon-btn" onClick={() => setLoop((l) => !l)} title="Loop" style={{ opacity: loop ? 1 : 0.45 }} type="button">
                <Icon name="loop" size={16} color={loop ? 'var(--spot)' : 'var(--ink-0)'} />
              </button>
              <IconBtn name="more" onClick={() => setMoreOpen(true)} title="Options" />
            </div>
          }
        />
        <Sheet open={moreOpen} onClose={() => { setMoreOpen(false); setConfirmDelete(false); }} title="BEAT OPTIONS">
          <MenuRow
            icon="star"
            label={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
            onClick={() => {
              setMoreOpen(false);
              onToggleFavorite(beat.id);
              showToast(isFav ? 'Removed from favorites' : 'Added to favorites');
            }}
            right={<span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: isFav ? 'var(--spot)' : 'var(--ink-2)' }}>{isFav ? 'ON' : 'OFF'}</span>}
          />
          <MenuRow icon="rename" label="Rename Beat" hint={beat.title} onClick={() => { setMoreOpen(false); setEditingName(true); setNameInput(beat.title); }} />
          <MenuRow icon="share" label="Share Beat File" hint={beat.audioBlobKey ? 'Audio file' : 'No audio loaded'} onClick={() => { setMoreOpen(false); void handleShare(); }} />
          <MenuRow icon="cassette" label="Sessions for this beat" hint={`${sessionCount} recorded`} />
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 6, padding: '12px 4px', alignItems: 'center' }}>
              <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--spot)' }}>
                Delete beat & {sessionCount} session{sessionCount === 1 ? '' : 's'}?
              </span>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: 'var(--ink-2)', border: '1.5px solid var(--ink-2)', borderRadius: 4, padding: '4px 8px' }}
                type="button"
              >
                NO
              </button>
              <button
                onClick={() => { setConfirmDelete(false); setMoreOpen(false); handleDelete(); }}
                style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: '#F0EBDF', background: 'var(--spot)', border: '1.5px solid var(--line-0)', borderRadius: 4, padding: '4px 10px' }}
                type="button"
              >
                YES
              </button>
            </div>
          ) : (
            <MenuRow icon="trash" label="Remove from Library" danger hint={sessionCount > 0 ? `Will also delete ${sessionCount} session${sessionCount === 1 ? '' : 's'}` : undefined} onClick={() => setConfirmDelete(true)} />
          )}
        </Sheet>
      </div>

      <div className="scroll-body" style={{ padding: '0 20px 16px' }}>
        <div style={{ position: 'relative', zIndex: 3, background: 'var(--deck-grey)', border: '2px solid var(--line-0)', borderRadius: 8, padding: 14, boxShadow: '4px 4px 0 var(--shadow)', marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--spot)', boxShadow: '0 0 4px rgba(217,58,28,.8)' }} />
              <span style={{ fontFamily: 'Space Mono,monospace', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: '#F0EBDF' }}>TAPE IN</span>
            </div>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: '#C9C5BC' }}>DECK-01</span>
          </div>
          <div
            style={{
              background: '#0E0D10',
              borderRadius: 6,
              padding: 18,
              border: '2px solid #000',
              boxShadow: 'inset 0 4px 8px rgba(0,0,0,.6)',
              position: 'relative',
              overflow: 'hidden',
              animation: doorOpen ? 'door-open 420ms var(--ease-io) both' : 'none',
              transformOrigin: 'top',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '30%', background: 'linear-gradient(to bottom,rgba(255,255,255,.06),transparent)', pointerEvents: 'none' }} />
            <Cassette width={280} spinning={playing} title={beat.title} side={beat.side} bpm={beat.bpm} />
          </div>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: '#C9C5BC' }}>
            <span>{beat.format}</span>
            <span>{beat.key}</span>
            <span>{beat.bpm} BPM</span>
            <span>{fmtDur(beat.duration)}</span>
          </div>
        </div>

        <div style={{ marginTop: 20, position: 'relative', zIndex: 3 }}>
          <div style={{ fontFamily: 'Space Mono,monospace', fontSize: 9, fontWeight: 700, letterSpacing: '.24em', color: 'var(--ink-2)', marginBottom: 8 }}>PREVIEW ▸</div>
          <Waveform progress={progress} seed={beat.bpm} height={44} onScrub={handleScrub} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 500, color: 'var(--ink-2)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            <span>{fmtTC(progress * beat.duration * 1000)}</span>
            <span style={{ color: loop ? 'var(--spot)' : 'var(--ink-2)' }}>{loop ? '⟳ LOOP' : ''}</span>
            <span>-{fmtTC((1 - progress) * beat.duration * 1000)}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 14 }}>
            <TportBtn icon="rewind" size={40} label="REW" onClick={() => setProgress(Math.max(0, progress - 0.1))} />
            <TportBtn icon={playing ? 'pause' : 'play'} size={56} active label={playing ? 'PAUSE' : 'PLAY'} onClick={() => setPlaying((p) => !p)} />
            <TportBtn icon="forward" size={40} label="FWD" onClick={() => setProgress(Math.min(1, progress + 0.1))} />
          </div>
        </div>

        <div style={{ marginTop: 24, position: 'relative', zIndex: 3 }}>
          <PushBtn variant="rec" size="lg" onClick={() => { setPlaying(false); onStart(beat); }} style={{ width: '100%' }}>
            ● Record over this
          </PushBtn>
        </div>
      </div>
    </div>
  );
};
