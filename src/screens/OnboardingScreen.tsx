import { useState, type ReactNode } from 'react';
import { PushBtn, PSwitch, Stamp } from '../components/primitives';
import { Icon } from '../components/Icon';
import { TapeReel } from '../components/audio-visuals';
import { isIOS, isStandalone } from '../lib/platform';
import { seedIfEmpty } from '../db/seed';
import { markOnboarded, skipSeed } from '../lib/onboarding';
import { haptics } from '../lib/haptics';

interface OnboardingScreenProps {
  onDone: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

const TOTAL_CARDS = 5;

export const OnboardingScreen = ({ onDone, darkMode, onToggleDark }: OnboardingScreenProps) => {
  const [step, setStep] = useState(0);
  const [seedBeats, setSeedBeats] = useState(true);
  const [busy, setBusy] = useState(false);

  const next = () => {
    haptics.tick();
    setStep((s) => Math.min(s + 1, TOTAL_CARDS - 1));
  };
  const back = () => {
    haptics.tick();
    setStep((s) => Math.max(s - 1, 0));
  };

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (seedBeats) {
        await seedIfEmpty();
      } else {
        await skipSeed();
      }
      await markOnboarded();
      try {
        // Suppress the auto iOS install prompt — we already covered install in card 5.
        localStorage.setItem('bs-ios-install-dismissed', '1');
      } catch {
        /* ignore */
      }
      haptics.save();
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--paper-0)',
        color: 'var(--ink-0)',
        display: 'flex',
        flexDirection: 'column',
        padding: '52px 24px 28px',
        zIndex: 100,
      }}
    >
      {/* Top bar: progress dots + skip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Dots active={step} total={TOTAL_CARDS} />
        {step < TOTAL_CARDS - 1 ? (
          <button
            onClick={() => setStep(TOTAL_CARDS - 1)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.18em',
              color: 'var(--ink-2)',
              padding: 4,
            }}
            type="button"
          >
            SKIP →
          </button>
        ) : (
          <span style={{ width: 40 }} />
        )}
      </div>

      {/* Card body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {step === 0 && <CardWelcome />}
        {step === 1 && <CardBenefits />}
        {step === 2 && <CardHowItWorks />}
        {step === 3 && (
          <CardSetup
            seedBeats={seedBeats}
            onToggleSeed={setSeedBeats}
            darkMode={darkMode}
            onToggleDark={onToggleDark}
          />
        )}
        {step === 4 && <CardInstall />}
      </div>

      {/* Footer: back / next */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        {step > 0 && (
          <PushBtn variant="paper" size="md" onClick={back} style={{ flex: 1 }}>
            Back
          </PushBtn>
        )}
        {step < TOTAL_CARDS - 1 ? (
          <PushBtn variant="ink" size="md" onClick={next} style={{ flex: 2 }}>
            {step === 0 ? 'Get started' : step === 1 ? 'Show me how →' : 'Continue'}
          </PushBtn>
        ) : (
          <PushBtn variant="ink" size="md" onClick={() => void finish()} style={{ flex: 2 }} disabled={busy}>
            {busy ? 'Loading…' : 'Enter studio'}
          </PushBtn>
        )}
      </div>
    </div>
  );
};

/* ── Cards ────────────────────────────────── */

const CardWelcome = () => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 24 }}>
    <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
      <TapeReel size={68} spinning speed={4} />
      <div style={{ width: 70, height: 2, background: 'var(--ink-0)', opacity: 0.6 }} />
      <TapeReel size={68} spinning speed={5.5} />
    </div>
    <div>
      <div style={{ fontFamily: 'var(--font-disp)', fontSize: 9, fontWeight: 700, letterSpacing: '.32em', color: 'var(--spot)', marginBottom: 10 }}>
        BEATSTUDIO ∙ SIDE A
      </div>
      <div style={{ fontFamily: 'var(--font-disp)', fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.05 }}>
        RECORD<br />OVER BEATS.
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)', marginTop: 14, lineHeight: 1.5 }}>
        A tape-deck studio in your pocket.
      </div>
    </div>
  </div>
);

const CardBenefits = () => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
    <CardHeader kicker="WHY BEATSTUDIO" title={<>Your studio.<br />In your pocket.<br />Off the grid.</>} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
      <Benefit
        icon="mic"
        lede="Lay vocals over the beat — live"
        sub="Hear the beat in your headphones while you record. No silent guessing."
      />
      <Benefit
        icon="cassette"
        lede="100% private. Nothing leaves your phone"
        sub="No cloud, no account, no uploads. Nobody hears it until you're ready."
      />
      <Benefit
        icon="loop"
        lede="Stack unlimited takes per beat"
        sub="Try a verse 20 times. Mute, solo, mix — keep the magic, ditch the rest."
      />
      <Benefit
        icon="upload"
        lede="Works anywhere — even on a plane"
        sub="Fully offline. Your beats and sessions live with you."
      />
    </div>
    <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)', textAlign: 'center', fontStyle: 'italic' }}>
      Built for rappers, singers, and producers who record where the idea hits.
    </div>
  </div>
);

const CardHowItWorks = () => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
    <CardHeader kicker="HOW IT WORKS" title={<>Three steps.<br />Verse to vault.</>} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 28 }}>
      <Step n={1} icon="cassette" title="Load a beat" body="Drop in an MP3/WAV, or pick from your library." />
      <Step n={2} icon="rec" title="Hit record" body="Count-in, beat plays in your headphones, you record on top." />
      <Step n={3} icon="loop" title="Stack & export" body="Layer takes in a session, mix, then export as WAV or MP3." />
    </div>
  </div>
);

