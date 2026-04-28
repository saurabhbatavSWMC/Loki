import { useRef, useState } from 'react';
import type { Beat } from '../types';
import { fmtDur } from '../lib/format';
import { Icon, Grain } from '../components/Icon';
import { Sheet, MenuRow, PushBtn, PSwitch, Stamp, TapeLabel } from '../components/primitives';
import { Cassette } from '../components/audio-visuals';
import { useDropZone } from '../hooks/useDropZone';

interface Props {
  beats: Beat[];
  onOpenBeat: (b: Beat) => void;
  onAddBeat: (file: File) => void;
  showToast: (msg: string) => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

const SORT_CYCLE: Array<'DATE' | 'TITLE' | 'BPM'> = ['DATE', 'TITLE', 'BPM'];

export const LibraryScreen = ({ beats, onOpenBeat, onAddBeat, showToast, darkMode, onToggleDark }: Props) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [query, setQuery] = useState('');
  const [importTab, setImportTab] = useState<'device' | 'url' | 'youtube' | 'soundcloud'>('device');
  const [url, setUrl] = useState('');
  const [sortMode, setSortMode] = useState<'DATE' | 'TITLE' | 'BPM'>('DATE');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [favOnly, setFavOnly] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const dirMul = sortDir === 'asc' ? 1 : -1;
  const filtered = beats
    .filter((b) => (favOnly ? b.stamp === 'FAV' : true))
    .filter((b) => (query ? b.title.toLowerCase().includes(query.toLowerCase()) : true))
    .sort((a, b) => {
      if (sortMode === 'TITLE') return a.title.localeCompare(b.title) * dirMul;
      if (sortMode === 'BPM') return (a.bpm - b.bpm) * dirMul;
      return 0;
    });

  const openSearch = () => {
    setSearchActive(true);
    setTimeout(() => searchRef.current?.focus(), 60);
  };
  const closeSearch = () => {
    setSearchActive(false);
    setQuery('');
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const doImport = (file: File) => {
    setImportOpen(false);
    setUrl('');
    onAddBeat(file);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <Grain />
      <div className="fixed-header" style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        {searchActive ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12, borderBottom: '1.5px solid var(--line-0)', marginBottom: 16, animation: 'search-expand 150ms var(--ease) both' }}>
            <Icon name="search" size={15} color="var(--ink-2)" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a beat…"
              style={{ all: 'unset', flex: 1, fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 14, color: 'var(--ink-0)' }}
            />
            {query ? (
              <button style={{ all: 'unset', cursor: 'pointer', padding: 4 }} onClick={() => setQuery('')} type="button">
                <Icon name="close" size={14} color="var(--ink-2)" />
              </button>
            ) : null}
            <button
              style={{ all: 'unset', cursor: 'pointer', fontFamily: 'Space Mono', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: 'var(--ink-2)', paddingLeft: 6 }}
              onClick={closeSearch}
              type="button"
            >
              CANCEL
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1.5px solid var(--line-0)', marginBottom: 16 }}>
            <div style={{ width: 60 }} />
            <span style={{ fontFamily: 'var(--font-disp)', fontSize: 10, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-0)' }}>CAT. 001</span>
            <div style={{ width: 60, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
              <button className="icon-btn" onClick={openSearch} title="Search" type="button">
                <Icon name="search" size={18} color="var(--ink-0)" />
              </button>
              <button className="icon-btn" onClick={() => setMoreOpen(true)} title="More options" type="button">
                <Icon name="more" size={18} color="var(--ink-0)" />
              </button>
            </div>
          </div>
        )}

        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="LIBRARY OPTIONS">
          <MenuRow icon="upload" label="Import Beat" hint="Device, URL, or streaming" onClick={() => { setMoreOpen(false); setImportOpen(true); }} />
          <MenuRow
            icon="star"
            label="Favorites only"
            hint={favOnly ? 'Showing favorites' : 'Show all beats'}
            onClick={() => { setMoreOpen(false); setFavOnly((f) => !f); }}
            right={
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: favOnly ? 'var(--spot)' : 'var(--ink-2)' }}>
                {favOnly ? 'ON' : 'OFF'}
              </span>
            }
          />
          <MenuRow icon="share" label="Export all sessions" hint="Zip of every mix" onClick={() => showToast('Export all — coming soon')} />
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

