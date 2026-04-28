import { useCallback, useEffect, useState } from 'react';
import { getSetting, setSetting } from '../db/queries';

const LS_KEY = 'bs-theme';

export function useTheme(): { darkMode: boolean; toggle: () => void } {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const body = document.querySelector('.phone-body');
    if (body) body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    try {
      localStorage.setItem(LS_KEY, darkMode ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
    setSetting('theme', darkMode ? 'dark' : 'light').catch(() => undefined);
  }, [darkMode]);

  useEffect(() => {
    getSetting<string>('theme').then((stored) => {
      if (stored && (stored === 'dark') !== darkMode) {
        setDarkMode(stored === 'dark');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback(() => setDarkMode((d) => !d), []);
  return { darkMode, toggle };
}
