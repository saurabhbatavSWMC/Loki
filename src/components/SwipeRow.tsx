import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface SwipeRowProps {
  children: ReactNode;
  onDelete: () => void;
  /** Optional swipe-right action — revealed by dragging the row to the right. */
  onFavorite?: () => void;
  /** Current favorite state — flips the right-action label between FAV and UNFAV. */
  favorited?: boolean;
  /** When this changes, the row resets to closed. */
  resetSignal?: unknown;
}

const REVEAL_PX = 96;
const ACTIVATE_PX = 64;

/**
 * iOS-style swipe row.
 *  - Swipe left  → reveals DELETE strip on the right (always available).
 *  - Swipe right → reveals FAV strip on the left (only when onFavorite is provided).
 * Past ACTIVATE_PX in either direction it snaps open; less than that snaps back to 0.
 */
export const SwipeRow = ({ children, onDelete, onFavorite, favorited, resetSignal }: SwipeRowProps) => {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startOffsetRef = useRef(0);
  const lockedRef = useRef<'h' | 'v' | null>(null);

  useEffect(() => {
    setOffset(0);
  }, [resetSignal]);

  const clampDrag = (raw: number): number => {
    let next = raw;
    if (next > 0) {
      // Right pull
      if (!onFavorite) {
        next = next * 0.2; // resist if no right action
      } else if (next > REVEAL_PX * 1.4) {
        // rubber-band beyond fully open
        next = REVEAL_PX * 1.4 + (next - REVEAL_PX * 1.4) * 0.3;
      }
    } else if (next < -REVEAL_PX * 1.4) {
      next = -REVEAL_PX * 1.4 + (next + REVEAL_PX * 1.4) * 0.3; // rubber-band left
    }
    return next;
  };

  const settle = () => {
    if (offset <= -ACTIVATE_PX) {
      setOffset(-REVEAL_PX);
    } else if (onFavorite && offset >= ACTIVATE_PX) {
      setOffset(REVEAL_PX);
    } else {
      setOffset(0);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startOffsetRef.current = offset;
    lockedRef.current = null;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startXRef.current === null) return;
    const dx = e.touches[0].clientX - startXRef.current;
    if (lockedRef.current === null) {
      if (Math.abs(dx) > 8) lockedRef.current = 'h';
    }
    if (lockedRef.current !== 'h') return;
    setOffset(clampDrag(startOffsetRef.current + dx));
  };
  const onTouchEnd = () => {
    setDragging(false);
    startXRef.current = null;
    settle();
  };

  // Pointer (mouse) support for desktop testing
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    startXRef.current = e.clientX;
    startOffsetRef.current = offset;
    lockedRef.current = null;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    if (lockedRef.current === null && Math.abs(dx) > 8) lockedRef.current = 'h';
    if (lockedRef.current !== 'h') return;
    setOffset(clampDrag(startOffsetRef.current + dx));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    setDragging(false);
    startXRef.current = null;
    settle();
  };

  const close = () => setOffset(0);

  return (
    <div className="swipe-row">
      {/* Right-side DELETE action (revealed by swiping LEFT) */}
      <div
        className="swipe-row-action"
        style={{ width: REVEAL_PX, justifyContent: 'center', padding: 0, color: 'var(--paper-0)' }}
      >
        <button
          onClick={() => { close(); onDelete(); }}
          aria-label="Delete"
          type="button"
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'inherit' }}
        >
          <Icon name="trash" size={18} color="var(--paper-0)" />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.16em' }}>DELETE</span>
        </button>
      </div>

      {/* Left-side FAVORITE action (revealed by swiping RIGHT) — only when onFavorite is passed */}
      {onFavorite && (
        <div
          className="swipe-row-action"
          style={{
            width: REVEAL_PX,
            right: 'auto',
            left: 4,
            justifyContent: 'center',
            padding: 0,
            background: 'var(--ink-0)',
            color: 'var(--paper-0)',
          }}
        >
          <button
            onClick={() => { close(); onFavorite(); }}
            aria-label={favorited ? 'Unfavorite' : 'Favorite'}
            type="button"
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'inherit' }}
          >
            <Icon name="star" size={18} color={favorited ? 'var(--spot)' : 'var(--paper-0)'} />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.16em' }}>
              {favorited ? 'UNFAV' : 'FAV'}
            </span>
          </button>
        </div>
      )}

      <div
        className={`swipe-row-content${dragging ? ' dragging' : ''}`}
        style={{
          transform: `translateX(${offset}px)`,
          // Opaque backing so action strips never bleed through translucent children
          // (e.g. a disabled take card with opacity:.65). Matches the 14px radius used
          // by take-card and TapeLabel so corners stay clean.
          background: 'var(--paper-0)',
          borderRadius: 14,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (offset !== 0) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
};
