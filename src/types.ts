export type Stamp = 'NEW' | 'FAV' | null;

export interface Beat {
  id: string;
  title: string;
  bpm: number;
  key: string;
  format: 'WAV' | 'MP3' | string;
  duration: number;
  side: 'A' | 'B';
  stamp: Stamp;
  audioBlobKey?: string | null;
}

export interface Take {
  id: string;
  sessionId: string;
  label: string | null;
  durationMs: number;
  enabled: boolean;
  volume: number;
  favorite: boolean;
  seed: number;
  audioBlobKey?: string | null;
  order: number;
}

export interface Session {
  id: string;
  name: string;
  beatId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionWithBeat extends Session {
  beat: Beat;
  takes: Take[];
}

export interface ExportOpts {
  format: 'MP3' | 'WAV';
  quality: string;
  mixType: 'full' | 'vocals' | 'beat';
}

export type ScreenRoute =
  | 'home'
  | 'library'
  | 'beat'
  | 'record'
  | 'session'
  | 'sessions-list'
  | 'export'
  | 'exported';
