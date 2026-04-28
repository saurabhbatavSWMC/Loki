import { db } from './schema';
import type { Beat, Session, Take } from '../types';

const BEATS_DATA: Beat[] = [
  { id: 'b1', title: 'MIDNIGHT DRIVE', bpm: 92,  key: 'Am',  format: 'WAV', duration: 154, side: 'A', stamp: 'NEW' },
  { id: 'b2', title: 'GLASS SKY',      bpm: 140, key: 'F#m', format: 'MP3', duration: 182, side: 'B', stamp: null  },
  { id: 'b3', title: 'SLOW FADE',      bpm: 78,  key: 'Cm',  format: 'WAV', duration: 168, side: 'A', stamp: 'FAV' },
  { id: 'b4', title: 'GOLD TEETH',     bpm: 148, key: 'Gm',  format: 'MP3', duration: 132, side: 'B', stamp: null  },
  { id: 'b5', title: 'KILN',           bpm: 120, key: 'Dm',  format: 'WAV', duration: 210, side: 'A', stamp: null  },
];

interface SeedSession {
  session: Session;
  takes: Take[];
}

const SESSIONS_SEED: SeedSession[] = [
  {
    session: { id: 's1', name: 'SESSION · APR 20', beatId: 'b1', createdAt: 'APR 20', updatedAt: 'APR 20' },
    takes: [
      { id: 't1', sessionId: 's1', label: 'Hook v1',        durationMs: 142000, enabled: false, volume: 75, favorite: false, seed: 12,  order: 0 },
      { id: 't2', sessionId: 's1', label: 'Hook v2 · best', durationMs: 138000, enabled: true,  volume: 92, favorite: true,  seed: 22,  order: 1 },
      { id: 't3', sessionId: 's1', label: null,             durationMs: 145000, enabled: true,  volume: 80, favorite: false, seed: 33,  order: 2 },
      { id: 't4', sessionId: 's1', label: 'Verse 1',        durationMs: 156000, enabled: true,  volume: 85, favorite: false, seed: 44,  order: 3 },
    ],
  },
  {
    session: { id: 's2', name: 'SESSION · APR 18', beatId: 'b2', createdAt: 'APR 18', updatedAt: 'APR 18' },
    takes: [
      { id: 't5', sessionId: 's2', label: 'Chorus', durationMs: 118000, enabled: true, volume: 88, favorite: true,  seed: 55, order: 0 },
      { id: 't6', sessionId: 's2', label: null,     durationMs: 122000, enabled: true, volume: 80, favorite: false, seed: 66, order: 1 },
    ],
  },
  {
    session: { id: 's3', name: 'SESSION · APR 15', beatId: 'b3', createdAt: 'APR 15', updatedAt: 'APR 15' },
    takes: [
      { id: 't7',  sessionId: 's3', label: 'Intro',       durationMs: 168000, enabled: true,  volume: 82, favorite: false, seed: 77,  order: 0 },
      { id: 't8',  sessionId: 's3', label: 'Bridge',      durationMs: 160000, enabled: true,  volume: 78, favorite: false, seed: 88,  order: 1 },
      { id: 't9',  sessionId: 's3', label: 'Outro take',  durationMs: 172000, enabled: false, volume: 70, favorite: false, seed: 99,  order: 2 },
      { id: 't10', sessionId: 's3', label: 'Final outro', durationMs: 165000, enabled: true,  volume: 90, favorite: true,  seed: 110, order: 3 },
      { id: 't11', sessionId: 's3', label: null,          durationMs: 158000, enabled: true,  volume: 80, favorite: false, seed: 121, order: 4 },
      { id: 't12', sessionId: 's3', label: 'Best take',   durationMs: 163000, enabled: true,  volume: 88, favorite: true,  seed: 132, order: 5 },
    ],
  },
];

export async function seedIfEmpty(): Promise<void> {
  const seeded = await db.settings.get('seeded');
  if (seeded) return;

  await db.transaction('rw', db.beats, db.sessions, db.takes, db.settings, async () => {
    await db.beats.bulkAdd(BEATS_DATA);
    for (const { session, takes } of SESSIONS_SEED) {
      await db.sessions.add(session);
      await db.takes.bulkAdd(takes);
    }
    await db.settings.put({ key: 'seeded', value: true });
  });
}
