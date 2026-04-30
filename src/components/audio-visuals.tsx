import { useCallback, useRef } from 'react';
import { waveSeed } from '../lib/format';
import { Grain } from './Icon';

/* ── Waveform ─────────────────────────────── */
interface WaveformProps {
  progress?: number;
  seed?: number;
  height?: number;
  bars?: number;
  color?: string;
  restColor?: string;
  onScrub?: ((p: number) => void) | null;
  recording?: boolean;
}

export const Waveform = ({
  progress = 0,
  seed = 7,
  height = 56,
  bars = 64,
  color = 'var(--ink-0)',
  restColor = '#B0AAA0',
  onScrub,
  recording = false,
}: WaveformProps) => {
  const heights = waveSeed(seed, bars);
  const idx = Math.round(progress * bars);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const handlePointer = useCallback(
    (e: { clientX: number }) => {
      if (!onScrub || !wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      onScrub(Math.max(0, Math.min(1, x)));
    },
    [onScrub],
  );

  return (
    <div
      ref={wrapRef}
      className={`waveform-wrap${onScrub ? ' waveform-scrub' : ''}`}
      style={{ height }}
      onMouseDown={(e) => {
        if (!onScrub) return;
        handlePointer(e);
        const move = (ev: MouseEvent) => handlePointer(ev);
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      }}
      onTouchStart={(e) => {
        if (!onScrub || !wrapRef.current) return;
        const t = e.touches[0];
        const rect = wrapRef.current.getBoundingClientRect();
        onScrub(Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width)));
      }}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          className="waveform-bar"
          style={{ height: `${h * 100}%`, background: i < idx ? color : restColor }}
        />
      ))}
      <div
        className="waveform-playhead"
        style={{
          left: `${progress * 100}%`,
          boxShadow: recording ? '0 0 6px rgba(217,58,28,.8)' : 'none',
        }}
      />
    </div>
  );
};

/* ── SpoolWaveform ────────────────────────── */
interface SpoolWaveformProps {
  elapsed: number;
  seed?: number;
  height?: number;
}

