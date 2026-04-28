import { db } from './schema';
import type { AudioBlobRow } from './schema';
import type { Beat, Session, SessionWithBeat, Take } from '../types';

export async function getBeats(): Promise<Beat[]> {
  return db.beats.toArray();
}

export async function getBeat(id: string): Promise<Beat | undefined> {
  return db.beats.get(id);
}

export async function addBeat(beat: Beat): Promise<void> {
  await db.beats.add(beat);
}

export async function deleteBeat(id: string): Promise<void> {
  await db.beats.delete(id);
}

export async function getSessions(): Promise<SessionWithBeat[]> {
  const [sessions, beats, takes] = await Promise.all([
    db.sessions.orderBy('updatedAt').reverse().toArray(),
    db.beats.toArray(),
    db.takes.toArray(),
  ]);
  const beatMap = new Map(beats.map((b) => [b.id, b]));
  const takesBySession = new Map<string, Take[]>();
  for (const t of takes) {
    const arr = takesBySession.get(t.sessionId) ?? [];
    arr.push(t);
    takesBySession.set(t.sessionId, arr);
  }
  for (const [, list] of takesBySession) {
    list.sort((a, b) => a.order - b.order);
  }
  return sessions
    .filter((s) => beatMap.has(s.beatId))
    .map((s) => ({
      ...s,
      beat: beatMap.get(s.beatId) as Beat,
      takes: takesBySession.get(s.id) ?? [],
    }));
}

export async function getSession(id: string): Promise<SessionWithBeat | undefined> {
  const session = await db.sessions.get(id);
  if (!session) return undefined;
  const beat = await db.beats.get(session.beatId);
  if (!beat) return undefined;
  const takes = (await db.takes.where('sessionId').equals(id).toArray()).sort((a, b) => a.order - b.order);
  return { ...session, beat, takes };
}

export async function upsertSession(session: Session): Promise<void> {
  await db.sessions.put(session);
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.takes, db.audioBlobs, async () => {
    const takes = await db.takes.where('sessionId').equals(id).toArray();
    const blobKeys = takes.map((t) => t.audioBlobKey).filter((k): k is string => !!k);
    await db.takes.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
    if (blobKeys.length) {
      await db.audioBlobs.bulkDelete(blobKeys);
    }
  });
}

export async function getTakes(sessionId: string): Promise<Take[]> {
  const list = await db.takes.where('sessionId').equals(sessionId).toArray();
  return list.sort((a, b) => a.order - b.order);
}

export async function addTake(take: Take): Promise<void> {
  await db.takes.add(take);
}

export async function updateTake(id: string, patch: Partial<Take>): Promise<void> {
  await db.takes.update(id, patch);
}

export async function deleteTake(id: string): Promise<void> {
  await db.transaction('rw', db.takes, db.audioBlobs, async () => {
    const take = await db.takes.get(id);
    await db.takes.delete(id);
    if (take?.audioBlobKey) {
      await db.audioBlobs.delete(take.audioBlobKey);
    }
  });
}

export async function saveAudioBlob(key: string, blob: Blob, durationMs: number): Promise<void> {
  const row: AudioBlobRow = {
    key,
    blob,
    mime: blob.type || 'audio/webm',
    durationMs,
    createdAt: Date.now(),
  };
  await db.audioBlobs.put(row);
}

export async function loadAudioBlob(key: string): Promise<Blob | undefined> {
  const row = await db.audioBlobs.get(key);
  return row?.blob;
}

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}
