// Anonymous, local-only, in-browser event counter.
//
// No server, no analytics vendor, no IDs, no content. Everything lives in
// this browser's localStorage, is visible to the user in the "Usage" panel,
// and can be cleared or turned off at any time. See the README's Privacy
// section and portfolio/usage/README.md for the rules this follows.

const STORAGE_KEY = "no-show-fee-calculator:usage:v1";
const OPT_OUT_KEY = "no-show-fee-calculator:usage-opt-out:v1";
const MAX_EVENTS = 500;

/** @returns {boolean} */
export function isOptedOut() {
  try {
    if (localStorage.getItem(OPT_OUT_KEY) === "1") return true;
  } catch {
    // localStorage unavailable (private mode, disabled storage) — treat as opted out.
    return true;
  }
  try {
    const dnt = globalThis.navigator?.doNotTrack;
    const gpc = /** @type {any} */ (globalThis.navigator)?.globalPrivacyControl;
    if (dnt === "1" || dnt === "yes" || gpc === true) return true;
  } catch {
    // ignore
  }
  return false;
}

/** @param {boolean} value */
export function setOptedOut(value) {
  try {
    localStorage.setItem(OPT_OUT_KEY, value ? "1" : "0");
  } catch {
    // ignore — nothing we can do without storage
  }
}

/**
 * Records an anonymous event: just a name and the day. Never any content,
 * never an identifier that outlives this bounded log.
 * @param {string} eventName
 */
export function recordEvent(eventName) {
  if (isOptedOut()) return;
  try {
    const log = readLog();
    log.push({ event: eventName, day: new Date().toISOString().slice(0, 10) });
    while (log.length > MAX_EVENTS) log.shift();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // storage unavailable — usage counting is best-effort only
  }
}

/**
 * @returns {{ event: string, day: string }[]}
 */
function readLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Summarizes the local event log into counts per event name, for display
 * only — this never leaves the browser.
 * @returns {{ total: number, byEvent: Record<string, number> }}
 */
export function getUsageSummary() {
  const log = readLog();
  /** @type {Record<string, number>} */
  const byEvent = {};
  for (const entry of log) {
    byEvent[entry.event] = (byEvent[entry.event] ?? 0) + 1;
  }
  return { total: log.length, byEvent };
}

export function clearUsageLog() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
