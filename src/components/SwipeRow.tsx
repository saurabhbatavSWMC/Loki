import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface SwipeRowProps {
  children: ReactNode;
  onDelete: () => void;
  /** When this changes, the row resets to closed. */
  resetSignal?: unknown;
}

const REVEAL_PX = 96;
const ACTIVATE_PX = 64;

/**
 * iOS-style swipe-left-to-delete row. The action is a red strip behind the
 * content; the content translates left as the user drags. Past ACTIVATE_PX it
 * snaps to REVEAL_PX (open). Less than that snaps back to 0.
 */
export const SwipeRow = ({ children, onDelete, resetSignal }: SwipeRowProps) => {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startOffsetRef = useRef(0);
  const lockedRef = useRef<'h' | 'v' | null>(null);

  useEffect(() => {
    setOffset(0);
  }, [resetSignal]);

  const onTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startOffsetRef.current = offset;
    lockedRef.current = null;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startXRef.current === null) return;
    const dx = e.touches[0].clientX - startXRef.current;
    const dy = e.touches[0].clientY ? Math.abs(e.touches[0].clientY - (e.touches[0].clientY)) : 0;
    void dy;
    // Lock to horizontal once movement is decisively sideways
    if (lockedRef.current === null) {
      if (Math.abs(dx) > 8) lockedRef.current = 'h';
    }
    if (lockedRef.current !== 'h') return;
    let next = startOffsetRef.current + dx;
    if (next > 0) next = next * 0.2; // resist over-pull right
    if (next < -REVEAL_PX * 1.4) next = -REVEAL_PX * 1.4 + (next + REVEAL_PX * 1.4) * 0.3; // rubber-band left
    setOffset(next);
  };
  const onTouchEnd = () => {
    setDragging(false);
    startXRef.current = null;
    if (offset <= -ACTIVATE_PX) {
      setOffset(-REVEAL_PX);
    } else {
      setOffset(0);
    }
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
    let next = startOffsetRef.current + dx;
    if (next > 0) next = next * 0.2;
    if (next < -REVEAL_PX * 1.4) next = -REVEAL_PX * 1.4 + (next + REVEAL_PX * 1.4) * 0.3;
    setOffset(next);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    setDragging(false);
    startXRef.current = null;
    if (offset <= -ACTIVATE_PX) setOffset(-REVEAL_PX);
    else setOffset(0);
  };

  // Click outside content to reset (helps when row is open)
  const close = () => setOffset(0);

  return (
    <div className="swipe-row">
      <div className="swipe-row-action" style={{ width: REVEAL_PX }}>
        <button
          onClick={() => {
            close();
            onDelete();
          }}
          aria-label="Delete"
          type="button"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
        >
          <Icon name="trash" size={16} color="#F0EBDF" />
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.16em' }}>DELETE</span>
        </button>
      </div>
      <div
        className={`swipe-row-content${dragging ? ' dragging' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          // If row is open, the first click closes it instead of activating the child.
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
