import { useState } from 'react';
import type { SessionWithBeat } from '../types';
import { Icon, IconBtn, Grain } from '../components/Icon';
import { PushBtn, ScreenHeader, Stamp } from '../components/primitives';
import { Cassette, Waveform } from '../components/audio-visuals';
import { renderMix, downloadBlob } from '../audio/mix-export';
import { loadAudioBlob } from '../db/queries';
import { shareFile } from '../lib/share';
import { useStackWindow } from '../hooks/useStackWindow';

interface Props {
  sessions: SessionWithBeat[];
  onBack: () => void;
  onOpenSession: (s: SessionWithBeat) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  showToast: (msg: string) => void;
}

const SESSIONS_VISIBLE = 4;

export const SessionsListScreen = ({
  sessions,
  onBack,
  onOpenSession,
  onNewSession,
  onDeleteSession,
  showToast,
}: Props) => {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const { listRef, containerHeight } = useStackWindow(SESSIONS_VISIBLE);

  const handleShare = async (s: SessionWithBeat) => {
    if (sharingId) return;
    const enabled = s.takes.filter((t) => t.enabled && t.audioBlobKey);
    if (enabled.length === 0 && !s.beat.audioBlobKey) {
      showToast('Nothing to share — record or load a beat first');
      return;
    }
    setSharingId(s.id);
    showToast('Bouncing mix…');
    try {
      const beatBlob = s.beat.audioBlobKey ? await loadAudioBlob(s.beat.audioBlobKey) : undefined;
      const mixBlob = await renderMix({ takes: s.takes, beatBlob, mode: 'full' });
      const safeBeat = s.beat.title.replace(/[^a-z0-9]+/gi, '_');
      const safeName = s.name.replace(/[^a-z0-9]+/gi, '_') || 'session';
      const filename = `${safeBeat}__${safeName}.wav`;
      const result = await shareFile(mixBlob, filename, { title: `${s.beat.title} — ${s.name}` });
      if (result === 'shared') showToast('Shared');
      else if (result === 'downloaded') showToast('Downloaded — share from Files');
      else {
        downloadBlob(mixBlob, filename);
        showToast('Downloaded');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Share failed');
    } finally {
      setSharingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <Grain />
      <div className="fixed-header" style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        <ScreenHeader
          left={<IconBtn name="back" onClick={onBack} title="Back" />}
          title="CAT. 002"
          right={
            <button onClick={onNewSession} style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--font-disp)', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: 'var(--spot)', display: 'flex', alignItems: 'center', gap: 4 }} type="button">
              <Icon name="plus" size={13} color="var(--spot)" stroke={2.5} />
              NEW
            </button>
          }
        />
        <div style={{ marginBottom: 14, position: 'relative', zIndex: 3 }}>
          <div style={{ fontFamily: 'Space Mono,monospace', fontSize: 10, fontWeight: 700, letterSpacing: '.24em', color: 'var(--spot)' }}>MY SESSIONS / VOL.1</div>
          <h1 style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 34, lineHeight: 0.95, margin: '6px 0 0', letterSpacing: '-.04em', color: 'var(--ink-0)' }}>
            SESSIONS<br />
            <span style={{ color: 'var(--spot)' }}>ON FILE</span>
          </h1>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 500, color: 'var(--ink-2)', borderTop: '1px dashed color-mix(in srgb,var(--ink-0) 30%,transparent)', paddingTop: 8 }}>
            <span>TOTAL · {sessions.length}</span>
            <span>TAKES · {sessions.reduce((a, s) => a + s.takes.length, 0)}</span>
          </div>
        </div>
      </div>

      <div className="scroll-body" style={{ padding: '0 20px 12px' }}>
        {sessions.length === 0 ? (
          <div style={{ background: 'var(--paper-1)', border: '2px dashed var(--line-0)', borderRadius: 5, padding: '24px 16px 28px', textAlign: 'center', position: 'relative', zIndex: 3, marginTop: 8 }}>
            <div style={{ position: 'absolute', top: 12, right: 12 }}>
              <Stamp rotate={6}>BLANK</Stamp>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, opacity: 0.45, filter: 'grayscale(0.3)' }}>
              <Cassette width={220} title="" side="A" bpm={0} spinning={false} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13, marginBottom: 6 }}>No sessions yet.</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', marginBottom: 16 }}>Pick a beat and start recording.</div>
            <PushBtn variant="rec" size="md" onClick={onNewSession}>● Start recording</PushBtn>
          </div>
        ) : (
          <div
            ref={listRef}
            style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4, overflowY: 'auto', overflowX: 'hidden', height: containerHeight, scrollbarWidth: 'none' }}
          >
            {sessions.map((s, i) => (
              <div key={s.id} style={{ background: 'var(--paper-0)', border: '2px solid var(--line-0)', borderRadius: 5, boxShadow: '2px 2px 0 var(--shadow)', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                <button style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }} onClick={() => onOpenSession(s)} type="button">
                  <div style={{ display: 'flex', gap: 0 }}>
                    <div style={{ width: 36, background: i === 0 ? 'var(--spot)' : 'var(--ink-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '2px solid var(--line-0)', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-disp)', fontSize: 7, fontWeight: 700, letterSpacing: '.1em', color: '#F0EBDF', opacity: 0.7 }}>SN</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, letterSpacing: '-.04em', color: '#F0EBDF' }}>{String(i + 1).padStart(2, '0')}</div>
                    </div>
                    <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13, letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.beat.title}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)', marginTop: 3, letterSpacing: '.06em' }}>
                            {s.name} · {s.takes.length} take{s.takes.length !== 1 ? 's' : ''}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-2)', marginTop: 2 }}>
                            {s.beat.bpm} BPM · {s.beat.key} · {s.takes.filter((t) => t.enabled).length}/{s.takes.length} active
                            {s.takes.some((t) => t.favorite) && <span style={{ color: 'var(--spot)', marginLeft: 4 }}>★</span>}
                          </div>
                        </div>
                        {i === 0 && <Stamp rotate={-3}>RECENT</Stamp>}
                      </div>
                      {s.takes.length > 0 && (
                        <div style={{ marginTop: 8, opacity: 0.5 }}>
                          <Waveform progress={0} seed={s.takes[0].seed} height={16} bars={40} color="var(--ink-0)" restColor="var(--ink-3)" />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                <div style={{ borderTop: '1px dashed color-mix(in srgb,var(--ink-0) 20%,transparent)', display: 'flex', background: 'var(--paper-1)' }}>
                  <button
                    style={{ all: 'unset', cursor: 'pointer', flex: 1, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRight: '1px dashed color-mix(in srgb,var(--ink-0) 20%,transparent)' }}
                    onClick={() => onOpenSession(s)}
                    type="button"
                  >
                    <Icon name="play" size={12} color="var(--spot)" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 10, letterSpacing: '.08em', color: 'var(--spot)' }}>OPEN</span>
                  </button>
                  <button
                    style={{ all: 'unset', cursor: sharingId ? 'wait' : 'pointer', flex: 1, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRight: '1px dashed color-mix(in srgb,var(--ink-0) 20%,transparent)', opacity: sharingId === s.id ? 0.6 : 1 }}
                    onClick={() => void handleShare(s)}
                    disabled={!!sharingId}
                    type="button"
                  >
                    <Icon name="share" size={12} color="var(--ink-2)" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.08em', color: 'var(--ink-2)' }}>{sharingId === s.id ? 'BOUNCING…' : 'SHARE'}</span>
                  </button>
                  {deleteId === s.id ? (
                    <div style={{ display: 'flex', gap: 0, flex: 1 }}>
                      <button
                        style={{ all: 'unset', cursor: 'pointer', flex: 1, padding: '8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(217,58,28,.08)' }}
                        onClick={() => { onDeleteSession(s.id); setDeleteId(null); showToast('Session deleted'); }}
                        type="button"
                      >
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 10, color: 'var(--spot)' }}>YES</span>
                      </button>
                      <button style={{ all: 'unset', cursor: 'pointer', flex: 1, padding: '8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteId(null)} type="button">
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 10, color: 'var(--ink-2)' }}>NO</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      style={{ all: 'unset', cursor: 'pointer', flex: 1, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      onClick={() => setDeleteId(s.id)}
                      type="button"
                    >
                      <Icon name="trash" size={12} color="var(--ink-2)" />
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.08em', color: 'var(--ink-2)' }}>DELETE</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
