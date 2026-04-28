import Dexie, { type Table } from 'dexie';
import type { Beat, Session, Take } from '../types';

export interface AudioBlobRow {
  key: string;
  blob: Blob;
  mime: string;
  durationMs: number;
  createdAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export class BeatStudioDB extends Dexie {
  beats!: Table<Beat, string>;
  sessions!: Table<Session, string>;
  takes!: Table<Take, string>;
  audioBlobs!: Table<AudioBlobRow, string>;
  settings!: Table<SettingRow, string>;

  constructor() {
    super('beatstudio');
    this.version(1).stores({
      beats: 'id, title, side, stamp',
      sessions: 'id, beatId, updatedAt',
      takes: 'id, sessionId, order',
      audioBlobs: 'key, createdAt',
      settings: 'key',
    });
  }
}

export const db = new BeatStudioDB();
