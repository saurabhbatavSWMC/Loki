import { useEffect, useRef } from 'react';
import type { ScreenRoute } from '../types';

interface Args {
  route: ScreenRoute;
  onBack: () => void;
}

/**
 * Mirror app navigation into the browser history stack so the device's back
 * gesture / hardware key can navigate within the app instead of exiting it.
 *
 * Strategy: every navigation pushes a state with the current route. On
 * `popstate` we infer "the user pressed back" and call onBack. We mark our
 * own pushes so we don't loop.
 */
export function useHistoryNav({ route, onBack }: Args) {
  const lastRouteRef = useRef<ScreenRoute>(route);
  const ignoreNextPopRef = useRef(false);

  // Push a history entry whenever the app route changes (forward navigation).
  useEffect(() => {
    if (lastRouteRef.current === route) return;
    lastRouteRef.current = route;
    try {
      history.pushState({ route, ts: Date.now() }, '');
    } catch {
      /* ignore */
    }
  }, [route]);

  // Listen for back gesture; map to onBack unless this pop is one we triggered.
  useEffect(() => {
    const handler = () => {
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        return;
      }
      onBack();
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [onBack]);
}
