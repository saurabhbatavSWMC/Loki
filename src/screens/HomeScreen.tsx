import { useRef, useState } from 'react';
import type { Beat, SessionWithBeat } from '../types';
import { fmtDur } from '../lib/format';
import { Icon, Grain } from '../components/Icon';
import { Sheet, MenuRow, PushBtn, PSwitch } from '../components/primitives';
import { TapeReel } from '../components/audio-visuals';
import { useDropZone } from '../hooks/useDropZone';
import { renderMix, downloadBlob } from '../audio/mix-export';
import { loadAudioBlob } from '../db/queries';
import { detectSource } from '../lib/url/resolve';
import { TapeSourceError } from '../lib/url/sources/types';

interface Props {
  beats: Beat[];
  sessions: SessionWithBeat[];
  onOpenSession: (s: SessionWithBeat) => void;
  onNewSession: () => void;
  onGoLibrary: (b?: Beat) => void;
  onGoSessions: () => void;
  onImport: (file: File) => void;
  onImportUrl: (
    url: string,
    onProgress?: (loaded: number, total?: number) => void,
    signal?: AbortSignal,
  ) => Promise<void>;
  onOpenSettings: () => void;
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
  onImportUrl,
  onOpenSettings,
  showToast,
  darkMode,
  onToggleDark,
}: Props) => {
  const [importOpen, setImportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [importTab, setImportTab] = useState<'device' | 'url'>('device');
  const [url, setUrl] = useState('');
  const [urlPhase, setUrlPhase] = useState<'idle' | 'resolving' | 'downloading' | 'error'>('idle');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlProgress, setUrlProgress] = useState<{ loaded: number; total?: number } | null>(null);
  const urlAbortRef = useRef<AbortController | null>(null);
  const [exportingAll, setExportingAll] = useState(false);

  const detectedSource = detectSource(url);
  const urlValid = detectedSource === 'youtube';
  const urlUnsupported = detectedSource === 'soundcloud';
  const urlBusy = urlPhase === 'resolving' || urlPhase === 'downloading';

  const errorMessage = (code: string): string => {
    switch (code) {
      case 'invalid_url': return 'That doesn\'t look like a YouTube link.';
      case 'unsupported_source': return 'Only YouTube links are supported right now.';
      case 'not_yet_supported': return 'SoundCloud isn\'t supported yet.';
      case 'live_stream_unsupported': return 'Live streams can\'t be imported.';
      case 'age_restricted': return 'This video is age-restricted.';
      case 'private_video': return 'This video is private.';
      case 'video_unavailable': return 'Video unavailable.';
      case 'no_audio_format': return 'No audio track found for this video.';
      case 'no_streaming_data': return 'YouTube blocked this video. Try another link.';
      default: return 'Couldn\'t load that URL — try again.';
    }
  };

  const handleFetchUrl = async () => {
    if (!urlValid || urlBusy) return;
    const controller = new AbortController();
    urlAbortRef.current = controller;
    setUrlError(null);
    setUrlPhase('resolving');
    setUrlProgress(null);
    try {
      let switched = false;
      await onImportUrl(
        url,
        (loaded, total) => {
          if (!switched) {
            switched = true;
            setUrlPhase('downloading');
          }
          setUrlProgress({ loaded, total });
        },
        controller.signal,
      );
      setImportOpen(false);
      setUrl('');
      setUrlPhase('idle');
      setUrlProgress(null);
    } catch (err) {
      if (controller.signal.aborted) {
        setUrlPhase('idle');
        return;
      }
      const code = err instanceof TapeSourceError ? err.code : 'fetch_failed';
      setUrlError(errorMessage(code));
      setUrlPhase('error');
    } finally {
      urlAbortRef.current = null;
    }
  };

  const cancelFetchUrl = () => {
    urlAbortRef.current?.abort();
  };

  const closeImport = () => {
    cancelFetchUrl();
    setImportOpen(false);
    setUrl('');
    setUrlPhase('idle');
    setUrlError(null);
    setUrlProgress(null);
  };

  const handleExportAll = async () => {
    if (exportingAll) return;
    const eligible = sessions.filter(
      (s) => s.takes.some((t) => t.enabled && t.audioBlobKey),
    );
    if (eligible.length === 0) {
      showToast('No sessions have recorded takes');
      return;
    }
    setExportingAll(true);
    try {
      let ok = 0;
      for (let i = 0; i < eligible.length; i++) {
        const s = eligible[i];
        showToast(`Exporting ${i + 1}/${eligible.length}: ${s.beat.title}`);
        try {
          // Mix down session takes + beat audio (best effort)
          const beatBlob = s.beat.audioBlobKey ? await loadAudioBlob(s.beat.audioBlobKey) : undefined;
          const blob = await renderMix({ takes: s.takes, beatBlob });
          const safeBeat = s.beat.title.replace(/[^a-z0-9]+/gi, '_');
          const safeName = s.name.replace(/[^a-z0-9]+/gi, '_') || `session_${i + 1}`;
          downloadBlob(blob, `${safeBeat}__${safeName}.wav`);
          ok++;
          // Tiny delay so the browser can flush each download
          await new Promise((r) => setTimeout(r, 350));
        } catch (e) {
          console.warn('[Export-all] failed for session', s.id, e);
        }
      }
      showToast(`Exported ${ok}/${eligible.length} session${eligible.length === 1 ? '' : 's'}`);
    } finally {
      setExportingAll(false);
    }
  };

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)', marginBottom: 0 }}>
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
        <MenuRow
          icon="share"
          label={exportingAll ? 'Exporting…' : 'Export all sessions'}
          hint={`${sessions.length} session${sessions.length === 1 ? '' : 's'} · downloads as WAVs`}
          onClick={() => { setMoreOpen(false); void handleExportAll(); }}
        />
        <MenuRow icon="list" label="Settings" hint="Audio, mic, format" onClick={() => { setMoreOpen(false); onOpenSettings(); }} />
        <MenuRow icon="more" label="About BeatStudio" hint="v1.0 · build 042" onClick={() => showToast('BeatStudio v1.0')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
          <div style={{ width: 28, height: 28, border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--paper-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
        <div style={{ background: '#0E0D10', border: 'none', borderRadius: 10, padding: '10px 12px', position: 'relative', overflow: 'hidden', boxShadow: 'inset 0 4px 10px rgba(0,0,0,.7)', zIndex: 3 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '30%', background: 'linear-gradient(to bottom,rgba(255,255,255,.05),transparent)', pointerEvents: 'none' }} />
          <div style={{ width: '100%', height: 80, background: 'var(--paper-0)', border: 'none', borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
            <Grain />
            <div style={{ position: 'absolute', top: 7, left: 7, right: 7, height: 20, background: 'var(--paper-1)', border: 'none', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
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
            <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', width: '55%', height: 9, border: '1px solid var(--border-subtle)', borderRadius: 6, background: 'var(--paper-1)', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '0 6px' }}>
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

      <div style={{ background: 'var(--paper-1)', borderBottom: '1px solid var(--border-subtle)', padding: '6px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 3, flexShrink: 0 }}>
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
              <div style={{ background: 'var(--spot)', color: '#F0EBDF', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800, borderRadius: 12, padding: '3px 9px', border: 'none', boxShadow: '0 2px 6px rgba(217,58,28,.25)' }}>
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
                    border: 'none',
                    borderRadius: 12,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    fontSize: 10,
                    letterSpacing: '.1em',
                    padding: '5px 12px',
                    boxShadow: '0 4px 12px rgba(217,58,28,.30), var(--elev-1)',
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
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'var(--paper-1)', boxShadow: 'var(--elev-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
              <div style={{ background: 'var(--ink-0)', color: '#F0EBDF', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800, borderRadius: 12, padding: '3px 9px', border: 'none', boxShadow: 'var(--elev-1)' }}>
                {beats.length}
              </div>
              <Icon name="next" size={16} color="var(--ink-0)" />
            </div>
          </div>
          {beats.slice(0, 2).map((b, i) => {
            const sideColor = b.stamp === 'NEW' ? 'var(--spot)' : b.stamp === 'FAV' ? 'var(--ink-0)' : 'var(--ink-2)';
            return (
              <div key={b.id} className="beat-row-home" onClick={() => onGoLibrary(b)}>
                <div style={{ width: 26, height: 26, background: sideColor, border: 'none', borderRadius: 8, boxShadow: 'var(--elev-1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                      <span style={{ marginLeft: 8, fontSize: 8, color: sideColor, border: `1.5px solid ${sideColor}`, borderRadius: 12, padding: '1px 8px', letterSpacing: '.1em' }}>
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
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--spot)', border: 'none', boxShadow: '0 2px 8px rgba(217,58,28,.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="upload" size={11} color="#F0EBDF" stroke={2.5} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 11, letterSpacing: '.06em', color: 'var(--ink-0)' }}>LOAD NEW TAPE</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)' }}>mp3 · wav · m4a</span>
          </div>
        </div>
      </div>

      <Sheet open={importOpen} onClose={closeImport} title="LOAD NEW TAPE">
        <div style={{ display: 'flex', gap: 4, background: 'var(--paper-1)', border: '1px solid var(--border-subtle)', borderRadius: 22, padding: 3, marginBottom: 14, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.06)' }}>
          {(['device', 'url'] as const).map((t) => (
            <button key={t} className={`import-tab${importTab === t ? ' active' : ''}`} onClick={() => setImportTab(t)} type="button" disabled={urlBusy}>
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
                borderColor: dropActive ? 'var(--spot)' : 'var(--border-medium)',
                borderRadius: 18,
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
                  border: 'none',
                  boxShadow: '0 4px 14px rgba(217,58,28,.35)',
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
              TAPE URL
            </div>
            <input
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (urlPhase === 'error') { setUrlPhase('idle'); setUrlError(null); } }}
              placeholder="https://youtube.com/watch?v=…"
              disabled={urlBusy}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--paper-1)', border: '1px solid var(--border-medium)', borderRadius: 12, padding: '10px 12px', fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--ink-0)' }}
            />
            <div style={{ minHeight: 18, marginTop: 6, fontFamily: 'JetBrains Mono', fontSize: 10, color: urlPhase === 'error' ? 'var(--spot)' : 'var(--ink-2)' }}>
              {urlPhase === 'error' && urlError}
              {urlPhase === 'idle' && url && !urlValid && (urlUnsupported ? 'SoundCloud not supported yet.' : 'YouTube only for now.')}
              {urlPhase === 'resolving' && 'Looking up…'}
              {urlPhase === 'downloading' && (
                urlProgress?.total
                  ? `Downloading ${Math.floor((urlProgress.loaded / urlProgress.total) * 100)}%`
                  : `Downloading ${(urlProgress?.loaded ? (urlProgress.loaded / 1024 / 1024).toFixed(1) : '0.0')} MB`
              )}
            </div>
            {urlPhase === 'downloading' && urlProgress?.total && (
              <div style={{ height: 4, background: 'var(--paper-1)', border: '1px solid var(--border-subtle)', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                <div style={{ height: '100%', width: `${Math.floor((urlProgress.loaded / urlProgress.total) * 100)}%`, background: 'var(--spot)', transition: 'width 120ms ease' }} />
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <PushBtn
                variant="rec"
                size="md"
                style={{ width: '100%' }}
                onClick={urlBusy ? cancelFetchUrl : handleFetchUrl}
                disabled={!urlBusy && !urlValid}
              >
                {urlBusy ? '■ Cancel' : '▸ Fetch & load'}
              </PushBtn>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