export const SpoolWaveform = ({ elapsed, seed = 17, height = 48 }: SpoolWaveformProps) => {
  const bars = 80;
  const heights = waveSeed(seed, bars);
  const offset = (elapsed / 50) % bars;
  const visible = heights.map((_, i) => heights[Math.floor((i + offset) % bars)]);
  return (
    <div
      style={{
        position: 'relative',
        height,
        width: '100%',
        background: 'var(--paper-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 6, display: 'flex', alignItems: 'center', gap: 2 }}>
        {visible.map((h, i) => (
          <div
            key={i}
            style={{ flex: 1, height: `${h * 60}%`, background: 'var(--ink-0)', borderRadius: 2 }}
          />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          width: 2,
          background: 'var(--spot)',
          transform: 'translateX(-1px)',
          boxShadow: '0 0 6px rgba(217,58,28,.6)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -2,
          left: 'calc(50% - 4px)',
          width: 8,
          height: 4,
          background: 'var(--spot)',
          borderRadius: '0 0 2px 2px',
        }}
      />
    </div>
  );
};

/* ── PeakMeter ────────────────────────────── */
export const PeakMeter = ({ level = 0.4 }: { level?: number }) => {
  const bars = 24;
  const active = Math.round(level * bars);
  return (
    <div className="peak-meter">
      {Array.from({ length: bars }).map((_, i) => {
        const on = i < active;
        const color = i >= bars - 3 ? '#D93A1C' : i >= bars - 8 ? '#E8A13C' : '#9BC653';
        return (
          <div
            key={i}
            className="peak-bar"
            style={{
              background: on ? color : 'rgba(217,58,28,.08)',
              boxShadow: on ? `0 0 3px ${color}` : 'none',
            }}
          />
        );
      })}
    </div>
  );
};

/* ── SegDisplay (LED timecode) ────────────── */
interface SegDisplayProps {
  text?: string;
  size?: number;
}

export const SegDisplay = ({ text = '00:00.00', size = 40 }: SegDisplayProps) => {
  const w = size * 0.62;
  const h = size;
  const t = size * 0.09;
  const segMap: Record<string, string> = {
    '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
    '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
    ':': 'dot', ' ': '',
  };
  const ON = '#D93A1C';
  const OFF = 'rgba(217,58,28,.12)';
  const glow = (on: boolean) => (on ? { filter: 'drop-shadow(0 0 2px rgba(217,58,28,.6))' } : {});

  const SegChar = ({ ch }: { ch: string }) => {
    if (ch === ':') {
      return (
        <svg width={w * 0.5} height={h}>
          <rect x={w * 0.2} y={h * 0.32} width={t} height={t} fill={ON} style={glow(true)} />
          <rect x={w * 0.2} y={h * 0.62} width={t} height={t} fill={ON} style={glow(true)} />
        </svg>
      );
    }
    if (ch === '.') {
      return (
        <svg width={w * 0.4} height={h}>
          <rect x={w * 0.05} y={h - t * 1.5} width={t} height={t} fill={ON} style={glow(true)} />
        </svg>
      );
    }
    const segs = segMap[ch] || '';
    const on = (s: string) => segs.includes(s);
    const seg = (pts: string, s: string) => (
      <polygon points={pts} fill={on(s) ? ON : OFF} style={glow(on(s))} />
    );
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {seg(`${t} 0, ${w - t} 0, ${w - t * 1.5} ${t}, ${t * 1.5} ${t}`, 'a')}
        {seg(`${w} ${t}, ${w - t} ${t * 1.5}, ${w - t} ${h / 2 - t / 2}, ${w - t / 2} ${h / 2}`, 'b')}
        {seg(`${w - t / 2} ${h / 2}, ${w - t} ${h / 2 + t / 2}, ${w - t} ${h - t * 1.5}, ${w} ${h - t}`, 'c')}
        {seg(`${t * 1.5} ${h - t}, ${w - t * 1.5} ${h - t}, ${w - t} ${h}, ${t} ${h}`, 'd')}
        {seg(`0 ${h - t}, ${t} ${h - t * 1.5}, ${t} ${h / 2 + t / 2}, ${t / 2} ${h / 2}`, 'e')}
        {seg(`${t / 2} ${h / 2}, ${t} ${h / 2 - t / 2}, ${t} ${t * 1.5}, 0 ${t}`, 'f')}
        {seg(
          `${t} ${h / 2 - t / 2}, ${t * 1.5} ${h / 2 - t}, ${w - t * 1.5} ${h / 2 - t}, ${w - t} ${h / 2 - t / 2}, ${w - t * 1.5} ${h / 2}, ${t * 1.5} ${h / 2}`,
          'g',
        )}
      </svg>
    );
  };

  return (
    <div className="seg-display" style={{ padding: size * 0.2 }}>
      {[...text].map((ch, i) => (
        <SegChar key={i} ch={ch} />
      ))}
    </div>
  );
};

/* ── VUMeter ──────────────────────────────── */
interface VUMeterProps {
  level?: number;
  width?: number;
}

export const VUMeter = ({ level = 0.4, width = 300 }: VUMeterProps) => {
  const height = width * 0.58;
  const angle = -55 + level * 110;
  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: 'var(--paper-0)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        boxShadow: 'var(--elev-1)',
        overflow: 'hidden',
      }}
    >
      <Grain />
      <svg viewBox="0 0 280 160" width="100%" height="100%" style={{ display: 'block' }}>
        <path d="M 40 140 A 100 100 0 0 1 240 140" stroke="var(--ink-0)" strokeWidth="1.5" fill="none" />
        <path d="M 180 63 A 100 100 0 0 1 240 140" stroke="var(--spot)" strokeWidth="4" fill="none" />
        {Array.from({ length: 11 }).map((_, i) => {
          const a = -110 + (i / 10) * 110;
          const rad = (a * Math.PI) / 180;
          const x1 = 140 + Math.cos(rad) * 100;
          const y1 = 140 + Math.sin(rad) * 100;
          const x2 = 140 + Math.cos(rad) * (i % 5 === 0 ? 88 : 94);
          const y2 = 140 + Math.sin(rad) * (i % 5 === 0 ? 88 : 94);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--ink-0)"
              strokeWidth={i % 5 === 0 ? 1.5 : 1}
            />
          );
        })}
        <text x="40" y="155" fontFamily="JetBrains Mono" fontSize="9" fontWeight="700" fill="var(--ink-0)">-20</text>
        <text x="140" y="48" fontFamily="JetBrains Mono" fontSize="9" fontWeight="700" fill="var(--ink-0)" textAnchor="middle">-6</text>
        <text x="228" y="155" fontFamily="JetBrains Mono" fontSize="9" fontWeight="700" fill="var(--spot)">+3</text>
        <text x="140" y="100" fontFamily="Space Mono" fontSize="8" fontWeight="700" fill="var(--ink-2)" textAnchor="middle" letterSpacing="2">VU</text>
        <text x="140" y="112" fontFamily="JetBrains Mono" fontSize="7" fill="var(--ink-2)" textAnchor="middle" letterSpacing="1">dB</text>
        <g transform={`rotate(${angle} 140 140)`} style={{ transition: 'transform 80ms linear' }}>
          <line x1="140" y1="140" x2="140" y2="50" stroke="var(--ink-0)" strokeWidth="1.5" />
          <polygon points="140,48 138,54 142,54" fill="var(--spot)" />
        </g>
        <circle cx="140" cy="140" r="6" fill="var(--ink-0)" />
        <circle cx="140" cy="140" r="2" fill="var(--paper-0)" />
      </svg>
    </div>
  );
};

