import { useEffect, useRef, useState } from 'react';
import type { Beat, ExportOpts, ScreenRoute, Session, SessionWithBeat, Take } from './types';
import { todayStamp } from './lib/format';
import { useDatabase } from './hooks/useDatabase';
import { useTheme } from './hooks/useTheme';
import { useStoragePersist, useStorageInfo } from './hooks/useStoragePersist';
import {
  addBeat as dbAddBeat,
  addTake as dbAddTake,
  deleteSession as dbDeleteSession,
  deleteTake as dbDeleteTake,
  saveAudioBlob,
  updateTake as dbUpdateTake,
  upsertSession as dbUpsertSession,
} from './db/queries';
import { Sheet, MenuRow, Toast } from './components/primitives';
import { TapeReel } from './components/audio-visuals';
import { IOSInstallSheet } from './components/IOSInstallSheet';
import { useHistoryNav } from './hooks/useHistoryNav';
import { haptics } from './lib/haptics';
import { HomeScreen } from './screens/HomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { BeatDetailScreen } from './screens/BeatDetailScreen';
import { RecordScreen, type RecordController } from './screens/RecordScreen';
import { SessionScreen } from './screens/SessionScreen';
import { SessionsListScreen } from './screens/SessionsListScreen';
import { ExportScreen } from './screens/ExportScreen';
import { ExportSuccessScreen } from './screens/ExportSuccessScreen';

