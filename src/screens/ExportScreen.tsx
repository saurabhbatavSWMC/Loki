import { useState } from 'react';
import type { Beat, ExportOpts, Take } from '../types';
import { fmtDur, fmtTC } from '../lib/format';
import { Icon, IconBtn, Grain } from '../components/Icon';
import { PushBtn, ScreenHeader, Stamp } from '../components/primitives';
import { renderMix, downloadBlob } from '../audio/mix-export';
import { loadAudioBlob } from '../db/queries';

interface Props {
  beat: Beat;
  takes: Take[];
  exportSerial: number;
  onBack: () => void;
  onExport: (opts: ExportOpts, downloadedBlob?: Blob) => void;
  showToast: (msg: string) => void;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontFamily: 'JetBrains Mono' }}>
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.18em', color: 'var(--ink-2)' }}>{label}</span>
    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-0)' }}>{value}</span>
  </div>
);

export const ExportScreen = ({ beat, takes, exportSerial, onBack, onExport, showToast }: Props) => {
  const [format, setFormat] = useState<'MP3' | 'WAV'>('WAV');
  const [quality, setQuality] = useState('16');
  const [mixType, setMixType] = useState<'full' | 'vocals' | 'beat'>('full');
  const [printing, setPrinting] = useState(false);

  const qualOpts = format === 'MP3' ? ['128', '192', '320'] : ['16', '24'];
  const qualUnit = format === 'MP3' ? 'kbps' : 'bit';

  const estSize = (): string => {
    const dur = beat.duration / 60;
    if (format === 'MP3') return `~${(dur * (quality === '320' ? 2.8 : quality === '192' ? 1.8 : 1.2)).toFixed(1)} MB`;
    return `~${(dur * (quality === '24' ? 15 : 10)).toFixed(1)} MB`;
  };

  const enabledCount = takes.filter((t) => t.enabled).length;
  const hasTakeAudio = takes.some((t) => t.enabled && t.audioBlobKey);
  const hasBeatAudio = !!beat.audioBlobKey;

  // Whether the chosen mix mode has anything to render
  const canExport =
    (mixType === 'full' && (hasTakeAudio || hasBeatAudio)) ||
    (mixType === 'vocals' && hasTakeAudio) ||
    (mixType === 'beat' && hasBeatAudio);

  const handleExport = async () => {
    setPrinting(true);
    try {
      const opts: ExportOpts = { format, quality, mixType };
      if (canExport) {
        const beatBlob = beat.audioBlobKey ? await loadAudioBlob(beat.audioBlobKey) : undefined;
        const blob = await renderMix({ takes, beatBlob, mode: mixType });
        const suffix = mixType === 'vocals' ? 'vocals' : mixType === 'beat' ? 'beat' : 'mix';
        const filename = `${beat.title.replace(/[^a-z0-9]+/gi, '_')}_${suffix}.wav`;
        downloadBlob(blob, filename);
        onExport(opts, blob);
      } else {
        // Seeded data only — still print the receipt for visual continuity
        await new Promise((r) => setTimeout(r, 800));
        onExport(opts);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      showToast(msg);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <Grain />

      <div className="fixed-header lib-sticky" style={{ padding: '16px 20px 0' }}>
        <ScreenHeader left={<IconBtn name="close" onClick={onBack} title="Close" />} title="EXPORT MIX" right={null} />

        <div style={{ background: 'var(--paper-0)', border: '2px solid var(--line-0)', borderRadius: 5, padding: '12px 14px', marginBottom: 12, boxShadow: '3px 3px 0 var(--shadow)', position: 'relative', zIndex: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.24em', color: 'var(--spot)' }}>
                EXPORT FORM · N°{String(exportSerial).padStart(2, '0')}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 18, letterSpacing: '-.03em', marginTop: 3 }}>{beat.title}</div>
            </div>
            <Stamp rotate={3}>READY</Stamp>
          </div>
          <div style={{ display: 'flex', gap: 16, fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', borderTop: '1px dashed color-mix(in srgb,var(--ink-0) 30%,transparent)', paddingTop: 8 }}>
            <span>{beat.bpm} BPM</span>
            <span>{beat.key}</span>
            <span>{enabledCount} TAKES</span>
            <span>{fmtDur(beat.duration)}</span>
          </div>
        </div>
      </div>

      <div className="scroll-body" style={{ padding: '0 20px' }}>
        <div style={{ paddingTop: 4, paddingBottom: 8 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.24em', color: 'var(--ink-2)', marginBottom: 6 }}>MIXDOWN TYPE</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([
                { id: 'full' as const, label: 'Full mix', avail: hasTakeAudio || hasBeatAudio },
                { id: 'vocals' as const, label: 'Vocals only', avail: hasTakeAudio },
                { id: 'beat' as const, label: 'Beat only', avail: hasBeatAudio },
              ]).map((o) => (
                <button
                  key={o.id}
                  className={`chip${mixType === o.id ? ' active-ink' : ''}`}
                  onClick={() => o.avail && setMixType(o.id)}
                  disabled={!o.avail}
                  style={{ fontSize: 11, opacity: o.avail ? 1 : 0.4, cursor: o.avail ? 'pointer' : 'not-allowed' }}
                  type="button"
                  title={!o.avail ? (o.id === 'beat' ? 'No beat audio loaded' : 'No takes recorded') : undefined}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.24em', color: 'var(--ink-2)', marginBottom: 6 }}>FORMAT</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['MP3', 'WAV'] as const).map((f) => (
                <button
                  key={f}
                  className={`chip${format === f ? ' active-ink' : ''}`}
                  onClick={() => { setFormat(f); setQuality(f === 'MP3' ? '320' : '16'); }}
                  type="button"
                >
                  {f}
                </button>
              ))}
            </div>
            {format === 'MP3' && (
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'var(--ink-2)', marginTop: 4 }}>
                Note: in-browser export emits WAV; MP3 conversion happens externally.
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.24em', color: 'var(--ink-2)', marginBottom: 6 }}>QUALITY</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {qualOpts.map((q) => (
                <button key={q} className={`chip${quality === q ? ' active-spot' : ''}`} onClick={() => setQuality(q)} style={{ fontSize: 11 }} type="button">
                  {q} {qualUnit}
                </button>
              ))}
            </div>
          </div>

          <div style={{ border: '2px solid var(--line-0)', borderRadius: 5, padding: '10px 14px', background: 'var(--paper-1)' }}>
            <Row label="EST. SIZE" value={estSize()} />
            <Row label="SAMPLE RATE" value="44.1 kHz" />
            <Row label="TAKES IN MIX" value={mixType === 'beat' ? '0 (BEAT ONLY)' : `${enabledCount} ENABLED`} />
            <Row label="BEAT TRACK" value={mixType === 'vocals' ? 'EXCLUDED' : hasBeatAudio ? 'INCLUDED' : 'NONE'} />
            <Row label="SOURCE" value={(hasTakeAudio || hasBeatAudio) ? 'RECORDED' : 'SEEDED'} />
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.24em', color: 'var(--ink-2)', marginBottom: 8 }}>TAKES IN EXPORT</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {takes.map((t, i) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: t.enabled ? 'var(--paper-0)' : 'var(--paper-1)',
                    border: '1.5px solid var(--line-0)',
                    borderRadius: 5,
                    opacity: t.enabled ? 1 : 0.55,
                  }}
                >
                  <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 11, color: 'var(--ink-2)', width: 20 }}>{String(i + 1).padStart(2, '0')}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.label || `Take ${i + 1}`}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'var(--ink-2)', marginTop: 1 }}>{fmtTC(t.durationMs)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t.favorite && <Icon name="star" size={12} color="var(--spot)" />}
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.enabled ? '#9BC653' : 'var(--ink-3)', border: '1.5px solid var(--line-0)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="fixed-footer">
        <PushBtn variant="rec" size="lg" style={{ width: '100%', position: 'relative', zIndex: 3 }} onClick={handleExport} disabled={printing || !canExport}>
          {printing ? '▸ PRINTING…' : canExport ? '▸ EXPORT MIX' : '▸ NOTHING TO MIX'}
        </PushBtn>
      </div>
    </div>
  );
};