/* ── TapeReel ─────────────────────────────── */
interface TapeReelProps {
  size?: number;
  spinning?: boolean;
  speed?: number;
}

export const TapeReel = ({ size = 72, spinning = false, speed = 4 }: TapeReelProps) => (
  <div style={{ width: size, height: size, animation: spinning ? `reel-spin ${speed}s linear infinite` : 'none' }}>
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <circle cx="50" cy="50" r="46" fill="var(--paper-0)" stroke="var(--ink-0)" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="var(--ink-0)" strokeWidth="1" strokeDasharray="1 2" opacity=".5" />
      {[0, 120, 240].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 50 50)`}>
          <path d="M50 18 L44 42 L56 42 Z" fill="var(--ink-0)" />
          <circle cx="50" cy="30" r="3" fill="var(--paper-0)" stroke="var(--ink-0)" strokeWidth="1" />
        </g>
      ))}
      <circle cx="50" cy="50" r="10" fill="var(--ink-0)" />
      <circle cx="50" cy="50" r="3" fill="var(--paper-0)" />
      {[0, 72, 144, 216, 288].map((deg) => (
        <rect
          key={deg}
          x="49"
          y="42"
          width="2"
          height="3"
          fill="var(--paper-0)"
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
    </svg>
  </div>
);

/* ── Cassette ─────────────────────────────── */
interface CassetteProps {
  width?: number;
  spinning?: boolean;
  title?: string;
  side?: 'A' | 'B';
  bpm?: number;
}

export const Cassette = ({
  width = 300,
  spinning = false,
  title = 'UNTITLED',
  side = 'A',
  bpm = 92,
}: CassetteProps) => {
  const h = width * 0.62;
  const rs = width * 0.22;
  return (
    <div
      style={{
        width,
        height: h,
        position: 'relative',
        background: 'var(--paper-0)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 14,
        boxShadow: 'var(--elev-1)',
        overflow: 'hidden',
      }}
    >
      <Grain />
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          right: 8,
          height: h * 0.26,
          background: 'var(--paper-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          gap: 8,
        }}
      >
        <span style={{ fontFamily: 'Space Mono,monospace', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--spot)' }}>SIDE {side}</span>
        <span
          style={{
            fontFamily: 'JetBrains Mono',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '-.02em',
            color: 'var(--ink-0)',
            textTransform: 'uppercase',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            textAlign: 'center',
          }}
        >
          {title}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, letterSpacing: '.1em', color: 'var(--ink-2)' }}>{bpm}BPM</span>
      </div>
      <div style={{ position: 'absolute', top: h * 0.42, left: width * 0.12 }}>
        <TapeReel size={rs} spinning={spinning} speed={5} />
      </div>
      <div style={{ position: 'absolute', top: h * 0.42, right: width * 0.12 }}>
        <TapeReel size={rs} spinning={spinning} speed={6.5} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: h * 0.42 + rs / 2 - 1,
          left: width * 0.12 + rs / 2,
          right: width * 0.12 + rs / 2,
          height: 2,
          background: 'var(--ink-0)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: h * 0.08,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60%',
          height: h * 0.08,
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          background: 'var(--paper-1)',
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--ink-0)' }} />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--spot)',
        }}
      />
    </div>
  );
};
