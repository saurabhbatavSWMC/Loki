import { useEffect, useState } from 'react';
import { Sheet, PushBtn, Stamp } from './primitives';
import { Icon } from './Icon';
import { isIOS, isStandalone } from '../lib/platform';

const DISMISS_KEY = 'bs-ios-install-dismissed';

export const IOSInstallSheet = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isIOS() || isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* ignore */
    }
    const timer = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <Sheet open={open} onClose={dismiss} title="INSTALL TO HOME">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Stamp rotate={-3}>iOS</Stamp>
        <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 14, letterSpacing: '-.02em' }}>
          Run BeatStudio like a real app
        </div>
      </div>
      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 14 }}>
        Faster launches, no Safari chrome, mic access stays granted, and your tapes survive private-tab purges. Three taps:
      </div>

      <Step
        n={1}
        body={
          <span>
            Tap <ShareGlyph /> Share at the bottom of Safari
          </span>
        }
      />
      <Step n={2} body={<span>Scroll and tap <strong>Add to Home Screen</strong></span>} />
      <Step n={3} body={<span>Tap <strong>Add</strong> in the top-right</span>} />

      <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
        <PushBtn variant="paper" size="md" style={{ flex: 1 }} onClick={dismiss}>
          Not now
        </PushBtn>
        <PushBtn variant="ink" size="md" style={{ flex: 1 }} onClick={dismiss}>
          Got it
        </PushBtn>
      </div>
    </Sheet>
  );
};

const Step = ({ n, body }: { n: number; body: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: 'var(--spot)',
        color: '#F0EBDF',
        fontFamily: 'JetBrains Mono',
        fontWeight: 800,
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid var(--line-0)',
        flexShrink: 0,
      }}
    >
      {n}
    </div>
    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--ink-0)', paddingTop: 2 }}>{body}</div>
  </div>
);

const ShareGlyph = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', margin: '0 2px' }}>
    <Icon name="share" size={14} color="var(--spot)" />
  </span>
);
