import { useRef, useState } from 'react';
import type { Beat, SessionWithBeat } from '../types';
import { fmtDur } from '../lib/format';
import { Icon, Grain } from '../components/Icon';
import { Sheet, MenuRow, PushBtn, PSwitch } from '../components/primitives';
import { TapeReel } from '../components/audio-visuals';
import { useDropZone } from '../hooks/useDropZone';

interface Props {
  beats: Beat[];
  sessions: SessionWithBeat[];
  onOpenSession: (s: SessionWithBeat) => void;
  onNewSession: () => void;
  onGoLibrary: (b?: Beat) => void;
  onGoSessions: () => void;
  onImport: (file: File) => void;
  showToast: (msg: string) => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

export const HomeScreen = ({
  beats,
  sessions,
  onOpenSession,
  onNewSession,
  onGoLibrary,
  onGoSessions,
  onImport,
  showToast,
  darkMode,
  onToggleDark,
}: Props) => {
  const [importOpen, setImportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [importTab, setImportTab] = useState<'device' | 'url' | 'youtube' | 'soundcloud'>('device');
  const [url, setUrl] = useState('');

  const recentSession = sessions[0] || null;
  const totalTakes = sessions.reduce((acc, s) => acc + s.takes.length, 0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const doImport = (file: File) => {
    setImportOpen(false);
    setUrl('');
    onImport(file);
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    console.log('[Import] File selected:', file.name, file.type, file.size);
    e.target.value = '';
    doImport(file);
  };

  const { ref: dropRef, active: dropActive } = useDropZone<HTMLDivElement>({
    onFile: doImport,
    accept: (file) => file.type.startsWith('audio/') || /\.(mp3|wav|aiff|m4a|ogg|flac)$/i.test(file.name),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--paper-0)', overflow: 'hidden' }}>
      <Grain />

      <div style={{ padding: '16px 20px 0', flexShrink: 0, position: 'relative', zIndex: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1.5px solid var(--line-0)', marginBottom: 0 }}>
          <div style={{ width: 60 }} />
          <span style={{ fontFamily: 'var(--font-disp)', fontSize: 10, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-0)' }}>HOME</span>
          <div style={{ width: 60, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="icon-btn" onClick={() => setMoreOpen(true)} title="Options" type="button">
              <Icon name="more" size={18} color="var(--ink-0)" />
            </button>
          </div>
        </div>
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="OPTIONS">
        <MenuRow icon="upload" label="Import Beat" hint="Device, URL, or streaming" onClick={() => { setMoreOpen(false); setImportOpen(true); }} />
        <MenuRow icon="share" label="Export all sessions" hint="Zip of every mix" onClick={() => showToast('Export all — coming soon')} />
        <MenuRow icon="list" label="Settings" hint="Audio, mic, format" onClick={() => showToast('Settings — coming soon')} />
        <MenuRow icon="more" label="About BeatStudio" hint="v1.0 · build 042" onClick={() => showToast('BeatStudio v1.0')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderTop: '1px dashed rgba(127,127,127,.25)', marginTop: 4 }}>
          <div style={{ width: 28, height: 28, border: '1.5px solid var(--line-0)', borderRadius: 5, background: 'var(--paper-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-0)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              {darkMode ? (
                <>
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </>
              ) : (
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              )}
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 12, letterSpacing: '.04em', color: 'var(--ink-0)', textTransform: 'uppercase' }}>
              {darkMode ? 'Studio Mode' : 'Dark Mode'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)', marginTop: 2 }}>
              {darkMode ? 'Lights on' : 'Go dark'}
            </div>
          </div>
          <PSwitch on={darkMode} onChange={() => onToggleDark()} size="sm" />
        </div>
      </Sheet>

      {/* Deck hero */}
      <div style={{ background: 'var(--deck)', padding: '16px 20px 12px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 80%,rgba(217,58,28,.1) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <Grain />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, position: 'relative', zIndex: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--spot)', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
            <span style={{ fontFamily: 'var(--font-disp)', fontSize: 9, fontWeight: 700, letterSpacing: '.24em', color: '#F0EBDF' }}>BEATSTUDIO™</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.14em', color: '#C9C5BC' }}>DECK-01</span>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: recentSession ? '#7EC37A' : 'var(--ink-2)', boxShadow: recentSession ? '0 0 4px rgba(126,195,122,.8)' : 'none' }} />
          </div>
        </div>
        <div style={{ background: '#0E0D10', border: '2px solid #000', borderRadius: 6, padding: '10px 12px', position: 'relative', overflow: 'hidden', boxShadow: 'inset 0 4px 10px rgba(0,0,0,.7)', zIndex: 3 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '30%', background: 'linear-gradient(to bottom,rgba(255,255,255,.05),transparent)', pointerEvents: 'none' }} />
          <div style={{ width: '100%', height: 80, background: 'var(--paper-0)', border: '2px solid var(--line-0)', borderRadius: 5, position: 'relative', overflow: 'hidden' }}>
            <Grain />
            <div style={{ position: 'absolute', top: 7, left: 7, right: 7, height: 20, background: 'var(--paper-1)', border: '1.5px solid var(--line-0)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
              <span style={{ fontFamily: 'var(--font-disp)', fontSize: 8, fontWeight: 700, letterSpacing: '.2em', color: 'var(--spot)' }}>
                {recentSession ? `SIDE ${recentSession.beat.side}` : 'SIDE —'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'center', margin: '0 6px' }}>
                {recentSession ? recentSession.beat.title : 'NO TAPE LOADED'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-2)', flexShrink: 0 }}>
                {recentSession ? `${recentSession.beat.bpm}BPM` : ''}
              </span>
            </div>
            <div style={{ position: 'absolute', top: 34, left: 24, width: 32, height: 32, animation: 'reel-spin 5s linear infinite' }}>
              <TapeReel size={32} spinning speed={5} />
            </div>
            <div style={{ position: 'absolute', top: 34, right: 24, width: 32, height: 32, animation: 'reel-spin 6.5s linear infinite' }}>
              <TapeReel size={32} spinning speed={6.5} />
            </div>
            <div style={{ position: 'absolute', top: 50, left: 58, right: 58, height: 2, background: 'var(--ink-0)' }} />
            <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', width: '55%', height: 9, border: '1.5px solid var(--line-0)', borderRadius: 4, background: 'var(--paper-1)', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '0 6px' }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--ink-0)' }} />
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.14em', color: '#C9C5BC', position: 'relative', zIndex: 3 }}>
          {recentSession ? (
            <>
              <span>{recentSession.beat.format} · 44.1kHz</span>
              <span>{recentSession.beat.key}</span>
              <span>{recentSession.beat.bpm} BPM</span>
              <span>{fmtDur(recentSession.beat.duration)}</span>
            </>
          ) : (
            <>
              <span>——</span>
              <span>——</span>
              <span>—— BPM</span>
              <span>—:——</span>
            </>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--paper-1)', borderBottom: '2px solid var(--line-0)', padding: '6px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 3, flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-disp)', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: 'var(--ink-2)' }}>
          {sessions.length} SESSION{sessions.length !== 1 ? 'S' : ''}
        </span>
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        <span style={{ fontFamily: 'var(--font-disp)', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: 'var(--ink-2)' }}>
          {beats.length} BEATS
        </span>
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        <span style={{ fontFamily: 'var(--font-disp)', fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: 'var(--spot)' }}>
          {totalTakes} TAKES
        </span>
      </div>

      <div style={{ flex: 1, padding: '12px 20px 0', position: 'relative', zIndex: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Sessions card */}
        <div className="section-card" style={{ marginBottom: 0, flex: '0 0 auto' }}>
          <div className="section-card-header" onClick={onGoSessions} role="button" tabIndex={0}>
            <div>
              <div style={{ fontFamily: 'var(--font-disp)', fontSize: 8, fontWeight: 700, letterSpacing: '.24em', color: 'var(--spot)' }}>§01</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, letterSpacing: '-.03em', lineHeight: 1, marginTop: 2 }}>SESSIONS</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ background: 'var(--spot)', color: '#F0EBDF', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800, borderRadius: 4, padding: '3px 7px', border: '1.5px solid var(--line-0)' }}>
                {sessions.length}
              </div>
              <Icon name="next" size={16} color="var(--ink-0)" />
            </div>
          </div>
          {sessions.slice(0, 2).map((s, i) => (
            <div key={s.id} className="session-row" onClick={() => onOpenSession(s)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: i === 0 ? 800 : 700,
                    fontSize: 12,
                    letterSpacing: '-.01em',
                    color: i === 0 ? 'var(--ink-0)' : 'var(--ink-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.beat.title}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)', marginTop: 2 }}>
                  {s.takes.length} take{s.takes.length !== 1 ? 's' : ''} · {s.beat.bpm} BPM · {s.createdAt}
                  {s.takes.some((t) => t.favorite) && <span style={{ color: 'var(--spot)', marginLeft: 6 }}>★</span>}
                </div>
              </div>
              {i === 0 ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSession(s);
                  }}
                  style={{
                    background: 'var(--spot)',
                    color: '#F0EBDF',
                    border: '2px solid var(--line-0)',
                    borderRadius: 5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    fontSize: 10,
                    letterSpacing: '.1em',
                    padding: '5px 10px',
                    boxShadow: '2px 2px 0 var(--shadow)',
                    flexShrink: 0,
                  }}
                  type="button"
                >
                  ▸ OPEN
                </button>
              ) : (
                <Icon name="next" size={14} color="var(--ink-2)" />
              )}
            </div>
          ))}
          <div className="card-footer-btn" onClick={onNewSession} role="button" tabIndex={0}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--line-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="plus" size={11} color="var(--ink-0)" stroke={2.5} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 11, letterSpacing: '.06em', color: 'var(--ink-0)' }}>NEW SESSION</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)' }}>pick a beat →</span>
          </div>
        </div>

        {/* Beats card */}
        <div className="section-card" style={{ marginBottom: 0, flex: '0 0 auto' }}>
          <div className="section-card-header" onClick={() => onGoLibrary()} role="button" tabIndex={0}>
            <div>
              <div style={{ fontFamily: 'var(--font-disp)', fontSize: 8, fontWeight: 700, letterSpacing: '.24em', color: 'var(--ink-2)' }}>§02</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, letterSpacing: '-.03em', lineHeight: 1, marginTop: 2 }}>BEATS ON FILE</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ background: 'var(--ink-0)', color: '#F0EBDF', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800, borderRadius: 4, padding: '3px 7px', border: '1.5px solid var(--line-0)' }}>
                {beats.length}
              </div>
              <Icon name="next" size={16} color="var(--ink-0)" />
            </div>
          </div>
          {beats.slice(0, 2).map((b, i) => {
            const sideColor = b.stamp === 'NEW' ? 'var(--spot)' : b.stamp === 'FAV' ? 'var(--ink-0)' : 'var(--ink-2)';
            return (
              <div key={b.id} className="beat-row-home" onClick={() => onGoLibrary(b)}>
                <div style={{ width: 26, height: 26, background: sideColor, border: '2px solid var(--line-0)', borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-disp)', fontSize: 6, fontWeight: 700, color: '#F0EBDF', letterSpacing: '.1em' }}>SIDE</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 10, color: '#F0EBDF', lineHeight: 1 }}>{b.side}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: i === 0 ? 800 : 700,
                      fontSize: 12,
                      color: i === 0 ? 'var(--ink-0)' : 'var(--ink-1)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.title}
                    {b.stamp && (
                      <span style={{ marginLeft: 8, fontSize: 8, color: sideColor, border: `1.5px solid ${sideColor}`, padding: '1px 4px', letterSpacing: '.1em' }}>
                        {b.stamp}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)', marginTop: 1 }}>
                    {b.bpm} BPM · {b.key} · {b.format}
                  </div>
                </div>
                <Icon name="next" size={14} color="var(--ink-2)" />
              </div>
            );
          })}
          <div className="card-footer-btn" onClick={() => setImportOpen(true)} role="button" tabIndex={0}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--spot)', border: '2px solid var(--line-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="upload" size={11} color="#F0EBDF" stroke={2.5} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 11, letterSpacing: '.06em', color: 'var(--ink-0)' }}>LOAD NEW TAPE</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)' }}>mp3 · wav · m4a</span>
          </div>
        </div>
      </div>

      <Sheet open={importOpen} onClose={() => { setImportOpen(false); setUrl(''); }} title="LOAD NEW TAPE">
        <div style={{ display: 'flex', gap: 4, background: 'var(--paper-1)', border: '2px solid var(--line-0)', borderRadius: 5, padding: 3, marginBottom: 14 }}>
          {(['device', 'url', 'youtube', 'soundcloud'] as const).map((t) => (
            <button key={t} className={`import-tab${importTab === t ? ' active' : ''}`} onClick={() => setImportTab(t)} type="button">
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        {importTab === 'device' ? (
          <div>
            <div
              ref={dropRef}
              onClick={handleChooseFile}
              style={{
                border: '2px dashed',
                borderColor: dropActive ? 'var(--spot)' : 'var(--line-0)',
                borderRadius: 5,
                padding: 28,
                textAlign: 'center',
                background: dropActive ? 'color-mix(in srgb, var(--spot) 8%, var(--paper-1))' : 'var(--paper-1)',
                cursor: 'pointer',
                transition: 'border-color 120ms ease, background 120ms ease',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'var(--spot)',
                  border: '2px solid var(--line-0)',
                  margin: '0 auto 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: dropActive ? 'scale(1.1)' : 'none',
                  transition: 'transform 120ms ease',
                }}
              >
                <Icon name="upload" size={18} color="#F0EBDF" stroke={2.5} />
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 13, color: dropActive ? 'var(--spot)' : 'var(--ink-0)' }}>
                {dropActive ? 'DROP TO LOAD' : 'DROP OR BROWSE'}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', marginTop: 4 }}>mp3 · wav · aiff · m4a · ≤50mb</div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.aiff,.m4a,.ogg,.flac"
              style={{ display: 'none' }}
              onChange={handleFileSelected}
            />
            <div style={{ marginTop: 12 }}>
              <PushBtn variant="ink" size="md" style={{ width: '100%' }} onClick={handleChooseFile}>
                ▸ Choose file
              </PushBtn>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', marginBottom: 6 }}>
              {importTab === 'youtube' ? 'YOUTUBE URL' : importTab === 'soundcloud' ? 'SOUNDCLOUD URL' : 'AUDIO URL'}
            </div>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={importTab === 'youtube' ? 'https://youtube.com/watch?v=…' : importTab === 'soundcloud' ? 'https://soundcloud.com/…' : 'https://…'}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--paper-1)', border: '2px solid var(--line-0)', borderRadius: 5, padding: '10px 12px', fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--ink-0)' }}
            />
            <div style={{ marginTop: 14 }}>
              <PushBtn
                variant="rec"
                size="md"
                style={{ width: '100%' }}
                onClick={() => {
                  setImportOpen(false);
                  setUrl('');
                  showToast('URL fetch — coming soon');
                }}
                disabled={!url}
              >
                ▸ Fetch &amp; load
              </PushBtn>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
