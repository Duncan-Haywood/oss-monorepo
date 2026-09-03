// Local-first, aggregate-only usage counting, per portfolio/usage/usage.yaml:
// count events, never people. No IDs, no IPs, no content — just an event
// name and a day, kept in this browser's own localStorage. Nothing is sent
// anywhere; there is no server for it to go to. Off-switchable, and honors
// Do Not Track / Global Privacy Control automatically.

const STORAGE_KEY = "rc-filter-calculator:usage-events";
const OPT_OUT_KEY = "rc-filter-calculator:usage-opt-out";

function hasStorage() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function honorsBrowserSignal() {
  try {
    return navigator?.doNotTrack === "1" || navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function isUsageCountingEnabled() {
  if (!hasStorage()) return false;
  if (honorsBrowserSignal()) return false;
  try {
    return localStorage.getItem(OPT_OUT_KEY) !== "1";
  } catch {
    return false;
  }
}

export function setUsageCountingEnabled(enabled) {
  if (!hasStorage()) return;
  try {
    if (enabled) localStorage.removeItem(OPT_OUT_KEY);
    else localStorage.setItem(OPT_OUT_KEY, "1");
  } catch {
    // storage unavailable (private mode, quota) — nothing to do
  }
}

/** Records that `eventName` happened today. Aggregate count only; no payload beyond the event name and the day. */
export function recordEvent(eventName) {
  if (!isUsageCountingEnabled()) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(STORAGE_KEY);
    const events = raw ? JSON.parse(raw) : {};
    const key = `${eventName}:${day}`;
    events[key] = (events[key] || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // storage unavailable — counting is best-effort only
  }
}

// How long an input must sit unchanged before the interaction counts as one
// event. Long enough to span ordinary typing (including a pause to look at
// the result), short enough that a user who types and immediately leaves is
// still counted.
const SETTLE_MS = 800;

const pendingTimers = new Map();

/**
 * Records `eventName` once the user has stopped changing inputs, rather than
 * once per keystroke.
 *
 * These tools recompute on every `input` event, which is right for the
 * result but wrong for the counter: calling recordEvent() from that handler
 * counted keystrokes, so typing "220" into one field recorded three
 * calculations and a five-field form could record a dozen. That made the
 * only signal these tools produce -- "did anyone actually use this" --
 * unreadable, and portfolio/usage/ is what decides what gets built next.
 *
 * Repeated calls for the same event name collapse into one, so a burst of
 * typing yields a single count once it settles. Different event names are
 * tracked independently, so two calculators on one page each keep their own.
 */
export function recordEventSettled(eventName, delayMs = SETTLE_MS) {
  const existing = pendingTimers.get(eventName);
  if (existing !== undefined) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingTimers.delete(eventName);
    recordEvent(eventName);
  }, delayMs);
  // Under Node (the test runner) a pending timer keeps the process alive;
  // browsers have no unref, hence the guard rather than a bare call.
  if (typeof timer === "object" && typeof timer?.unref === "function") timer.unref();
  pendingTimers.set(eventName, timer);
}

/** Records any settled-but-not-yet-written events immediately. Exists so tests need not wait on wall-clock time. */
export function flushSettledEvents() {
  for (const [eventName, timer] of pendingTimers) {
    clearTimeout(timer);
    recordEvent(eventName);
  }
  pendingTimers.clear();
}

/** Discards pending settled events without recording them. Used by tests to isolate cases. */
export function cancelSettledEvents() {
  for (const timer of pendingTimers.values()) clearTimeout(timer);
  pendingTimers.clear();
}

/** Returns the raw local event counts, for the user's own inspection. */
export function readLocalUsage() {
  if (!hasStorage()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
