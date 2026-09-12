// Local-first, aggregate-only usage counting, per portfolio/usage: count
// events, never people. No IDs, no IPs, no manifest content -- just an
// event name and a day, kept in this browser's own localStorage. Nothing is
// sent anywhere. Off-switchable, and honors DNT / GPC.

const STORAGE_KEY = "mcp-supply-chain-watch:usage-events";
const OPT_OUT_KEY = "mcp-supply-chain-watch:usage-opt-out";

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
    // storage unavailable
  }
}

export function recordEvent(eventName) {
  // `isUsageCountingEnabled` already reads the same key the control writes,
  // so it is the whole gate: one source of truth, honoured here and painted
  // on the page.
  if (!isUsageCountingEnabled()) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(STORAGE_KEY);
    const events = raw ? JSON.parse(raw) : {};
    const key = `${eventName}:${day}`;
    events[key] = (events[key] || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // counting is best-effort
  }
}

export function readLocalUsage() {
  if (!hasStorage()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// The page-facing pair. This venture already had an opt-out, under
// OPT_OUT_KEY, so these read and write *that* -- the first draft invented
// `${STORAGE_KEY}-opt-out` beside it, which left a returning visitor with
// counting correctly off (recordEvent honours the old key) and the control
// painted as if their choice had been forgotten. Two keys mean the page's one
// control can only ever set one of them.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(OPT_OUT_KEY) === "1";
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function writeOptOut(storage = globalThis.localStorage, optedOut = false) {
  if (!storage) return;
  // Independent writes, counters first: sharing one try means a setItem
  // that throws on a full quota skips the delete entirely, and the
  // visitor gets neither half of what the control promised.
  if (optedOut) {
    try { storage.removeItem(STORAGE_KEY); } catch { /* storage is optional */ }
    try { storage.setItem(OPT_OUT_KEY, "1"); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(OPT_OUT_KEY); } catch { /* storage is optional */ }
  }
}
