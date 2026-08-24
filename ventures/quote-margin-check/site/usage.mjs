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
 * Turns a stream of rapid input changes into at most one event per settled,
 * distinct result.
 *
 * The calculator re-renders on every keystroke, which is the right feel for
 * the user but the wrong thing to count: recording straight from the render
 * path scores "2400" as four reports and a backspace as a fifth, so the
 * `report_generated` figure the portfolio steers on would measure typing
 * speed rather than reports. Callers `note()` each valid render; nothing is
 * recorded until the figures have stopped changing for `delayMs`, and a
 * result identical to the last one already counted is never counted twice.
 *
 * `schedule`/`cancel` are injectable so this is testable without real timers.
 */
export function createSettledRecorder({
  record = recordEvent,
  delayMs = 700,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  let timer = null;
  let lastSignature = null;

  function discard() {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  }

  return {
    /**
     * Marks `signature` (a stable string form of the rendered figures) as the
     * result currently on screen. Records `eventName` once it settles.
     */
    note(eventName, signature) {
      // Back on the result already counted (e.g. typed a digit and deleted
      // it): drop the in-flight record too, or that transient would land.
      if (signature === lastSignature) {
        discard();
        return;
      }
      discard();
      timer = schedule(() => {
        timer = null;
        lastSignature = signature;
        record(eventName);
      }, delayMs);
    },
    /** Accepts a signature as already-counted without recording it — used for the pre-filled first render, which is a page view, not a report the visitor asked for. */
    seed(signature) {
      discard();
      lastSignature = signature;
    },
    /** Drops a pending record, e.g. when input went invalid before it settled. */
    discard,
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
