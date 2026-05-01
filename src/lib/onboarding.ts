import { db } from '../db/schema';

const ONBOARDED_KEY = 'onboarded_v1';
const SEEDED_KEY = 'seeded';

export async function hasOnboarded(): Promise<boolean> {
  const row = await db.settings.get(ONBOARDED_KEY);
  if (row?.value === true) return true;
  // Backfill: users from before onboarding existed already had the seed run.
  // Treat them as onboarded so we don't show the tour to returning users.
  const seeded = await db.settings.get(SEEDED_KEY);
  if (seeded?.value === true) {
    await db.settings.put({ key: ONBOARDED_KEY, value: true });
    return true;
  }
  return false;
}

export async function markOnboarded(): Promise<void> {
  await db.settings.put({ key: ONBOARDED_KEY, value: true });
}

// Mark the seed as already applied so seedIfEmpty becomes a no-op.
// Used when the user opts out of starter beats during onboarding.
export async function skipSeed(): Promise<void> {
  await db.settings.put({ key: SEEDED_KEY, value: true });
}
