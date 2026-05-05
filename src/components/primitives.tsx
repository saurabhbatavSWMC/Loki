import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import ReactDOM from 'react-dom';
import { Icon, IconBtn, type IconName } from './Icon';

/* ── PushBtn ────────────────────────────────── */
interface PushBtnProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'ink' | 'paper' | 'rec';
  size?: 'sm' | 'md' | 'lg';
  style?: CSSProperties;
  disabled?: boolean;
  title?: string;
}

export const PushBtn = ({
  children,
  onClick,
  variant = 'ink',
  size = 'md',
  style,
  disabled,
  title,
}: PushBtnProps) => (
  <button
    className={`push-btn ${variant} ${size}`}
    onClick={onClick}
    disabled={disabled}
    style={style}
    title={title}
    type="button"
  >
    {children}
  </button>
);

/* ── TportBtn ──────────────────────────────── */
interface TportBtnProps {
  icon: IconName;
  onClick?: () => void;
  active?: boolean;
  size?: number;
  label?: string;
  color?: string;
}

export const TportBtn = ({ icon, onClick, active, size = 48, label, color }: TportBtnProps) => {
  const fg = active ? '#F0EBDF' : color || 'var(--ink-0)';
  const bg = active ? 'var(--ink-0)' : 'var(--paper-1)';
  return (
    <div className="tport-btn">
      <button
        className={active ? 'active' : ''}
        onClick={onClick}
        style={{ width: size, height: size, background: bg, color: fg, border: 'none' }}
        type="button"
      >
        <Icon name={icon} size={size * 0.38} color={fg} />
      </button>
      {label && <span className="tport-label">{label}</span>}
    </div>
  );
};

/* ── PSwitch ───────────────────────────────── */
interface PSwitchProps {
  on: boolean;
  onChange: (v: boolean) => void;
  size?: 'sm' | 'md';
}

export const PSwitch = ({ on, onChange, size = 'md' }: PSwitchProps) => {
  const w = size === 'sm' ? 36 : 46;
  const h = size === 'sm' ? 20 : 24;
  return (
    <button
      className={`p-switch ${on ? 'on' : 'off'}`}
      onClick={() => onChange(!on)}
      style={{ width: w, height: h }}
      aria-checked={on}
      role="switch"
      type="button"
    >
      <span
        className="p-switch-thumb"
        style={{
          width: h - 4,
          height: h - 4,
          left: on ? w - h + 1 : 2,
        }}
      />
    </button>
  );
};

/* ── PSlider ──────────────────────────────── */
interface PSliderProps {
  value: number;
  onChange: (v: number) => void;
  /** Called when the user releases the slider (mouse up, touch end, key up). */
  onCommit?: () => void;
  /** Called when the user double-clicks/double-taps the slider — typically to reset to a default. */
  onReset?: () => void;
  min?: number;
  max?: number;
}

export const PSlider = ({ value, onChange, onCommit, onReset, min = 0, max = 100 }: PSliderProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const lastTapRef = useRef(0);
  const movedRef = useRef(false);
  const downXRef = useRef(0);

  const valueFromX = (clientX: number): number => {
    const el = wrapRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return value;
    const pct = (clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, pct));
    return Math.round(min + clamped * (max - min));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    movedRef.current = false;
    downXRef.current = e.clientX;
    onChange(valueFromX(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    if (Math.abs(e.clientX - downXRef.current) > 2) movedRef.current = true;
    onChange(valueFromX(e.clientX));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId);
    onCommit?.();
    // Touch double-tap reset (browsers don't fire dblclick reliably on touch).
    if (onReset && e.pointerType !== 'mouse' && !movedRef.current) {
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        onReset();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(min, value - 1));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(max, value + 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  };

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      ref={wrapRef}
      className="p-slider-wrap"
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      title={onReset ? 'Double-click to reset' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onKeyUp={() => onCommit?.()}
      onDoubleClick={onReset}
      style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none' }}
    >
      <div className="p-slider-track">
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: 2,
              bottom: 2,
              left: `${i * 10}%`,
              width: 1,
              background: 'var(--ink-0)',
              opacity: 0.18,
            }}
          />
        ))}
      </div>
      <div className="p-slider-thumb" style={{ left: `${pct}%` }}>
        <div className="p-slider-thumb-body" />
      </div>
    </div>
  );
};

/* ── Stamp ─────────────────────────────────── */
interface StampProps {
  children: ReactNode;
  rotate?: number;
  color?: string;
}

export const Stamp = ({ children, rotate = -2, color = 'var(--spot)' }: StampProps) => (
  <span className="stamp" style={{ transform: `rotate(${rotate}deg)`, borderColor: color, color }}>
    {children}
  </span>
);

