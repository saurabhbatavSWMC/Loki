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
  // Cascade: delete the beat, its blob, all its sessions, all takes in those sessions, and their blobs.
  await db.transaction('rw', db.beats, db.sessions, db.takes, db.audioBlobs, async () => {
    const beat = await db.beats.get(id);
    const sessions = await db.sessions.where('beatId').equals(id).toArray();
    const sessionIds = sessions.map((s) => s.id);
    const takes = sessionIds.length
      ? await db.takes.where('sessionId').anyOf(sessionIds).toArray()
      : [];
    const takeBlobKeys = takes.map((t) => t.audioBlobKey).filter((k): k is string => !!k);
    const beatBlobKey = beat?.audioBlobKey ?? null;

    if (sessionIds.length) {
      await db.takes.where('sessionId').anyOf(sessionIds).delete();
      await db.sessions.bulkDelete(sessionIds);
    }
    await db.beats.delete(id);
    const blobsToDelete = [...takeBlobKeys, ...(beatBlobKey ? [beatBlobKey] : [])];
    if (blobsToDelete.length) await db.audioBlobs.bulkDelete(blobsToDelete);
  });
}

export async function updateBeat(id: string, patch: Partial<Beat>): Promise<void> {
  await db.beats.update(id, patch);
}

export async function getSessionCountForBeat(beatId: string): Promise<number> {
  return db.sessions.where('beatId').equals(beatId).count();
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

/**
 * Deep-copy a session: new session row + cloned takes + cloned audio blobs.
 * Returns the new session id.
 */
export async function duplicateSession(sourceId: string): Promise<string | null> {
  const src = await db.sessions.get(sourceId);
  if (!src) return null;
  const takes = await db.takes.where('sessionId').equals(sourceId).toArray();
  takes.sort((a, b) => a.order - b.order);

  const newSessionId = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  const stamp = `${now.toLocaleString('en-US', { month: 'short' }).toUpperCase()} ${now.getDate()}`;

  await db.transaction('rw', db.sessions, db.takes, db.audioBlobs, async () => {
    await db.sessions.add({
      ...src,
      id: newSessionId,
      name: `${src.name} (COPY)`,
      createdAt: stamp,
      updatedAt: stamp,
    });
    for (let i = 0; i < takes.length; i++) {
      const t = takes[i];
      let newBlobKey: string | null = null;
      if (t.audioBlobKey) {
        const row = await db.audioBlobs.get(t.audioBlobKey);
        if (row) {
          newBlobKey = `take:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${i}`;
          await db.audioBlobs.put({
            key: newBlobKey,
            blob: row.blob,
            mime: row.mime,
            durationMs: row.durationMs,
            createdAt: Date.now(),
          });
        }
      }
      const newTakeId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${i}`;
      await db.takes.add({
        ...t,
        id: newTakeId,
        sessionId: newSessionId,
        audioBlobKey: newBlobKey,
      });
    }
  });

  return newSessionId;
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
