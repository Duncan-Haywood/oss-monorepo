// Local-first, aggregate-only usage counting, per portfolio/usage/usage.yaml:
// count events, never people. No IDs, no IPs, no content — just an event
// name and a day, kept in this browser's own localStorage. Nothing is sent
// anywhere; there is no server for it to go to. Off-switchable, and honors
// Do Not Track / Global Privacy Control automatically.

const STORAGE_KEY = "quote-margin-check:usage-events";
const OPT_OUT_KEY = "quote-margin-check:usage-opt-out";

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

/**
 * Wraps `recordEvent` so a live-updating form counts *reports*, not keystrokes.
 *
 * The form recomputes on every `input` event, so calling `recordEvent` straight
 * from the render path counts one "report" per character typed — typing `4200`
 * into the price field would log four. That inflates the only signal this
 * portfolio uses to judge whether a tool is used at all, and inflates it most
 * for the users who fiddle with their numbers the longest, which is exactly
 * backwards.
 *
 * So: wait until input has settled (`delayMs` with no further calls), then
 * count once — and only if the settled result actually differs from the last
 * one counted, so tabbing through fields or retyping the same figure doesn't
 * add a second report.
 *
 * Timer functions are injected so this is testable without real waiting.
 */
export function createReportCounter({
  record = recordEvent,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  delayMs = 1200,
} = {}) {
  let pending = null;
  let lastCounted = null;

  return function countReport(signature) {
    if (pending !== null) clearTimer(pending);
    pending = setTimer(() => {
      pending = null;
      if (signature === lastCounted) return;
      lastCounted = signature;
      record("report_generated");
    }, delayMs);
  };
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
