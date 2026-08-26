// Bounded, module-level, in-memory snapshot store.
//
// This is a prototype-stage demo store, not a database — exactly the same
// honesty level as usage-events.ts. It holds at most MAX_TRACKED_URLS
// distinct URLs; the oldest-touched URL is evicted to make room for a new
// one once the cap is hit. It resets on every deploy/restart and is shared
// by every visitor — there are no per-user accounts.

export type StoredSnapshot = {
  url: string;
  normalizedText: string;
  hash: string;
  fetchedAt: string;
  httpStatus: number;
};

const MAX_TRACKED_URLS = 200;

const snapshots = new Map<string, StoredSnapshot>();

export function getSnapshot(url: string): StoredSnapshot | undefined {
  return snapshots.get(url);
}

export function saveSnapshot(snapshot: StoredSnapshot): void {
  const isNewUrl = !snapshots.has(snapshot.url);
  if (isNewUrl && snapshots.size >= MAX_TRACKED_URLS) {
    const oldestKey = snapshots.keys().next().value;
    if (oldestKey !== undefined) snapshots.delete(oldestKey);
  }
  // Delete then re-set so the Map's insertion order tracks recency
  // (most-recently-touched URL moves to the end / is least likely evicted).
  snapshots.delete(snapshot.url);
  snapshots.set(snapshot.url, snapshot);
}

export function getTrackedUrlCount(): number {
  return snapshots.size;
}

export function clearWatchStoreForTests(): void {
  snapshots.clear();
}
