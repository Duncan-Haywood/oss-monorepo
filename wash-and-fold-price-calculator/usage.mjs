/**
 * Anonymous, aggregate-only usage counting, kept in the visitor's own browser.
 *
 * What is stored is an event name, a count, and the current day — never a
 * wage, a utility rate, a price per pound, a volume, or anything else typed
 * into the calculator. An operator's cost structure is exactly the sort of
 * thing that must not be transmitted anywhere, so nothing here transmits: the
 * counter is written to `localStorage` and read back only by this page.
 *
 * The opt-out is stored too, rather than held in memory, so turning counting
 * off stays off on the next visit. Do Not Track and Global Privacy Control
 * switch it off with no action from the visitor at all.
 */

export const USAGE_KEY = "wash-and-fold-usage";
export const OPT_OUT_KEY = "wash-and-fold-usage-off";

function browserSignalsNo() {
  try {
    return (
      globalThis.navigator?.doNotTrack === "1" ||
      globalThis.navigator?.globalPrivacyControl === true
    );
  } catch {
    return false;
  }
}

function read(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function usageOptedOut(storage = globalThis.localStorage) {
  return read(storage, OPT_OUT_KEY) === "1" || browserSignalsNo();
}

export function setUsageOptOut(value, storage = globalThis.localStorage) {
  if (!storage) return;
  try {
    if (value) {
      storage.setItem(OPT_OUT_KEY, "1");
      storage.removeItem?.(USAGE_KEY);
    } else {
      storage.removeItem?.(OPT_OUT_KEY);
    }
  } catch {
    /* storage is optional */
  }
}

export function recordUsage(event = "estimate", storage = globalThis.localStorage) {
  if (!storage || usageOptedOut(storage)) return;
  let current;
  try {
    current = JSON.parse(read(storage, USAGE_KEY) || "{}");
  } catch {
    current = {};
  }
  if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
  current[event] = (current[event] || 0) + 1;
  current.last_day = new Date().toISOString().slice(0, 10);
  try {
    storage.setItem(USAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage is optional */
  }
}

export function readUsage(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(read(storage, USAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