/* ── Sheet ─────────────────────────────────── */
interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export const Sheet = ({ open, onClose, title, children }: SheetProps) => {
  const [portalEl] = useState(() => document.createElement('div'));
  const [drag, setDrag] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const body = document.querySelector('.phone-body');
    if (!body) return;
    body.appendChild(portalEl);
    return () => {
      if (body.contains(portalEl)) body.removeChild(portalEl);
    };
  }, [portalEl]);

  // Reset drag state when sheet opens/closes
  useEffect(() => {
    if (!open) {
      setDrag(0);
      dragStartRef.current = null;
    }
  }, [open]);

  const onTouchStart = (e: React.TouchEvent) => {
    dragStartRef.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartRef.current === null) return;
    const dy = e.touches[0].clientY - dragStartRef.current;
    if (dy > 0) setDrag(dy);
  };
  const onTouchEnd = () => {
    const height = sheetRef.current?.offsetHeight ?? 1;
    if (drag > height * 0.3) {
      onClose();
    }
    setDrag(0);
    dragStartRef.current = null;
  };

  if (!open) return null;

  return ReactDOM.createPortal(
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-end' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet-scrim" onClick={onClose} />
      <div
        ref={sheetRef}
        className="sheet-body noscroll"
        style={{
          position: 'relative',
          zIndex: 501,
          width: '100%',
          transform: drag > 0 ? `translateY(${drag}px)` : undefined,
          transition: drag > 0 ? 'none' : 'transform 220ms var(--ease)',
        }}
      >
        <div
          className="sheet-handle"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ touchAction: 'none', cursor: 'grab', height: 18, paddingTop: 7, marginBottom: 7 }}
        >
          <div style={{ width: 36, height: 4, background: 'var(--ink-0)', opacity: 0.25, borderRadius: 2, margin: '0 auto' }} />
        </div>
        <div className="sheet-header">
          <span className="sheet-title">{title}</span>
          <button className="icon-btn" onClick={onClose} style={{ padding: 4 }} type="button">
            <Icon name="close" size={16} color="var(--ink-0)" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    portalEl,
  );
};

/* ── MenuRow ───────────────────────────────── */
interface MenuRowProps {
  icon?: IconName;
  label: string;
  hint?: string;
  danger?: boolean;
  onClick?: () => void;
  right?: ReactNode;
}

export const MenuRow = ({ icon, label, hint, danger, onClick, right }: MenuRowProps) => (
  <button className="menu-row" onClick={onClick} type="button">
    {icon && (
      <div className={`menu-row-icon${danger ? ' danger' : ''}`}>
        <Icon name={icon} size={14} color={danger ? '#F0EBDF' : 'var(--ink-0)'} />
      </div>
    )}
    <div style={{ flex: 1 }}>
      <div className={`menu-row-label${danger ? ' danger' : ''}`}>{label}</div>
      {hint && <div className="menu-row-hint">{hint}</div>}
    </div>
    {right ?? <Icon name="next" size={14} color="var(--ink-2)" />}
  </button>
);

/* ── Toast ─────────────────────────────────── */
interface ToastProps {
  msg: string;
  visible: boolean;
}

export const Toast = ({ msg, visible }: ToastProps) => {
  if (!msg) return null;
  return (
    <div className={`toast ${visible ? 'in' : 'out'}`} role="status" aria-live="polite">
      {msg}
    </div>
  );
};

/* ── ScreenHeader ──────────────────────────── */
interface ScreenHeaderProps {
  left?: ReactNode;
  title: ReactNode;
  right?: ReactNode;
}

export const ScreenHeader = ({ left, title, right }: ScreenHeaderProps) => (
  <div className="scr-header">
    <div className="scr-header-side">{left}</div>
    <div className="scr-header-title">{title}</div>
    <div className="scr-header-side right">{right}</div>
  </div>
);

/* ── TapeLabel ─────────────────────────────── */
interface TapeLabelProps {
  title: string;
  meta: string;
  side?: 'A' | 'B';
  color?: string;
  onClick?: () => void;
  stamp?: string | null;
  /** Optional substring to highlight in the title (case-insensitive). */
  highlight?: string;
}

const renderHighlighted = (text: string, query?: string): ReactNode => {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark style={{ background: 'var(--spot)', color: '#F0EBDF', padding: '0 2px', borderRadius: 2 }}>{match}</mark>
      {after}
    </>
  );
};

export const TapeLabel = ({ title, meta, side = 'A', color = 'var(--spot)', onClick, stamp, highlight }: TapeLabelProps) => (
  <div style={{ position: 'relative', width: '100%' }}>
    <button className="tape-label" onClick={onClick} type="button">
      <div className="tape-side" style={{ color: '#F0EBDF', background: color }}>
        <span className="tape-side-letter">SIDE</span>
        <span className="tape-side-num">{side}</span>
      </div>
      <div className="tape-body">
        <span className="tape-title">{renderHighlighted(title, highlight)}</span>
        <span className="tape-meta">{meta}</span>
      </div>
      <div className="tape-arrow">
        <Icon name="next" size={16} color="var(--ink-0)" />
      </div>
    </button>
    {stamp && (
      <div style={{ position: 'absolute', top: -6, right: 8, zIndex: 5 }}>
        <Stamp rotate={-4}>{stamp}</Stamp>
      </div>
    )}
  </div>
);

export { Icon, IconBtn };