interface ToastState {
  msg: string;
  visible: boolean;
}

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function App() {
  const { ready, beats, sessions, refresh } = useDatabase();
  const { darkMode, toggle: toggleTheme } = useTheme();
  useStoragePersist();
  const storage = useStorageInfo();
  const lowTapeNoticedRef = useRef(false);
  useEffect(() => {
    if ((storage.low || storage.critical) && !lowTapeNoticedRef.current) {
      lowTapeNoticedRef.current = true;
      const pct = Math.round((storage.usage ?? 0) * 100);
      const msg = storage.critical ? `Tape almost full (${pct}%) — delete sessions` : `Tape ${pct}% full`;
      // showToast may be defined later; defer one tick
      window.setTimeout(() => showToast(msg), 0);
    }
    if (!storage.low && !storage.critical && lowTapeNoticedRef.current) {
      lowTapeNoticedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage.low, storage.critical]);

  const [route, setRoute] = useState<ScreenRoute>('home');
  const [animDir, setAnimDir] = useState<'forward' | 'back'>('forward');
  const [prevRoute, setPrevRoute] = useState<ScreenRoute | null>(null);
  const [sessionOrigin, setSessionOrigin] = useState<ScreenRoute>('home');
  const [sessionBackTarget, setSessionBackTarget] = useState<ScreenRoute>('home');
  const [beat, setBeat] = useState<Beat | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [exportOpts, setExportOpts] = useState<ExportOpts | null>(null);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [exportSerial, setExportSerial] = useState(4);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState('SESSION');
  const [toast, setToast] = useState<ToastState>({ msg: '', visible: false });
  const [isRecording, setIsRecording] = useState(false);
  const [isCounting, setIsCounting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingRenameTakeId, setPendingRenameTakeId] = useState<string | null>(null);

  const recCtrlRef = useRef<RecordController | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, visible: true });
    toastTimerRef.current = window.setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2200);
  };

  const navigate = (next: ScreenRoute, dir: 'forward' | 'back' = 'forward') => {
    if (route === 'record' && next !== 'record') {
      setIsRecording(false);
      setIsCounting(false);
      recCtrlRef.current = null;
    }
    setAnimDir(dir);
    setPrevRoute(route);
    setRoute(next);
  };

  // Map "back from route X" to its logical parent — used by Android hardware back / swipe gesture.
  const goBackFromCurrent = () => {
    switch (route) {
      case 'home':
        return; // stay; outer history will exit the PWA
      case 'library':
        navigate('home', 'back');
        return;
      case 'beat':
        navigate(prevRoute === 'home' ? 'home' : 'library', 'back');
        return;
      case 'record':
        if (isRecording) return; // ignore back while recording
        navigate(takes.length ? 'session' : 'beat', 'back');
        return;
      case 'session':
        navigate(sessionBackTarget || 'home', 'back');
        return;
      case 'sessions-list':
        navigate('home', 'back');
        return;
      case 'export':
        navigate('session', 'back');
        return;
      case 'exported':
        navigate(sessionOrigin || 'home', 'back');
        return;
    }
  };

  useHistoryNav({ route, onBack: goBackFromCurrent });

  const activeTab: 'home' | 'library' | 'sessions' =
    route === 'home'
      ? 'home'
      : route === 'library' || route === 'beat'
        ? 'library'
        : route === 'sessions-list' || route === 'session' || route === 'record' || route === 'export' || route === 'exported'
          ? 'sessions'
          : 'home';

  const openSession = (s: SessionWithBeat) => {
    setSessionOrigin(route);
    setSessionBackTarget(route);
    setBeat(s.beat);
    setTakes(s.takes);
    setSessionName(s.name);
    setActiveSessionId(s.id);
    navigate('session', 'forward');
  };

  const startNewSession = () => {
    setSessionOrigin('home');
    setSessionBackTarget('record');
    setActiveSessionId(null);
    setBeat(null);
    setTakes([]);
    setSessionName('NEW SESSION');
    navigate('library', 'forward');
  };

  const handleFinishTake = async ({ durationMs, blob, mimeType }: { durationMs: number; blob: Blob | null; mimeType: string }) => {
    if (!beat) return;

    let sessionId = activeSessionId;
    const stamp = todayStamp();

    if (!sessionId) {
      const session: Session = {
        id: newId('s'),
        name: sessionName || 'NEW SESSION',
        beatId: beat.id,
        createdAt: stamp,
        updatedAt: stamp,
      };
      await dbUpsertSession(session);
      sessionId = session.id;
      setActiveSessionId(sessionId);
    } else {
      await dbUpsertSession({ id: sessionId, name: sessionName, beatId: beat.id, createdAt: stamp, updatedAt: stamp });
    }

    const order = takes.length;
    const blobKey = blob ? `take:${newId('a')}` : null;
    if (blob && blobKey) {
      await saveAudioBlob(blobKey, blob, durationMs);
    }
    const take: Take = {
      id: newId('t'),
      sessionId,
      label: null,
      durationMs: durationMs || 0,
      enabled: true,
      volume: 80,
      favorite: false,
      seed: 7 + order * 13,
      audioBlobKey: blobKey,
      order,
    };
    await dbAddTake(take);
    void mimeType;
    const updatedTakes = [...takes, take];
    setTakes(updatedTakes);
    haptics.save();
    setPendingRenameTakeId(take.id);
    await refresh();
    setSessionBackTarget('record');
    navigate('session', 'forward');
  };

  const updateTake = async (id: string, patch: Partial<Take>) => {
    setTakes((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    await dbUpdateTake(id, patch);
    if (activeSessionId) {
      await dbUpsertSession({ id: activeSessionId, name: sessionName, beatId: beat?.id ?? '', createdAt: todayStamp(), updatedAt: todayStamp() });
    }
    await refresh();
  };

  const deleteTake = async (id: string) => {
    setTakes((prev) => prev.filter((t) => t.id !== id));
    await dbDeleteTake(id);
    await refresh();
  };

  const handleRenameSession = async (name: string) => {
    setSessionName(name);
    if (activeSessionId && beat) {
      await dbUpsertSession({ id: activeSessionId, name, beatId: beat.id, createdAt: todayStamp(), updatedAt: todayStamp() });
      await refresh();
    }
  };

  const handleDeleteSession = async (id: string) => {
    await dbDeleteSession(id);
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setTakes([]);
      setBeat(null);
    }
    await refresh();
  };

  const handleAddBeat = async (file?: File) => {
    const id = newId('b');
    const blobKey = `beat:${id}`;
    let duration = 180;
    let title = 'NEW TRACK';
    let format: string = 'MP3';

    if (file) {
      title = file.name.replace(/\.[^.]+$/, '').toUpperCase();
      const ext = file.name.split('.').pop()?.toUpperCase() || 'MP3';
      format = ext === 'M4A' ? 'AAC' : ext;
      await saveAudioBlob(blobKey, file, 0);
      // Decode to get duration
      try {
        const arrBuf = await file.arrayBuffer();
        const audioCtx = new AudioContext();
        const decoded = await audioCtx.decodeAudioData(arrBuf);
        duration = decoded.duration;
        await audioCtx.close();
        await saveAudioBlob(blobKey, file, Math.round(duration * 1000));
      } catch (e) {
        console.warn('[Import] Could not decode audio duration:', e);
      }
    }

    const nb: Beat = {
      id,
      title,
      bpm: 100,
      key: 'Dm',
      format,
      duration,
      side: 'A',
      stamp: 'NEW',
      audioBlobKey: file ? blobKey : null,
    };
    await dbAddBeat(nb);
    await refresh();
    setBeat(nb);
    navigate('beat', 'forward');
    if (file) showToast('Beat loaded to library');
  };

  const goTab = (tab: 'home' | 'library' | 'sessions') => {
    if (tab === 'home') navigate('home', 'back');
    if (tab === 'library') navigate('library', route === 'home' ? 'forward' : 'back');
    if (tab === 'sessions') navigate('sessions-list', 'forward');
  };

  const animClass = animDir === 'back' ? 'screen-slide-back' : 'screen-slide-in';
  const showTabBar = !['export', 'exported'].includes(route);

  // Apply theme attribute on phone-body whenever it mounts
  useEffect(() => {
    const body = document.querySelector('.phone-body');
    if (body) body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode, route]);

  if (!ready) {
    return (
      <div className="phone-wrap">
        <div className="phone-body">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 18,
              background: 'var(--paper-0)',
              color: 'var(--ink-0)',
            }}
          >
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <TapeReel size={56} spinning speed={4} />
              <div style={{ width: 60, height: 2, background: 'var(--line-0)' }} />
              <TapeReel size={56} spinning speed={5.5} />
            </div>
            <div
              style={{
                fontFamily: 'var(--font-disp)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.3em',
                color: 'var(--spot)',
              }}
            >
              BEATSTUDIO ∙ LOADING TAPES
            </div>
          </div>
        </div>
        <div className="phone-label">BEATSTUDIO ▸ INIT</div>
      </div>
    );
  }

  let screen: React.ReactNode = null;
  if (route === 'home') {
    screen = (
      <HomeScreen
        beats={beats}
        sessions={sessions}
        onOpenSession={openSession}
        onNewSession={startNewSession}
        onGoLibrary={(b) => {
          if (b && b.id) {
            setBeat(b);
            navigate('beat', 'forward');
          } else {
            navigate('library', 'forward');
          }
        }}
        onGoSessions={() => navigate('sessions-list', 'forward')}
        onImport={handleAddBeat}
        showToast={showToast}
        darkMode={darkMode}
        onToggleDark={toggleTheme}
      />
    );
  } else if (route === 'library') {
    screen = (
      <LibraryScreen
        beats={beats}
        onOpenBeat={(b) => {
          setBeat(b);
          navigate('beat', 'forward');
        }}
        onAddBeat={handleAddBeat}
        showToast={showToast}
        darkMode={darkMode}
        onToggleDark={toggleTheme}
      />
    );
  } else if (route === 'beat' && beat) {
    screen = (
      <BeatDetailScreen
        beat={beat}
        onBack={() => navigate(prevRoute === 'home' ? 'home' : 'library', 'back')}
        onStart={(b) => {
          setBeat(b);
          setTakes([]);
          setActiveSessionId(null);
          setSessionName('NEW SESSION');
          navigate('record', 'forward');
        }}
        showToast={showToast}
      />
    );
  } else if (route === 'record' && beat) {
    screen = (
      <RecordScreen
        beat={beat}
        takes={takes}
        onBack={() => navigate(takes.length ? 'session' : 'beat', 'back')}
        onFinishTake={handleFinishTake}
        showToast={showToast}
        onRecordingChange={setIsRecording}
        onCountingChange={setIsCounting}
        recCtrlRef={recCtrlRef}
      />
    );
  } else if (route === 'session' && beat) {
    screen = (
      <SessionScreen
        beat={beat}
        takes={takes}
        onBack={() => navigate(sessionBackTarget || 'home', 'back')}
        onNewTake={() => {
          setSessionBackTarget('record');
          navigate('record', 'forward');
        }}
        onExport={() => navigate('export', 'forward')}
        onUpdateTake={(id, patch) => void updateTake(id, patch)}
        onDeleteTake={(id) => void deleteTake(id)}
        showToast={showToast}
        sessionName={sessionName}
        onRenameSession={(name) => void handleRenameSession(name)}
        autoRenameTakeId={pendingRenameTakeId}
        onAutoRenameConsumed={() => setPendingRenameTakeId(null)}
      />
    );
  } else if (route === 'sessions-list') {
    screen = (
      <SessionsListScreen
        sessions={sessions}
        onBack={() => navigate('home', 'back')}
        onOpenSession={openSession}
        onNewSession={startNewSession}
        onDeleteSession={(id) => void handleDeleteSession(id)}
        showToast={showToast}
      />
    );
  } else if (route === 'export' && beat) {
    screen = (
      <ExportScreen
        beat={beat}
        takes={takes}
        exportSerial={exportSerial + 1}
        onBack={() => navigate('session', 'back')}
        onExport={(opts, blob) => {
          setExportSerial((n) => n + 1);
          setExportOpts(opts);
          setExportedBlob(blob ?? null);
          navigate('exported', 'forward');
        }}
        showToast={showToast}
      />
    );
  } else if (route === 'exported' && beat) {
    screen = (
      <ExportSuccessScreen
        beat={beat}
        exportOpts={exportOpts}
        exportSerial={exportSerial}
        exportedBlob={exportedBlob}
        onDone={() => navigate(sessionOrigin || 'home', 'back')}
        showToast={showToast}
      />
    );
  } else {
    // fallback if data missing
    screen = (
      <HomeScreen
        beats={beats}
        sessions={sessions}
        onOpenSession={openSession}
        onNewSession={startNewSession}
        onGoLibrary={() => navigate('library', 'forward')}
        onGoSessions={() => navigate('sessions-list', 'forward')}
        onImport={handleAddBeat}
        showToast={showToast}
        darkMode={darkMode}
        onToggleDark={toggleTheme}
      />
    );
  }

  return (
    <div className="phone-wrap">
      <div className="phone-body">
        <div className="phone-notch" />
        <div className="phone-statusbar" style={{ color: 'var(--ink-0)' }}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>9:41</span>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <svg width="17" height="11" viewBox="0 0 17 11">
              <rect x="0" y="7" width="3" height="4" fill="currentColor" />
              <rect x="4.5" y="5" width="3" height="6" fill="currentColor" />
              <rect x="9" y="2.5" width="3" height="8.5" fill="currentColor" />
              <rect x="13.5" y="0" width="3" height="11" fill="currentColor" />
            </svg>
            <svg width="25" height="12" viewBox="0 0 25 12">
              <rect x="0.5" y="0.5" width="21" height="11" rx="2" stroke="currentColor" fill="none" />
              <rect x="2" y="2" width="18" height="8" fill="currentColor" />
            </svg>
          </span>
        </div>
        <div key={route} className={`phone-screen ${animClass}${showTabBar ? ' has-tabs' : ''}`}>
          {screen}
        </div>
        {showTabBar && (
          <TabBar
            activeTab={activeTab}
            isRecording={isRecording}
            isCounting={isCounting}
            route={route}
            sessionsCount={sessions.length}
            onGoTab={goTab}
            onPrimaryAction={() => {
              if (storage.critical && !isRecording) {
                showToast('Storage full — delete a session');
                return;
              }
              if (route === 'record') {
                if (isRecording) {
                  recCtrlRef.current?.stop();
                } else if (!isCounting) {
                  recCtrlRef.current?.start();
                }
              } else if (beat) {
                navigate('record', 'forward');
              } else {
                startNewSession();
                showToast('Pick a beat first');
              }
            }}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
        <SettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          darkMode={darkMode}
          onToggleDark={() => {
            setSettingsOpen(false);
            toggleTheme();
          }}
          showToast={showToast}
        />
        <IOSInstallSheet />
        {toast.msg && <Toast msg={toast.msg} visible={toast.visible} />}
      </div>
      <div className="phone-label">
        BEATSTUDIO ▸ {route.toUpperCase()} {darkMode ? '· STUDIO' : ''}
      </div>
    </div>
  );
}

interface TabBarProps {
  activeTab: 'home' | 'library' | 'sessions';
  isRecording: boolean;
  isCounting: boolean;
  route: ScreenRoute;
  sessionsCount: number;
  onGoTab: (t: 'home' | 'library' | 'sessions') => void;
  onPrimaryAction: () => void;
  onOpenSettings: () => void;
}

const TabBar = ({ activeTab, isRecording, isCounting, route, sessionsCount, onGoTab, onPrimaryAction, onOpenSettings }: TabBarProps) => (
  <div className="tab-bar">
    <button className={`tab-btn${activeTab === 'home' ? ' active' : ''}`} onClick={() => onGoTab('home')} type="button" aria-label="Home tab">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={activeTab === 'home' ? 'var(--spot)' : 'var(--ink-2)'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
      <span className="tab-label" style={{ color: activeTab === 'home' ? 'var(--spot)' : 'var(--ink-2)' }}>Home</span>
    </button>

    <button className={`tab-btn${activeTab === 'library' ? ' active' : ''}`} onClick={() => onGoTab('library')} type="button" aria-label="Beats tab">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={activeTab === 'library' ? 'var(--spot)' : 'var(--ink-2)'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" rx="1" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="15" cy="12" r="2" />
        <rect x="7" y="16" width="10" height="1.5" />
      </svg>
      <span className="tab-label" style={{ color: activeTab === 'library' ? 'var(--spot)' : 'var(--ink-2)' }}>Beats</span>
    </button>

    <button className="tab-btn" style={{ position: 'relative' }} onClick={onPrimaryAction} type="button" aria-label={isRecording ? 'Stop recording' : 'Start recording'}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: isRecording ? 'var(--spot)' : 'var(--ink-0)',
          border: isRecording ? '3px solid var(--spot-dk)' : '3px solid var(--line-0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isRecording
            ? '0 0 20px rgba(217,58,28,.9), 0 0 40px rgba(217,58,28,.4), 3px 3px 0 var(--spot-dk)'
            : route === 'record'
              ? '0 0 10px rgba(217,58,28,.3), 3px 3px 0 var(--spot-dk)'
              : '3px 3px 0 #000,inset 0 1px 0 rgba(255,255,255,.15)',
          marginTop: -18,
          transition: 'all 120ms var(--ease)',
          animation: isRecording ? 'rec-pulse 1.1s infinite ease-in-out' : 'none',
          cursor: isCounting ? 'wait' : 'pointer',
        }}
      >
        {isRecording ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#F0EBDF" stroke="none">
            <rect x="5" y="5" width="14" height="14" rx="2" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#F0EBDF" stroke="none">
            <circle cx="12" cy="12" r="7" />
          </svg>
        )}
      </div>
      <span
        className="tab-label"
        style={{
          color: isRecording || route === 'record' ? 'var(--spot)' : 'var(--ink-0)',
          marginTop: -2,
          animation: isRecording ? 'blink 1s infinite' : 'none',
        }}
      >
        {isRecording ? '● REC' : 'Record'}
      </span>
    </button>

    <button className={`tab-btn${activeTab === 'sessions' ? ' active' : ''}`} style={{ position: 'relative' }} onClick={() => onGoTab('sessions')} type="button" aria-label="Sessions tab">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={activeTab === 'sessions' ? 'var(--spot)' : 'var(--ink-2)'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
      </svg>
      <span className="tab-label" style={{ color: activeTab === 'sessions' ? 'var(--spot)' : 'var(--ink-2)' }}>Sessions</span>
      {sessionsCount > 0 && (
        <div style={{ position: 'absolute', top: 8, right: 'calc(50% - 18px)', width: 14, height: 14, borderRadius: '50%', background: 'var(--spot)', border: '2px solid var(--paper-0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 800, color: '#F0EBDF' }}>{Math.min(sessionsCount, 9)}</span>
        </div>
      )}
    </button>

    <button className="tab-btn" onClick={onOpenSettings} type="button" aria-label="Settings tab">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <span className="tab-label" style={{ color: 'var(--ink-2)' }}>Settings</span>
    </button>
  </div>
);

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  showToast: (msg: string) => void;
}

const SettingsSheet = ({ open, onClose, darkMode, onToggleDark, showToast }: SettingsSheetProps) => (
  <Sheet open={open} onClose={onClose} title="SETTINGS">
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', marginBottom: 10 }}>APPEARANCE</div>
      <button
        className={`theme-toggle${darkMode ? ' dark-active' : ''}`}
        style={{ width: '100%', justifyContent: 'space-between' }}
        onClick={onToggleDark}
        type="button"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>{darkMode ? '🌙' : '☀️'}</span>
          {darkMode ? 'Studio Mode · ON' : 'Studio Mode · OFF'}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: darkMode ? 'var(--spot)' : 'var(--ink-2)', letterSpacing: '.1em' }}>
          {darkMode ? 'DARK' : 'LIGHT'}
        </span>
      </button>
    </div>
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed rgba(23,22,26,.25)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', marginBottom: 10 }}>AUDIO</div>
      <MenuRow icon="mic" label="Input Device" hint="Built-in Microphone" onClick={() => showToast('Input — coming soon')} />
      <MenuRow icon="cassette" label="Sample Rate" hint="44.1 kHz" onClick={() => showToast('Sample rate — coming soon')} />
      <MenuRow icon="list" label="Default Format" hint="WAV 16-bit" onClick={() => showToast('Format — coming soon')} />
    </div>
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed rgba(23,22,26,.25)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', color: 'var(--ink-2)', marginBottom: 10 }}>ABOUT</div>
      <MenuRow icon="more" label="BeatStudio" hint="v1.0 · build 042" onClick={() => showToast('BeatStudio v1.0')} />
      <MenuRow icon="share" label="Privacy Policy" hint="beatstudio.app/privacy" onClick={() => showToast('Privacy — coming soon')} />
    </div>
  </Sheet>
);