        {!searchActive && (
          <div style={{ marginBottom: 14, position: 'relative', zIndex: 3 }}>
            <div style={{ fontFamily: 'Space Mono,monospace', fontSize: 10, fontWeight: 700, letterSpacing: '.24em', color: 'var(--spot)' }}>MY LIBRARY / VOL.1</div>
            <h1 style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 34, lineHeight: 0.95, margin: '6px 0 0', letterSpacing: '-.04em', color: 'var(--ink-0)' }}>
              BEATS<br />
              <span style={{ color: 'var(--spot)' }}>ON FILE</span>
            </h1>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 500, color: 'var(--ink-2)', borderTop: '1px dashed color-mix(in srgb,var(--ink-0) 30%,transparent)', paddingTop: 8 }}>
              <span>TOTAL · {beats.length}</span>
              <button
                style={{ all: 'unset', cursor: 'pointer', fontWeight: 700, color: 'var(--ink-1)' }}
                onClick={() => {
                  // Same mode → flip direction; otherwise cycle to next mode (asc)
                  setSortMode((m) => {
                    const next = SORT_CYCLE[(SORT_CYCLE.indexOf(m) + 1) % SORT_CYCLE.length];
                    return next;
                  });
                }}
                onDoubleClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                type="button"
                aria-label={`Sort by ${sortMode}, ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
              >
                SORTED · {sortMode} {sortDir === 'asc' ? '▴' : '▾'}
              </button>
              <span style={{ color: favOnly ? 'var(--spot)' : 'var(--ink-2)' }}>{favOnly ? '★ FAV' : 'ALL'}</span>
            </div>
          </div>
        )}

        {!searchActive && (
          <button
            onClick={() => setImportOpen(true)}
            style={{ all: 'unset', width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: 10, background: 'var(--paper-1)', border: '2px dashed var(--line-0)', borderRadius: 5, marginBottom: 12 }}
            type="button"
          >
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--spot)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--line-0)' }}>
              <Icon name="plus" size={14} color="#F0EBDF" stroke={2.5} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 12, letterSpacing: '.04em', color: 'var(--ink-0)' }}>LOAD NEW TAPE</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--ink-2)', marginTop: 2 }}>mp3 · wav · aiff · m4a · ≤50mb</div>
            </div>
          </button>
        )}

        {searchActive && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: -6 }}>
            <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)' }}>
              {query
                ? `${filtered.length} OF ${beats.length} MATCH${filtered.length !== 1 ? 'ES' : ''}`
                : `${beats.length} BEAT${beats.length !== 1 ? 'S' : ''}`}
            </span>
            {favOnly && <span style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.14em', color: 'var(--spot)' }}>★ FAV</span>}
          </div>
        )}
      </div>

      <div className="scroll-body" style={{ padding: '0 20px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
          {!searchActive && beats.length === 0 && !favOnly && (
            <div
              style={{
                background: 'var(--paper-1)',
                border: '2px dashed var(--line-0)',
                borderRadius: 5,
                padding: '24px 16px 28px',
                textAlign: 'center',
                position: 'relative',
              }}
            >
              <div style={{ position: 'absolute', top: 12, right: 12 }}>
                <Stamp rotate={6}>EMPTY</Stamp>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, opacity: 0.45, filter: 'grayscale(0.3)' }}>
                <Cassette width={220} title="" side="A" bpm={0} spinning={false} />
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 13, color: 'var(--ink-0)', marginBottom: 4 }}>No beats yet.</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--ink-2)' }}>Import one to start.</div>
            </div>
          )}
          {favOnly && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)' }}>No favorites yet.</div>
          )}
          {searchActive && query && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 36, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>—</div>
              No beats match "{query}"
            </div>
          )}
          {filtered.map((b) => (
            <div key={b.id} style={{ position: 'relative' }}>
              {searchActive && query && (
                <div style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, border: '2px solid var(--spot)', borderRadius: 7, pointerEvents: 'none', opacity: 0.35 }} />
              )}
              <TapeLabel
                title={b.title}
                meta={`${b.bpm} BPM · ${b.key} · ${fmtDur(b.duration)} · ${b.format}`}
                side={b.side}
                stamp={b.stamp ?? undefined}
                color={b.stamp === 'NEW' ? 'var(--spot)' : b.stamp === 'FAV' ? 'var(--ink-0)' : 'var(--ink-2)'}
                highlight={searchActive && query ? query : undefined}
                onClick={() => {
                  if (searchActive) closeSearch();
                  onOpenBeat(b);
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