interface CardSetupProps {
  seedBeats: boolean;
  onToggleSeed: (v: boolean) => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

const CardSetup = ({ seedBeats, onToggleSeed, darkMode, onToggleDark }: CardSetupProps) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
    <CardHeader kicker="MAKE IT HOME" title={<>Set up<br />your studio.</>} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
      <ToggleRow
        icon="cassette"
        label="Load 3 starter beats"
        hint="Try the app instantly. You can delete them anytime."
        on={seedBeats}
        onChange={onToggleSeed}
      />
      <ToggleRow
        icon="more"
        label="Studio Mode (dark)"
        hint="Easier on the eyes when you're recording at night."
        on={darkMode}
        onChange={onToggleDark}
      />
    </div>
  </div>
);

const CardInstall = () => {
  const ios = isIOS() && !isStandalone();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <CardHeader kicker="ALMOST READY" title={<>One more thing.</>} />
      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {ios ? (
          <Panel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Stamp rotate={-3}>iOS</Stamp>
              <div style={{ fontFamily: 'var(--font-disp)', fontWeight: 800, fontSize: 13, letterSpacing: '-.01em' }}>
                Add to Home Screen
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.55, marginBottom: 8 }}>
              Faster launches, full screen, mic stays granted, your tapes survive Safari purges.
            </div>
            <InstallStep n={1}>
              Tap <ShareGlyph /> Share at the bottom of Safari
            </InstallStep>
            <InstallStep n={2}>
              Scroll and tap <strong>Add to Home Screen</strong>
            </InstallStep>
            <InstallStep n={3}>
              Tap <strong>Add</strong> in the top-right
            </InstallStep>
          </Panel>
        ) : (
          <Panel>
            <div style={{ fontFamily: 'var(--font-disp)', fontWeight: 800, fontSize: 13, letterSpacing: '-.01em', marginBottom: 8 }}>
              Install for the full experience
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              Look for the <strong>Install</strong> icon in your browser's address bar to run BeatStudio as a standalone app — full screen, offline, faster.
            </div>
          </Panel>
        )}

        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="mic" size={14} color="var(--spot)" />
            <div style={{ fontFamily: 'var(--font-disp)', fontWeight: 800, fontSize: 13, letterSpacing: '-.01em' }}>
              Mic permission
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            We'll ask the first time you tap record. Audio never leaves this device.
          </div>
        </Panel>
      </div>
    </div>
  );
};

/* ── Bits ─────────────────────────────────── */

const CardHeader = ({ kicker, title }: { kicker: string; title: ReactNode }) => (
  <div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.28em', color: 'var(--spot)', marginBottom: 12 }}>
      {kicker}
    </div>
    <div style={{ fontFamily: 'var(--font-disp)', fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1 }}>
      {title}
    </div>
  </div>
);

const Dots = ({ active, total }: { active: number; total: number }) => (
  <div style={{ display: 'flex', gap: 6 }}>
    {Array.from({ length: total }).map((_, i) => (
      <span
        key={i}
        style={{
          width: i === active ? 18 : 6,
          height: 6,
          borderRadius: 3,
          background: i === active ? 'var(--spot)' : 'var(--ink-0)',
          opacity: i === active ? 1 : 0.2,
          transition: 'all 220ms var(--ease)',
        }}
      />
    ))}
  </div>
);

interface BenefitProps {
  icon: string;
  lede: string;
  sub: string;
}

const Benefit = ({ icon, lede, sub }: BenefitProps) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: 'var(--ink-0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={16} color="var(--paper-0)" />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800, color: 'var(--ink-0)', letterSpacing: '.01em', lineHeight: 1.3 }}>
        {lede}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.45 }}>
        {sub}
      </div>
    </div>
  </div>
);

interface StepProps {
  n: number;
  icon: string;
  title: string;
  body: string;
}

const Step = ({ n, icon, title, body }: StepProps) => (
  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: '50%',
        background: 'var(--spot)',
        color: '#F0EBDF',
        fontFamily: 'var(--font-disp)',
        fontWeight: 800,
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid var(--ink-0)',
        flexShrink: 0,
      }}
    >
      {n}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={13} color="var(--ink-0)" />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>
          {title}
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.45 }}>
        {body}
      </div>
    </div>
  </div>
);

interface ToggleRowProps {
  icon: string;
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}

const ToggleRow = ({ icon, label, hint, on, onChange }: ToggleRowProps) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 14px',
      background: 'color-mix(in srgb, var(--ink-0) 4%, transparent)',
      border: '1.5px solid var(--ink-0)',
      borderRadius: 10,
    }}
  >
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        background: 'var(--ink-0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={14} color="var(--paper-0)" />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.4 }}>
        {hint}
      </div>
    </div>
    <PSwitch on={on} onChange={onChange} />
  </div>
);

const Panel = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      padding: 14,
      border: '1.5px solid var(--ink-0)',
      borderRadius: 10,
      background: 'color-mix(in srgb, var(--ink-0) 4%, transparent)',
    }}
  >
    {children}
  </div>
);

const InstallStep = ({ n, children }: { n: number; children: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: 'var(--spot)',
        color: '#F0EBDF',
        fontFamily: 'var(--font-mono)',
        fontWeight: 800,
        fontSize: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {n}
    </div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-0)', lineHeight: 1.5 }}>{children}</div>
  </div>
);

const ShareGlyph = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', margin: '0 2px' }}>
    <Icon name="share" size={12} color="var(--spot)" />
  </span>
);
