import { useState } from 'react';
import type { Beat, ExportOpts } from '../types';
import { fmtDur } from '../lib/format';
import { Icon, Grain } from '../components/Icon';
import { PushBtn, ScreenHeader } from '../components/primitives';
import { shareFile } from '../lib/share';

interface Props {
  beat: Beat;
  exportOpts: ExportOpts | null;
  exportSerial: number;
  exportedBlob: Blob | null;
  onDone: () => void;
  showToast: (msg: string) => void;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontFamily: 'JetBrains Mono' }}>
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.18em', color: 'var(--ink-2)' }}>{label}</span>
    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-0)' }}>{value}</span>
  </div>
);

export const ExportSuccessScreen = ({ beat, exportOpts, exportSerial, exportedBlob, onDone, showToast }: Props) => {
  const [saved, setSaved] = useState(false);
  const format = exportOpts?.format ?? 'WAV';
  const quality = exportOpts?.quality ?? '16';

  const realSize = exportedBlob ? `${(exportedBlob.size / (1024 * 1024)).toFixed(1)} MB` : null;
  const estSize =
    realSize ??
    (format === 'MP3'
      ? `${(beat.duration / 60 * (quality === '320' ? 2.8 : quality === '192' ? 1.8 : 1.2)).toFixed(1)} MB`
      : `${(beat.duration / 60 * (quality === '24' ? 15 : 10)).toFixed(1)} MB`);

  const now = new Date();
  const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}.${String(now.getFullYear()).slice(-2)}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const handleSave = () => {
    if (!exportedBlob) {
      showToast('No file to save (seeded data)');
      setSaved(true);
      return;
    }
    const url = URL.createObjectURL(exportedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${beat.title.replace(/[^a-z0-9]+/gi, '_')}_mix.wav`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    setSaved(true);
    showToast('Saved to device');
  };

  const handleShare = async () => {
    if (!exportedBlob) {
      showToast('Share — coming soon');
      return;
    }
    const filename = `${beat.title.replace(/[^a-z0-9]+/gi, '_')}_mix.wav`;
    const result = await shareFile(exportedBlob, filename, { title: beat.title });
    if (result === 'shared') showToast('Shared');
    else if (result === 'downloaded') showToast('Downloaded — share from Files');
    else showToast('Share unsupported on this device');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <Grain />
      <div className="fixed-header" style={{ padding: '16px 20px 0' }}>
        <ScreenHeader
          title="EXPORTED"
          left={null}
          right={
            <button onClick={onDone} style={{ all: 'unset', cursor: 'pointer', fontFamily: 'Space Mono', fontSize: 10, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-0)' }} type="button">
              DONE
            </button>
          }
        />
      </div>
      <div className="scroll-body" style={{ padding: '0 20px' }}>
        <div style={{ background: 'var(--paper-0)', border: '2px solid var(--line-0)', borderRadius: 5, padding: '18px 22px', position: 'relative', zIndex: 3, boxShadow: '4px 4px 0 var(--shadow)', marginTop: 10, animation: 'receipt-in 350ms var(--ease-io) both', overflow: 'hidden' }}>
          <Grain />
          <div style={{ textAlign: 'center', borderBottom: '2px dashed color-mix(in srgb,var(--ink-0) 40%,transparent)', paddingBottom: 12, marginBottom: 12, position: 'relative', zIndex: 3 }}>
            <div style={{ fontFamily: 'Space Mono', fontSize: 10, fontWeight: 700, letterSpacing: '.3em', color: 'var(--spot)' }}>BEATSTUDIO ∙ RECEIPT</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', marginTop: 8 }}>Mix printed.</div>
            <div style={{ fontFamily: 'Space Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', marginTop: 6 }}>
              NO ∙ {String(exportSerial).padStart(3, '0')} / {dateStr} / {timeStr}
            </div>
          </div>
          <div style={{ position: 'relative', zIndex: 3 }}>
            <Row label="TITLE" value={beat.title} />
            <Row label="FORMAT" value={`${format} · ${quality}${format === 'MP3' ? 'k' : 'bit'}`} />
            <Row label="SAMPLE RATE" value="44.1 kHz" />
            <Row label="DURATION" value={fmtDur(beat.duration)} />
            <Row label="SIZE" value={estSize} />
          </div>
          <div style={{ borderTop: '2px solid var(--line-0)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 3 }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 13 }}>TOTAL</span>
            <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 13 }}>1 FILE</span>
          </div>
          <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: 8, background: 'repeating-linear-gradient(90deg,var(--paper-0) 0 8px,transparent 8px 12px)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, position: 'relative', zIndex: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-1)', border: '2px solid var(--line-0)', borderRadius: 5, padding: '8px 16px' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#7EC37A', border: '2px solid var(--line-0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={10} color="#F0EBDF" stroke={3} />
            </div>
            <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 11, letterSpacing: '.08em', color: 'var(--ink-0)' }}>Exported. {estSize} · {format}</span>
          </div>
        </div>
      </div>
      <div className="fixed-footer" style={{ display: 'flex', gap: 10 }}>
        <PushBtn variant="paper" size="lg" style={{ flex: 1 }} onClick={handleSave}>
          {saved ? '▸ SAVED ✓' : '▸ SAVE'}
        </PushBtn>
        <PushBtn variant="ink" size="lg" style={{ flex: 1 }} onClick={handleShare}>
          ▸ SHARE
        </PushBtn>
      </div>
    </div>
  );
};
