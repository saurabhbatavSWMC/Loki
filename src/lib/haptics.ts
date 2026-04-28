import { prefersReducedMotion, supportsHaptics } from './platform';

const buzz = (pattern: number | number[]): void => {
  if (!supportsHaptics() || prefersReducedMotion()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
};

export const haptics = {
  tick: () => buzz(8),
  press: () => buzz(12),
  recordStart: () => buzz([6, 30, 10]),
  recordStop: () => buzz([14, 40, 8]),
  save: () => buzz([8, 50, 8]),
  warn: () => buzz(40),
  error: () => buzz([20, 80, 20, 80, 30]),
};
