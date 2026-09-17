/**
 * Browser watchlist: the local half of `src/vendor_watch/store.py`.
 *
 * The CLI's loop is "capture now, capture again later, diff the pair", and a
 * page that forgets between visits cannot offer that loop at all — it degrades
 * to a two-textarea diff. So snapshots live in `localStorage`, on the reader's
 * own machine, and the page is useful on the second visit in a way it cannot be
 * on the first.
 *
 * Two snapshots are kept per watch, which is exactly what a diff needs. Keeping
 * a full history would be nicer and is not affordable: legal pages run to tens
 * of kilobytes and `localStorage` is a ~5MB budget shared with every other tool
 * on the origin, so an unbounded history would eventually start throwing on
 * writes — and a storage failure here means a *lost capture*, which is the one
 * failure this venture must not have.
 */

const KEY = "vendor-change-watch-snapshots";
const SNAPSHOTS_PER_WATCH = 2;

/**
 * Field separator for the watch key.
 *
 * It has to be something a vendor name, page type or URL cannot contain, or
 * "Acme SaaS" and a vendor called "Acme" with a page type of "SaaS" would share
 * a key. Written as an escape rather than as the literal control character:
 * embedding one makes git classify this file as binary, which silently turns
 * every future diff of it into "Binary files differ".
 */
const ID_SEPARATOR = "\u001f";

/** Stable identity for a watched page — the CLI's (vendor, type, url) triple. */
export function watchId(snapshot) {
  return [snapshot.vendor, snapshot.page_type, snapshot.page_url].join(ID_SEPARATOR);
}

export function describeWatch(id) {
  const [vendor, pageType, pageUrl] = String(id).split(ID_SEPARATOR);
  return { vendor, pageType, pageUrl };
}

function readRaw(storage) {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeRaw(storage, value) {
  if (!storage) return { ok: false, reason: "no-storage" };
  try {
    storage.setItem(KEY, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    // Quota, or storage disabled entirely (private mode, blocked cookies). The
    // caller has to be told: silently dropping a capture would make the page
    // look like it remembered when it did not, and the reader would come back
    // next month to a watchlist that is quietly empty.
    return { ok: false, reason: error && error.name === "QuotaExceededError" ? "quota" : "blocked" };
  }
}

export function listWatches(storage) {
  const all = readRaw(storage);
  return Object.entries(all)
    .map(([id, snapshots]) => ({
      id,
      ...describeWatch(id),
      snapshots: Array.isArray(snapshots) ? snapshots : [],
    }))
    .filter((watch) => watch.snapshots.length > 0)
    .sort((a, b) => {
      const at = a.snapshots[a.snapshots.length - 1].captured_at;
      const bt = b.snapshots[b.snapshots.length - 1].captured_at;
      return String(bt).localeCompare(String(at));
    });
}

export function getSnapshots(storage, id) {
  const all = readRaw(storage);
  const found = all[id];
  return Array.isArray(found) ? found : [];
}

/**
 * Store a capture, keeping only the newest `SNAPSHOTS_PER_WATCH`. Returns the
 * pair now available for diffing, and whether the write actually landed.
 */
export function saveSnapshot(storage, snapshot) {
  const id = watchId(snapshot);
  const all = readRaw(storage);
  const existing = Array.isArray(all[id]) ? all[id] : [];
  const kept = [...existing, snapshot].slice(-SNAPSHOTS_PER_WATCH);
  all[id] = kept;
  const written = writeRaw(storage, all);
  return {
    id,
    snapshots: kept,
    previous: kept.length > 1 ? kept[kept.length - 2] : null,
    stored: written.ok,
    reason: written.reason,
  };
}

export function removeWatch(storage, id) {
  const all = readRaw(storage);
  delete all[id];
  return writeRaw(storage, all);
}

export function clearAll(storage) {
  if (!storage) return { ok: false, reason: "no-storage" };
  try {
    storage.removeItem(KEY);
    return { ok: true };
  } catch {
    return { ok: false, reason: "blocked" };
  }
}

export { SNAPSHOTS_PER_WATCH };
