import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Measures the height of the first rendered card and returns a container
 * style that clips the scroll area to exactly `visibleCount` card heights.
 * Native scroll handles everything — no JS interception needed.
 */
export function useStackWindow(visibleCount: number) {
  const [cardHeight, setCardHeight] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Measure first card after render
  const measureCard = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const first = list.firstElementChild as HTMLElement | null;
    if (first) {
      const gap = 10; // matches gap:10 in the list
      setCardHeight(first.offsetHeight + gap);
    }
  }, []);

  useEffect(() => {
    measureCard();
    // Re-measure on resize (e.g. font load, orientation change)
    const ro = new ResizeObserver(measureCard);
    if (listRef.current?.firstElementChild) {
      ro.observe(listRef.current.firstElementChild);
    }
    return () => ro.disconnect();
  }, [measureCard]);

  const containerHeight = cardHeight > 0 ? cardHeight * visibleCount - 10 + 8 : undefined;

  return { listRef, containerHeight };
}
